import { logger } from './structured-pino-logger'
import { callThalamus } from './thalamus-client'
import {
  getTranscriptsByRoundRange,
  saveSummary,
  type DATranscriptEvent,
} from './database/da-transcript-repository'

const PARAGRAPH_SIZE = 10
const SUMMARY_MODEL = process.env.DA_SUMMARY_MODEL || undefined

function serializeEventsForSummary(events: DATranscriptEvent[]): string {
  const lines: string[] = []
  for (const e of events) {
    const prefix = `[Round ${e.roundNumber}, Step ${e.step}]`
    switch (e.type) {
      case 'user_input':
        lines.push(`${prefix} User: ${e.content}`)
        break
      case 'thinking':
        lines.push(`${prefix} DA Thinking: ${(e.content ?? '').slice(0, 300)}`)
        break
      case 'tool_call':
        for (const tc of e.toolCalls ?? []) {
          lines.push(`${prefix} Tool Call: ${tc.name}(${tc.arguments.slice(0, 200)})`)
        }
        break
      case 'tool_result':
        for (const tr of e.toolResults ?? []) {
          const status = tr.isError ? 'ERROR' : 'OK'
          lines.push(`${prefix} Tool Result [${status}]: ${tr.name} → ${tr.output.slice(0, 200)}`)
        }
        break
      case 'complete':
        lines.push(`${prefix} DA Complete: ${e.content}`)
        break
      case 'error':
        lines.push(`${prefix} DA Error: ${e.content}`)
        break
    }
  }
  return lines.join('\n')
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

export async function maybeTriggerSummary(teamId: string, roundNumber: number): Promise<void> {
  if (roundNumber % PARAGRAPH_SIZE !== 0) {
    logger.debug('da_summary_skip_not_boundary', { teamId, roundNumber, paragraphSize: PARAGRAPH_SIZE })
    return
  }

  const paragraphIndex = (roundNumber / PARAGRAPH_SIZE) - 1
  const roundStart = paragraphIndex * PARAGRAPH_SIZE + 1
  const roundEnd = roundNumber

  logger.info('da_summary_generation_start', { teamId, paragraphIndex, roundStart, roundEnd })

  try {
    const events = await getTranscriptsByRoundRange(teamId, roundStart, roundEnd)

    if (events.length === 0) {
      logger.warn('da_summary_no_events', { teamId, paragraphIndex, roundStart, roundEnd })
      return
    }

    const serialized = serializeEventsForSummary(events)
    const inputTokenEstimate = estimateTokens(serialized)

    logger.info('da_summary_llm_request', {
      teamId,
      paragraphIndex,
      eventCount: events.length,
      serializedLength: serialized.length,
      inputTokenEstimate,
    })

    const startMs = Date.now()
    const response = await callThalamus(
      [
        {
          role: 'system',
          content:
            'You are a conversation summarizer. Summarize the following DA agent conversation log into a concise paragraph (200-400 words in the same language as the conversation). ' +
            'Focus on: (1) what the user requested, (2) what tasks were dispatched to which CC workers, (3) outcomes (success/failure), (4) any pending issues. ' +
            'Be factual and specific. Include names of CC workers, tools used, and key decisions.',
        },
        {
          role: 'user',
          content: `Summarize rounds ${roundStart}-${roundEnd} of this DA conversation:\n\n${serialized}`,
        },
      ],
      [],
      SUMMARY_MODEL,
    )

    const summaryText = response.message.content ?? '(empty summary)'

    await saveSummary({
      teamId,
      paragraphIndex,
      roundStart,
      roundEnd,
      summary: summaryText,
      generatedAt: new Date(),
      generatorModel: SUMMARY_MODEL || 'default',
      inputTokenEstimate,
    })

    logger.info('da_summary_generated', {
      teamId,
      paragraphIndex,
      roundStart,
      roundEnd,
      summaryLength: summaryText.length,
      latencyMs: Date.now() - startMs,
    })
  } catch (err) {
    logger.error('da_summary_generation_error', {
      teamId,
      paragraphIndex,
      roundStart,
      roundEnd,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
}
