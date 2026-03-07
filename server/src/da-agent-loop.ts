import type { ChatMessage, ToolCall } from './thalamus-client'
import { callThalamus } from './thalamus-client'
import { DA_TOOL_DEFINITIONS } from './da-tool-definitions'
import { executeToolCalls, type ToolResult } from './da-tool-executor'
import { buildDASystemPrompt } from './da-system-prompt'
import type { TeamRuntime } from './team-lifecycle-service'
import * as teamRepo from './database/team-repository'
import { logger } from './structured-pino-logger'
import {
  incrementRound,
  appendTranscript,
  getTranscriptsByRoundRange,
  getSummariesForTeam,
} from './database/da-transcript-repository'
import { maybeTriggerSummary } from './da-conversation-summary'

const MAX_ITERATIONS = 30
const MAX_CONTEXT_MESSAGES = 60
const RECENT_ROUNDS_WINDOW = 10
const MAX_RECENT_TOKENS = 4000
const MAX_SAME_PATTERN_REPEATS = 3

function toolCallSignature(toolCalls: ToolCall[]): string {
  return toolCalls
    .map((tc) => tc.function.name)
    .sort()
    .join(',')
}

export interface AgentLoopCallbacks {
  onThinking: (content: string) => void
  onToolCall: (toolCalls: ToolCall[]) => void
  onToolResult: (results: ToolResult[]) => void
  onComplete: (summary: string) => void
  onError: (error: string) => void
}

const runningLoops = new Map<string, AbortController>()

export function abortAgentLoop(teamId: string): boolean {
  const ctrl = runningLoops.get(teamId)
  if (ctrl) {
    ctrl.abort()
    runningLoops.delete(teamId)
    logger.info('da_agent_loop_aborted', { teamId })
    return true
  }
  return false
}

