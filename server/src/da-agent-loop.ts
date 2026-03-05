import type { ChatMessage, ToolCall } from './thalamus-client'
import { callThalamus } from './thalamus-client'
import { DA_TOOL_DEFINITIONS } from './da-tool-definitions'
import { executeToolCalls, type ToolResult } from './da-tool-executor'
import { buildDASystemPrompt } from './da-system-prompt'
import type { TeamRuntime } from './team-lifecycle-service'
import * as teamRepo from './database/team-repository'
import { logger } from './structured-pino-logger'

const MAX_ITERATIONS = 30
const MAX_CONTEXT_MESSAGES = 60

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

  logger.info('da_agent_loop_start', { teamId, loopId, userText: userText.slice(0, 200) })

  try {
    const team = await teamRepo.getTeam(teamId)
    const teamName = team?.name || teamId
    const projectPath = team?.config?.defaultProjectPath || '~'

    const systemPrompt = buildDASystemPrompt(teamName, projectPath, runtime.ccInstances)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ]

    for (let step = 0; step < MAX_ITERATIONS; step++) {
      if (abortController.signal.aborted) {
        logger.info('da_agent_loop_abort_detected', { teamId, loopId, step })
        callbacks.onError('Agent loop aborted by user.')
        return
      }

      const stepStartMs = Date.now()
      logger.info('da_agent_step_start', { teamId, loopId, step, messageCount: messages.length })

      const response = await callThalamus(messages, DA_TOOL_DEFINITIONS)

      messages.push(response.message)

      if (response.message.content) {
        logger.info('da_agent_thinking', { teamId, loopId, step, contentLen: response.message.content.length })
        callbacks.onThinking(response.message.content)
      }

      if (response.finishReason !== 'tool_calls' || !response.message.tool_calls?.length) {
        const summary = response.message.content || '(no response)'
        logger.info('da_agent_loop_done', {
          teamId,
          loopId,
          step,
          finishReason: response.finishReason,
          totalLatencyMs: Date.now() - startMs,
        })
        callbacks.onComplete(summary)
        return
      }

      callbacks.onToolCall(response.message.tool_calls)
      logger.info('da_agent_tool_calls', {
        teamId,
        loopId,
        step,
        toolCalls: response.message.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })),
      })

      const toolResults = await executeToolCalls(response.message.tool_calls, runtime)

      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: result.id,
          content: result.output,
        })
      }

      callbacks.onToolResult(toolResults)

      pruneMessages(messages, MAX_CONTEXT_MESSAGES)

      logger.info('da_agent_step_done', {
        teamId,
        loopId,
        step,
        toolResultCount: toolResults.length,
        errCount: toolResults.filter((r) => r.isError).length,
        stepLatencyMs: Date.now() - stepStartMs,
      })
    }

    logger.warn('da_agent_loop_max_iterations', { teamId, loopId, maxIterations: MAX_ITERATIONS })
    callbacks.onComplete(`[DA reached maximum ${MAX_ITERATIONS} iterations. Stopping.]`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('da_agent_loop_error', {
      teamId,
      loopId,
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
      latencyMs: Date.now() - startMs,
    })
    callbacks.onError(errMsg)
  } finally {
    runningLoops.delete(teamId)
  }
}
