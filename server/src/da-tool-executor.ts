import { readFileSync, existsSync } from 'node:fs'
import type { ToolCall } from './thalamus-client'
import type { TeamRuntime } from './team-lifecycle-service'
import {
  sendInputToCCInstance,
  refreshCCInstance,
  type CCInstance,
} from './cc-instance-manager'
import { isIdleStatus } from './cc-status-detector'
import { logger } from './structured-pino-logger'
import { getTranscriptsByRoundRange } from './database/da-transcript-repository'

export interface ToolResult {
  id: string
  name: string
  output: string
  isError: boolean
}

function findCC(runtime: TeamRuntime, ccName: string): CCInstance | undefined {
  return runtime.ccInstances.find(
    (inst) => inst.name === ccName || inst.tmuxSessionName === ccName,
  )
}

async function execSendToCC(
  runtime: TeamRuntime,
  args: { cc_name: string; instruction: string },
): Promise<string> {
  const cc = findCC(runtime, args.cc_name)
  if (!cc) {
    const available = runtime.ccInstances.map((i) => i.name).join(', ')
    return `[ERROR] CC "${args.cc_name}" not found. Available: ${available}`
  }
  sendInputToCCInstance(cc, args.instruction)
  return `Instruction sent to ${cc.name}. CC is now processing.`
}

async function execReadCCOutput(
  runtime: TeamRuntime,
  args: { cc_name: string; tail_lines?: number },
): Promise<string> {
  const cc = findCC(runtime, args.cc_name)
  if (!cc) {
    const available = runtime.ccInstances.map((i) => i.name).join(', ')
    return `[ERROR] CC "${args.cc_name}" not found. Available: ${available}`
  }
  if (!existsSync(cc.outputFilePath)) {
    return `[ERROR] Output file not found at ${cc.outputFilePath}. CC may not have produced output yet.`
  }
  const content = readFileSync(cc.outputFilePath, 'utf-8')
  const lines = content.split('\n')
  const tail = args.tail_lines ?? 50
  const sliced = lines.slice(-tail)
  return `[${cc.name} output, last ${Math.min(tail, lines.length)} of ${lines.length} lines]\n${sliced.join('\n')}`
}

async function execGetAllCCStatus(runtime: TeamRuntime): Promise<string> {
  const statuses: string[] = []
  for (const cc of runtime.ccInstances) {
    refreshCCInstance(cc)
    statuses.push(`  ${cc.name}: ${cc.status}`)
  }
  return `CC Status:\n${statuses.join('\n')}`
}

async function execWaitForIdle(
  runtime: TeamRuntime,
  args: { cc_name: string; timeout_seconds?: number },
): Promise<string> {
  const cc = findCC(runtime, args.cc_name)
  if (!cc) {
    const available = runtime.ccInstances.map((i) => i.name).join(', ')
    return `[ERROR] CC "${args.cc_name}" not found. Available: ${available}`
  }
  const timeoutMs = (args.timeout_seconds ?? 120) * 1000
  const deadline = Date.now() + timeoutMs
  const pollInterval = 2000
  let pollCount = 0

  while (Date.now() < deadline) {
    refreshCCInstance(cc)
    pollCount++
    if (pollCount % 5 === 0) {
      const contentTail = (cc.content ?? '').split('\n').slice(-5).join(' | ')
      logger.info('wait_for_idle_poll', { cc: cc.name, status: cc.status, pollCount, tail: contentTail })
    }
    if (isIdleStatus(cc.status)) {
      logger.info('wait_for_idle_resolved', { cc: cc.name, status: cc.status, pollCount, elapsedMs: timeoutMs - (deadline - Date.now()) })
      return `${cc.name} is now idle (status: ${cc.status}).`
    }
    await Bun.sleep(pollInterval)
  }
  const contentTail = (cc.content ?? '').split('\n').slice(-10).join('\n')
  logger.warn('wait_for_idle_timeout', { cc: cc.name, status: cc.status, pollCount, contentTail })
  return `[TIMEOUT] ${cc.name} did not become idle within ${args.timeout_seconds ?? 120}s. Current status: ${cc.status}`
}

