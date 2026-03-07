import {
  createCCInstance,
  startCCInstance,
  waitCCReady,
  stopCCInstance,
  sendInputToCCInstance,
  type CCInstance,
} from './cc-instance-manager'
import { isIdleStatus } from './cc-status-detector'
import { readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import {
  createDelegateAgent,
  destroyDelegateAgent,
  handleDAInput,
  type DelegateAgentOrchestrator,
} from './delegate-agent-orchestrator'
import { runAgentLoop, abortAgentLoop, type AgentLoopCallbacks } from './da-agent-loop'
import * as teamRepo from './database/team-repository'
import * as sessionRepo from './database/session-repository'
import * as messageRepo from './database/message-repository'
import { logger } from './structured-pino-logger'
import {
  buildRunningTeamStatus,
  buildTeamStartupStatus,
} from './team-runtime-status'
import type { TeamRuntimeStatus } from './shared/shared-message-and-session-types'

export interface TeamRuntime {
  teamId: string
  da: DelegateAgentOrchestrator
  ccInstances: CCInstance[]
  ccSessionIds: Map<string, string>
  daSessionId: string
}

export { abortAgentLoop }

const activeTeams = new Map<string, TeamRuntime>()

export function getActiveTeam(teamId: string): TeamRuntime | undefined {
  return activeTeams.get(teamId)
}

export function getAllActiveTeams(): TeamRuntime[] {
  return Array.from(activeTeams.values())
}

/**
 * Find the most recently modified Claude Code session JSONL for a given project path.
 * Returns the UUID (filename without .jsonl) which is Claude's internal session ID.
 * @param sinceMs Only consider files modified after this timestamp (ms). Defaults to 0 (any time).
 */
function findLatestClaudeSessionId(projectPath: string, sinceMs = 0): string | undefined {
  const homedir = process.env.HOME || process.env.USERPROFILE || ''
  const resolved = projectPath.replace(/^~/, homedir)
  const slug = '-' + resolved.replace(/^\//, '').replace(/[/.]/g, '-')
  const claudeDir = join(homedir, '.claude', 'projects', slug)
  try {
    const files = readdirSync(claudeDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        mtime: statSync(join(claudeDir, f)).mtimeMs,
      }))
      .filter(f => f.mtime >= sinceMs)
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length > 0) {
      return basename(files[0].name, '.jsonl')
    }
  } catch {
    // dir doesn't exist yet or no files
  }
  return undefined
}