function pruneMessages(messages: ChatMessage[], maxMessages: number): void {
  if (messages.length <= maxMessages) return
  const keep = maxMessages - 2
  const head = [messages[0], messages[1]]
  const tail = messages.slice(-keep)
  messages.length = 0
  messages.push(...head, ...tail)
  logger.info('da_context_pruned', { prunedTo: messages.length })
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

async function buildConversationContext(teamId: string, roundNumber: number): Promise<string> {
  const startMs = Date.now()
  const sections: string[] = []

  sections.push(`You are in round **${roundNumber}** of this team's conversation.\n`)

  const summaries = await getSummariesForTeam(teamId)
  let summaryTokens = 0
  if (summaries.length > 0) {
    sections.push('### Earlier conversation summaries\n')
    for (const s of summaries) {
      const line = `**Rounds ${s.roundStart}-${s.roundEnd}:** ${s.summary}\n`
      sections.push(line)
      summaryTokens += estimateTokens(line)
    }
  }

  const recentStart = Math.max(1, roundNumber - RECENT_ROUNDS_WINDOW)
  const recentEnd = roundNumber - 1
  let recentRoundsCount = 0
  let recentTokens = 0

  if (recentEnd >= recentStart) {
    const recentEvents = await getTranscriptsByRoundRange(
      teamId,
      recentStart,
      recentEnd,
      ['user_input', 'complete', 'error'],
    )

    if (recentEvents.length > 0) {
      sections.push('### Recent conversation (last rounds)\n')
      const recentLines: string[] = []
      const roundsSeen = new Set<number>()

      for (const e of recentEvents) {
        roundsSeen.add(e.roundNumber)
        const prefix = `[Round ${e.roundNumber}]`
        if (e.type === 'user_input') {
          recentLines.push(`${prefix} User: ${e.content}`)
        } else if (e.type === 'complete') {
          recentLines.push(`${prefix} DA: ${e.content}`)
        } else if (e.type === 'error') {
          recentLines.push(`${prefix} DA Error: ${e.content}`)
        }
      }

      let text = recentLines.join('\n')
      recentTokens = estimateTokens(text)
      recentRoundsCount = roundsSeen.size

      if (recentTokens > MAX_RECENT_TOKENS) {
        const halfLines = recentLines.slice(-Math.floor(recentLines.length / 2))
        text = '... (earlier rounds truncated)\n' + halfLines.join('\n')
        recentTokens = estimateTokens(text)
      }

      sections.push(text + '\n')
    }
  }

  const contextBlock = sections.join('\n')
  const totalTokens = estimateTokens(contextBlock)

  logger.info('da_context_assembled', {
    teamId,
    roundNumber,
    summaryCount: summaries.length,
    recentRoundsCount,
    summaryTokens,
    recentTokens,
    totalContextTokens: totalTokens,
    latencyMs: Date.now() - startMs,
  })

  return contextBlock
}

export async function runAgentLoop(
  runtime: TeamRuntime,
  userText: string,
  callbacks: AgentLoopCallbacks,
): Promise<void> {
  const teamId = runtime.teamId
  const loopId = `da_loop_${crypto.randomUUID().slice(0, 8)}`
  const startMs = Date.now()

  const abortController = new AbortController()
  runningLoops.set(teamId, abortController)

  const roundNumber = await incrementRound(teamId)

  logger.info('da_agent_loop_start', { teamId, loopId, roundNumber, userText: userText.slice(0, 200) })

  await appendTranscript({
    teamId,
    loopId,
    roundNumber,
    step: 0,
    type: 'user_input',
    content: userText,
  })

  try {
    const team = await teamRepo.getTeam(teamId)
    const teamName = team?.name || teamId
    const projectPath = team?.config?.defaultProjectPath || '~'

    const conversationContext = await buildConversationContext(teamId, roundNumber)
    const systemPrompt = buildDASystemPrompt(teamName, projectPath, runtime.ccInstances, conversationContext)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ]

    let lastToolSig = ''
    let samePatternCount = 0
    let forceStopIssued = false

    for (let step = 1; step <= MAX_ITERATIONS; step++) {
      if (abortController.signal.aborted) {
        logger.info('da_agent_loop_abort_detected', { teamId, loopId, roundNumber, step })
        await appendTranscript({ teamId, loopId, roundNumber, step, type: 'error', content: 'Agent loop aborted by user.' })
        callbacks.onError('Agent loop aborted by user.')
        return
      }

      const stepStartMs = Date.now()
      logger.info('da_agent_step_start', { teamId, loopId, roundNumber, step, messageCount: messages.length })

      const response = await callThalamus(messages, forceStopIssued ? [] : DA_TOOL_DEFINITIONS)

      messages.push(response.message)

      const hasToolCalls = response.finishReason === 'tool_calls' && response.message.tool_calls?.length
      if (response.message.content && !hasToolCalls) {
        logger.info('da_agent_thinking', { teamId, loopId, roundNumber, step, contentLen: response.message.content.length })
        await appendTranscript({ teamId, loopId, roundNumber, step, type: 'thinking', content: response.message.content })
        callbacks.onThinking(response.message.content)
      }

      if (!hasToolCalls) {
        if (step === 1) {
          logger.warn('da_agent_no_tools_step1', {
            teamId, loopId, roundNumber, finishReason: response.finishReason,
            contentPreview: (response.message.content || '').slice(0, 100),
          })
          messages.push({
            role: 'user',
            content:
              'You MUST use your tools. Start by calling get_all_cc_status to check worker availability, ' +
              'then dispatch the task using send_to_cc. Do NOT reply without using tools first.',
          })
          continue
        }

        const summary = response.message.content || '(no response)'
        logger.info('da_agent_loop_done', {
          teamId, loopId, roundNumber, step,
          finishReason: response.finishReason,
          totalLatencyMs: Date.now() - startMs,
        })
        await appendTranscript({ teamId, loopId, roundNumber, step, type: 'complete', content: summary })
        callbacks.onComplete(summary)

        maybeTriggerSummary(teamId, roundNumber).catch((err) => {
          logger.error('da_summary_trigger_fire_and_forget_error', { teamId, roundNumber, error: String(err) })
        })
        return
      }

      if (forceStopIssued) {
        const forceSummary = response.message.content || '[DA force-stopped: model kept calling tools after repetition warning]'
        logger.warn('da_agent_loop_force_stopped', {
          teamId, loopId, roundNumber, step,
          toolCallsIgnored: response.message.tool_calls!.map((tc) => tc.function.name),
        })
        await appendTranscript({ teamId, loopId, roundNumber, step, type: 'complete', content: forceSummary })
        callbacks.onComplete(forceSummary)
        maybeTriggerSummary(teamId, roundNumber).catch((err) => {
          logger.error('da_summary_trigger_fire_and_forget_error', { teamId, roundNumber, error: String(err) })
        })
        return
      }

      const currentSig = toolCallSignature(response.message.tool_calls!)
      if (currentSig === lastToolSig) {
        samePatternCount++
      } else {
        lastToolSig = currentSig
        samePatternCount = 1
      }

      if (samePatternCount >= MAX_SAME_PATTERN_REPEATS) {
        logger.warn('da_agent_loop_repetition_detected', {
          teamId, loopId, roundNumber, step,
          pattern: currentSig,
          repeatCount: samePatternCount,
        })
        forceStopIssued = true

        messages.push({
          role: 'user',
          content:
            `[SYSTEM] You have repeated the exact same tool call pattern (${currentSig}) ${samePatternCount} times in a row. ` +
            'The task appears to be complete based on prior tool results. ' +
            'You MUST now stop calling tools and provide a final summary of what was accomplished. ' +
            'Do NOT call any more tools. Just respond with your final report.',
        })
        continue
      }

      await appendTranscript({
        teamId, loopId, roundNumber, step,
        type: 'tool_call',
        toolCalls: response.message.tool_calls!.map((tc) => ({
          id: tc.id, name: tc.function.name, arguments: tc.function.arguments,
        })),
      })
      callbacks.onToolCall(response.message.tool_calls!)
      logger.info('da_agent_tool_calls', {
        teamId, loopId, roundNumber, step,
        toolCalls: response.message.tool_calls!.map((tc) => ({ id: tc.id, name: tc.function.name })),
      })

      const toolResults = await executeToolCalls(response.message.tool_calls!, runtime)

      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: result.id,
          content: result.output,
        })
      }

      await appendTranscript({
        teamId, loopId, roundNumber, step,
        type: 'tool_result',
        toolResults: toolResults.map((r) => ({
          id: r.id, name: r.name, output: r.output, isError: r.isError,
        })),
      })
      callbacks.onToolResult(toolResults)

      pruneMessages(messages, MAX_CONTEXT_MESSAGES)

      logger.info('da_agent_step_done', {
        teamId, loopId, roundNumber, step,
        toolResultCount: toolResults.length,
        errCount: toolResults.filter((r) => r.isError).length,
        samePatternCount,
        stepLatencyMs: Date.now() - stepStartMs,
      })
    }

    logger.warn('da_agent_loop_max_iterations', { teamId, loopId, roundNumber, maxIterations: MAX_ITERATIONS })
    await appendTranscript({ teamId, loopId, roundNumber, step: MAX_ITERATIONS, type: 'complete', content: `[DA reached maximum ${MAX_ITERATIONS} iterations. Stopping.]` })
    callbacks.onComplete(`[DA reached maximum ${MAX_ITERATIONS} iterations. Stopping.]`)

    maybeTriggerSummary(teamId, roundNumber).catch((err) => {
      logger.error('da_summary_trigger_fire_and_forget_error', { teamId, roundNumber, error: String(err) })
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('da_agent_loop_error', {
      teamId, loopId, roundNumber,
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
      latencyMs: Date.now() - startMs,
    })
    await appendTranscript({ teamId, loopId, roundNumber, step: -1, type: 'error', content: errMsg }).catch(() => {})
    callbacks.onError(errMsg)
  } finally {
    runningLoops.delete(teamId)
  }
}