async function execBroadcast(
  runtime: TeamRuntime,
  args: { instruction: string },
): Promise<string> {
  const results: string[] = []
  for (const cc of runtime.ccInstances) {
    try {
      sendInputToCCInstance(cc, args.instruction)
      results.push(`  ${cc.name}: sent`)
    } catch (err) {
      results.push(`  ${cc.name}: FAILED - ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return `Broadcast to ${runtime.ccInstances.length} CCs:\n${results.join('\n')}`
}

async function execQueryConversationHistory(
  runtime: TeamRuntime,
  args: { round_start: number; round_end: number; keyword?: string; include_tool_details?: boolean },
): Promise<string> {
  const startMs = Date.now()
  const typesFilter = args.include_tool_details
    ? undefined
    : (['user_input', 'complete', 'error'] as const)

  let events = await getTranscriptsByRoundRange(
    runtime.teamId,
    args.round_start,
    args.round_end,
    typesFilter as any,
  )

  if (args.keyword) {
    const kw = args.keyword.toLowerCase()
    events = events.filter((e) => {
      if (e.content && e.content.toLowerCase().includes(kw)) return true
      if (e.toolCalls?.some((tc) => tc.name.toLowerCase().includes(kw) || tc.arguments.toLowerCase().includes(kw))) return true
      if (e.toolResults?.some((tr) => tr.output.toLowerCase().includes(kw))) return true
      return false
    })
  }

  logger.info('da_history_query', {
    teamId: runtime.teamId,
    roundStart: args.round_start,
    roundEnd: args.round_end,
    keyword: args.keyword,
    includeToolDetails: args.include_tool_details ?? false,
    resultCount: events.length,
    latencyMs: Date.now() - startMs,
  })

  if (events.length === 0) {
    return `No conversation history found for rounds ${args.round_start}-${args.round_end}${args.keyword ? ` with keyword "${args.keyword}"` : ''}.`
  }

  const lines: string[] = [`Conversation history (rounds ${args.round_start}-${args.round_end}):`]
  for (const e of events) {
    const prefix = `[Round ${e.roundNumber}]`
    switch (e.type) {
      case 'user_input':
        lines.push(`${prefix} User: ${e.content}`)
        break
      case 'thinking':
        lines.push(`${prefix} DA Thinking: ${(e.content ?? '').slice(0, 500)}`)
        break
      case 'tool_call':
        for (const tc of e.toolCalls ?? []) {
          lines.push(`${prefix} Tool: ${tc.name}(${tc.arguments.slice(0, 300)})`)
        }
        break
      case 'tool_result':
        for (const tr of e.toolResults ?? []) {
          lines.push(`${prefix} Result [${tr.isError ? 'ERROR' : 'OK'}]: ${tr.name} → ${tr.output.slice(0, 300)}`)
        }
        break
      case 'complete':
        lines.push(`${prefix} DA: ${e.content}`)
        break
      case 'error':
        lines.push(`${prefix} DA Error: ${e.content}`)
        break
    }
  }

  const output = lines.join('\n')
  return output.length > 8000 ? output.slice(0, 8000) + '\n... (truncated)' : output
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  runtime: TeamRuntime,
): Promise<ToolResult[]> {
  const results = await Promise.all(
    toolCalls.map(async (tc): Promise<ToolResult> => {
      const startMs = Date.now()
      const name = tc.function.name
      let args: any
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        return { id: tc.id, name, output: `[ERROR] Failed to parse arguments: ${tc.function.arguments}`, isError: true }
      }

      logger.info('da_tool_exec_start', { toolCallId: tc.id, toolName: name, args })

      let output: string
      let isError = false
      try {
        switch (name) {
          case 'send_to_cc':
            output = await execSendToCC(runtime, args)
            break
          case 'read_cc_output':
            output = await execReadCCOutput(runtime, args)
            break
          case 'get_all_cc_status':
            output = await execGetAllCCStatus(runtime)
            break
          case 'wait_for_idle':
            output = await execWaitForIdle(runtime, args)
            break
          case 'broadcast':
            output = await execBroadcast(runtime, args)
            break
          case 'query_conversation_history':
            output = await execQueryConversationHistory(runtime, args)
            break
          default:
            output = `[ERROR] Unknown tool: ${name}`
            isError = true
        }
      } catch (err) {
        output = `[ERROR] Tool execution failed: ${err instanceof Error ? err.message : String(err)}`
        isError = true
      }

      if (output.startsWith('[ERROR]') || output.startsWith('[TIMEOUT]')) {
        isError = true
      }

      logger.info('da_tool_exec_done', {
        toolCallId: tc.id,
        toolName: name,
        isError,
        outputLen: output.length,
        latencyMs: Date.now() - startMs,
      })

      return { id: tc.id, name, output, isError }
    }),
  )
  return results
}