export async function startTeam(
  teamId: string,
  onStatusUpdate?: (teamId: string, statuses: Record<string, string>) => void,
  onAllComplete?: (teamId: string, summary: string) => void,
  onRuntimeStatus?: (status: TeamRuntimeStatus) => void,
): Promise<TeamRuntime> {
  const startMs = Date.now()
  logger.info({ teamId, activeTeamCount: activeTeams.size, event: 'team_lifecycle_start_begin' })

  if (activeTeams.has(teamId)) {
    logger.warn({ teamId, event: 'team_lifecycle_start_already_running' })
    throw new Error(`Team ${teamId} is already running`)
  }

  const team = await teamRepo.getTeam(teamId)
  if (!team) {
    logger.error({ teamId, event: 'team_lifecycle_start_not_found' })
    throw new Error(`Team ${teamId} not found`)
  }

  const members = team.config.members ?? Array.from(
    { length: team.config.ccCount || 1 },
    (_, i) => ({
      name: `agent-${i + 1}`,
      agentType: 'claude-code' as const,
      command: 'claude',
      projectPath: team.config.defaultProjectPath,
    }),
  )

  logger.info('team_lifecycle_config_loaded', { teamId, teamName: team.name, memberCount: members.length, defaultProjectPath: team.config.defaultProjectPath })

  const ccInstances: CCInstance[] = []
  const ccSessionIds = new Map<string, string>()

  const memberRuntimes = members.map((member, i) => {
    const tmuxName = `${teamId.slice(0, 8)}-cc-${i}`
    const command = member.command || (member.agentType === 'codex' ? 'codex' : 'claude')
    const projectPath = member.projectPath || team.config.defaultProjectPath
    const instance = createCCInstance(member.name, tmuxName, member.agentType, i)
    return { member, tmuxName, command, projectPath, instance }
  })

  ccInstances.push(...memberRuntimes.map((runtime) => runtime.instance))

  const buildStartupOverrides = (currentIndex?: number, currentStatus = 'starting') => {
    const overrides: Record<string, string> = {}
    for (let i = 0; i < ccInstances.length; i++) {
      const instance = ccInstances[i]
      if (currentIndex == null) {
        overrides[instance.name] = 'queued'
      } else if (i < currentIndex) {
        overrides[instance.name] = instance.status
      } else if (i === currentIndex) {
        overrides[instance.name] = currentStatus
      } else {
        overrides[instance.name] = 'queued'
      }
    }
    return overrides
  }

  const emitRuntimeStatus = (
    startup: ReturnType<typeof buildTeamStartupStatus> | null,
    daSessionId: string | null = null,
    ccStatusOverrides?: Record<string, string>,
  ) => {
    onRuntimeStatus?.(
      buildRunningTeamStatus({
        teamId,
        ccInstances,
        daSessionId,
        startup,
        ccStatusOverrides,
      }),
    )
  }

  emitRuntimeStatus(
    buildTeamStartupStatus({
      phase: 'initializing',
      readyCount: 0,
      totalCount: ccInstances.length,
    }),
    null,
    buildStartupOverrides(),
  )

  for (let i = 0; i < memberRuntimes.length; i++) {
    const { member, tmuxName, command, projectPath, instance } = memberRuntimes[i]

    logger.info({ teamId, memberIndex: i, memberName: member.name, agentType: member.agentType, tmuxName, command, projectPath, event: 'cc_instance_starting' })

    try {
      emitRuntimeStatus(
        buildTeamStartupStatus({
          phase: 'launching_cc',
          readyCount: i,
          totalCount: ccInstances.length,
          currentCCName: member.name,
        }),
        null,
        buildStartupOverrides(i),
      )

      const ccStartMs = Date.now()

      let actualCommand = command
      const priorSession = await sessionRepo.getLatestCCSessionForResume(teamId, i)
      if (priorSession?.lastAgentSessionId && command === 'claude') {
        actualCommand = `claude --resume ${priorSession.lastAgentSessionId}`
        logger.info({ teamId, memberName: member.name, resumeSessionId: priorSession.lastAgentSessionId, event: 'cc_instance_resuming' })
      }

      await startCCInstance(instance, projectPath, actualCommand)
      const wasReused = isIdleStatus(instance.status) || instance.status === 'processing' || instance.status === 'completed'
      logger.info({ teamId, memberName: member.name, tmuxName, reused: wasReused, resumed: actualCommand !== command, latencyMs: Date.now() - ccStartMs, event: 'cc_instance_tmux_created' })

      if (wasReused) {
        // Session was reused — CC is already running with prior conversation visible.
        // Skip waitCCReady and /model since it's already configured.
        logger.info({ teamId, memberName: member.name, status: instance.status, event: 'cc_instance_reused_skip_setup' })
      } else {
        emitRuntimeStatus(
          buildTeamStartupStatus({
            phase: 'waiting_for_ready',
            readyCount: i,
            totalCount: ccInstances.length,
            currentCCName: member.name,
          }),
          null,
          buildStartupOverrides(i),
        )

        const readyStartMs = Date.now()
        await waitCCReady(instance, 60000)
        logger.info({ teamId, memberName: member.name, tmuxName, readyLatencyMs: Date.now() - readyStartMs, event: 'cc_instance_ready' })

        // Auto-set CC model to match DA
        const ccModel = process.env.THALAMUS_MODEL || 'fast'
        sendInputToCCInstance(instance, `/model ${ccModel}`)
        logger.info({ teamId, memberName: member.name, model: ccModel, event: 'cc_model_set' })
        await Bun.sleep(2000)
        await waitCCReady(instance, 30000)
      }

      const sessionDoc = await sessionRepo.createSession({
        teamId,
        role: 'cc',
        memberIndex: i,
        tmuxSessionName: tmuxName,
        agentType: member.agentType,
        projectPath,
      })
      ccSessionIds.set(instance.name, sessionDoc.sessionId)
      logger.info({ teamId, memberName: member.name, sessionId: sessionDoc.sessionId, event: 'cc_session_persisted' })

      // Eagerly find and save Claude Code session ID for future --resume
      const ccAgentSessionId = findLatestClaudeSessionId(projectPath, ccStartMs > 0 ? ccStartMs : 0)
      if (ccAgentSessionId) {
        await sessionRepo.updateAgentSessionId(sessionDoc.sessionId, ccAgentSessionId)
        logger.info({ teamId, memberName: member.name, agentSessionId: ccAgentSessionId, event: 'cc_agent_session_id_saved_eager' })
      } else if (!wasReused) {
        logger.warn({ teamId, memberName: member.name, event: 'cc_agent_session_id_not_found_eager' })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ teamId, memberName: member.name, tmuxName, error: errMsg, stack: err instanceof Error ? err.stack : undefined, startedCount: ccInstances.length, event: 'cc_instance_start_failed' })
      for (const started of ccInstances) {
        try { stopCCInstance(started) } catch {}
      }
      throw err
    }
  }

  const daSessionDoc = await sessionRepo.createSession({
    teamId,
    role: 'da',
    tmuxSessionName: `${teamId.slice(0, 8)}-da`,
    projectPath: team.config.defaultProjectPath,
  })
  logger.info({ teamId, daSessionId: daSessionDoc.sessionId, event: 'da_session_created' })

  emitRuntimeStatus(
    buildTeamStartupStatus({
      phase: 'creating_da',
      readyCount: ccInstances.length,
      totalCount: ccInstances.length,
    }),
    daSessionDoc.sessionId,
  )

  const da = createDelegateAgent(teamId, ccInstances)
  da.onStatusUpdate = (statuses) => onStatusUpdate?.(teamId, statuses)
  da.onAllComplete = (summary) => onAllComplete?.(teamId, summary)

  const runtime: TeamRuntime = {
    teamId,
    da,
    ccInstances,
    ccSessionIds,
    daSessionId: daSessionDoc.sessionId,
  }

  activeTeams.set(teamId, runtime)
  logger.info({ teamId, teamName: team.name, ccCount: ccInstances.length, daSessionId: daSessionDoc.sessionId, totalLatencyMs: Date.now() - startMs, event: 'team_lifecycle_start_success' })
  return runtime
}

export async function stopTeam(
  teamId: string,
  resolveAgentSessionId?: (tmuxSessionName: string) => string | undefined,
  killSessions = false,
): Promise<void> {
  const startMs = Date.now()
  const runtime = activeTeams.get(teamId)
  if (!runtime) {
    logger.debug({ teamId, event: 'team_lifecycle_stop_noop' })
    return
  }

  logger.info({ teamId, ccCount: runtime.ccInstances.length, event: 'team_lifecycle_stop_begin' })

  // Save CC agent session IDs for future --resume before stopping
  const team = await teamRepo.getTeam(teamId)
  const projectPath = team?.config?.defaultProjectPath || ''
  for (const instance of runtime.ccInstances) {
    const ccSessionId = runtime.ccSessionIds.get(instance.name)
    if (!ccSessionId) continue

    let agentSessionId = resolveAgentSessionId?.(instance.tmuxSessionName)
    if (!agentSessionId && projectPath) {
      agentSessionId = findLatestClaudeSessionId(projectPath)
      if (agentSessionId) {
        logger.info({ teamId, memberName: instance.name, agentSessionId, method: 'jsonl-fallback', event: 'cc_agent_session_id_resolved' })
      }
    }
    if (agentSessionId) {
      await sessionRepo.updateAgentSessionId(ccSessionId, agentSessionId)
      logger.info({ teamId, memberName: instance.name, agentSessionId, event: 'cc_agent_session_id_saved' })
    } else {
      logger.warn({ teamId, memberName: instance.name, event: 'cc_agent_session_id_not_found' })
    }
  }

  destroyDelegateAgent(runtime.da)
  logger.info({ teamId, event: 'da_orchestrator_destroyed' })

  for (const instance of runtime.ccInstances) {
    try {
      stopCCInstance(instance, !killSessions)
      logger.info({ teamId, memberName: instance.name, killed: killSessions, event: 'cc_instance_stopped' })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ teamId, memberName: instance.name, error: errMsg, event: 'cc_instance_stop_failed' })
    }
  }

  const sessions = await sessionRepo.getSessionsByTeam(teamId)
  for (const session of sessions) {
    await sessionRepo.updateSessionStatus(session.sessionId, 'stopped')
  }
  logger.info({ teamId, sessionsUpdated: sessions.length, event: 'team_sessions_marked_stopped' })

  activeTeams.delete(teamId)
  logger.info({ teamId, latencyMs: Date.now() - startMs, event: 'team_lifecycle_stop_success' })
}

export async function sendDAInput(
  teamId: string,
  text: string,
  callbacks: AgentLoopCallbacks,
): Promise<{ messageId: string }> {
  const startMs = Date.now()
  const runtime = activeTeams.get(teamId)
  if (!runtime) {
    logger.warn({ teamId, event: 'da_input_team_not_running' })
    throw new Error(`Team ${teamId} is not running`)
  }

  logger.info({ teamId, textLen: text.length, textPreview: text.slice(0, 80), ccTargets: runtime.ccInstances.map(i => i.name), event: 'da_input_via_agent_loop' })

  const userMsg = await messageRepo.insertMessage({
    sessionId: runtime.daSessionId,
    teamId,
    role: 'user',
    content: text,
    metadata: {
      targetCCs: runtime.ccInstances.map((i) => i.name),
    },
  })
  logger.info({ teamId, messageId: userMsg.messageId, event: 'da_user_message_persisted' })

  runAgentLoop(runtime, text, {
    ...callbacks,
    onComplete: async (summary) => {
      await messageRepo.insertMessage({
        sessionId: runtime.daSessionId,
        teamId,
        role: 'da',
        content: summary,
      })
      logger.info({ teamId, latencyMs: Date.now() - startMs, event: 'da_agent_loop_persisted_summary' })
      callbacks.onComplete(summary)
    },
  }).catch((err) => {
    logger.error({ teamId, error: err instanceof Error ? err.message : String(err), event: 'da_agent_loop_unhandled_error' })
  })

  return { messageId: userMsg.messageId }
}

export async function sendDAInputLegacy(
  teamId: string,
  text: string,
): Promise<{ errors: string[]; messageId: string }> {
  const startMs = Date.now()
  const runtime = activeTeams.get(teamId)
  if (!runtime) {
    logger.warn({ teamId, event: 'da_input_team_not_running' })
    throw new Error(`Team ${teamId} is not running`)
  }

  logger.info({ teamId, textLen: text.length, textPreview: text.slice(0, 80), ccTargets: runtime.ccInstances.map(i => i.name), event: 'da_input_processing_legacy' })

  const userMsg = await messageRepo.insertMessage({
    sessionId: runtime.daSessionId,
    teamId,
    role: 'user',
    content: text,
    metadata: {
      targetCCs: runtime.ccInstances.map((i) => i.name),
    },
  })

  const errors = handleDAInput(runtime.da, text)

  const ccCount = runtime.ccInstances.length
  const confirmText = errors.length > 0
    ? `发送到 ${ccCount - errors.length}/${ccCount} 个 CC（${errors.length} 个失败）`
    : `已发送到所有 ${ccCount} 个 CC`

  await messageRepo.insertMessage({
    sessionId: runtime.daSessionId,
    teamId,
    role: 'da',
    content: confirmText,
  })

  logger.info({ teamId, messageId: userMsg.messageId, ccCount, errorCount: errors.length, latencyMs: Date.now() - startMs, event: 'da_input_complete_legacy' })
  return { errors, messageId: userMsg.messageId }
}

export async function getDAHistory(teamId: string, limit = 100): Promise<messageRepo.MessageDocument[]> {
  const startMs = Date.now()
  const runtime = activeTeams.get(teamId)
  const daSessionId = runtime?.daSessionId

  let messages: messageRepo.MessageDocument[]
  if (!daSessionId) {
    messages = await messageRepo.getMessagesByTeam(teamId, limit)
    logger.info({ teamId, source: 'team', messageCount: messages.length, latencyMs: Date.now() - startMs, event: 'da_history_loaded' })
  } else {
    messages = await messageRepo.getMessagesBySession(daSessionId, limit)
    logger.info({ teamId, source: 'session', daSessionId, messageCount: messages.length, latencyMs: Date.now() - startMs, event: 'da_history_loaded' })
  }
  return messages
}
