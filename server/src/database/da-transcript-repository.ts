import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { logger } from '../structured-pino-logger'

export interface DATranscriptEvent {
  _id?: ObjectId
  teamId: string
  loopId: string
  roundNumber: number
  step: number
  type: 'user_input' | 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error'
  content?: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  toolResults?: Array<{ id: string; name: string; output: string; isError: boolean }>
  timestamp: Date
}

export interface DAConversationSummary {
  _id?: ObjectId
  teamId: string
  paragraphIndex: number
  roundStart: number
  roundEnd: number
  summary: string
  generatedAt: Date
  generatorModel: string
  inputTokenEstimate: number
}

export interface DARoundCounter {
  _id?: ObjectId
  teamId: string
  currentRound: number
  updatedAt: Date
}

const memTranscripts = new Map<string, DATranscriptEvent[]>()
const memSummaries = new Map<string, DAConversationSummary[]>()
const memCounters = new Map<string, number>()

function isMongoAvailable(): boolean {
  try { getDb(); return true } catch { return false }
}

function transcriptCol(): Collection<DATranscriptEvent> {
  return getDb().collection<DATranscriptEvent>('da_transcripts')
}

function summaryCol(): Collection<DAConversationSummary> {
  return getDb().collection<DAConversationSummary>('da_conversation_summaries')
}

function counterCol(): Collection<DARoundCounter> {
  return getDb().collection<DARoundCounter>('da_round_counters')
}

// ─── Round Counter ───

export async function incrementRound(teamId: string): Promise<number> {
  const startMs = Date.now()
  let roundNumber: number

  if (isMongoAvailable()) {
    const result = await counterCol().findOneAndUpdate(
      { teamId },
      { $inc: { currentRound: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    )
    roundNumber = result!.currentRound
  } else {
    const current = memCounters.get(teamId) ?? 0
    roundNumber = current + 1
    memCounters.set(teamId, roundNumber)
  }

  logger.info('da_round_incremented', { teamId, roundNumber, latencyMs: Date.now() - startMs })
  return roundNumber
}

export async function getCurrentRound(teamId: string): Promise<number> {
  if (isMongoAvailable()) {
    const doc = await counterCol().findOne({ teamId })
    return doc?.currentRound ?? 0
  }
  return memCounters.get(teamId) ?? 0
}

// ─── Transcript Events ───

export async function appendTranscript(event: Omit<DATranscriptEvent, '_id' | 'timestamp'>): Promise<void> {
  const startMs = Date.now()
  const doc: DATranscriptEvent = { ...event, timestamp: new Date() }

  try {
    if (isMongoAvailable()) {
      await transcriptCol().insertOne(doc)
    } else {
      const list = memTranscripts.get(event.teamId) ?? []
      list.push(doc)
      memTranscripts.set(event.teamId, list)
    }

    logger.info('da_transcript_persisted', {
      teamId: event.teamId,
      loopId: event.loopId,
      roundNumber: event.roundNumber,
      step: event.step,
      type: event.type,
      contentLen: event.content?.length ?? 0,
      toolCallCount: event.toolCalls?.length ?? 0,
      toolResultCount: event.toolResults?.length ?? 0,
      latencyMs: Date.now() - startMs,
    })
  } catch (err) {
    logger.error('da_transcript_persist_error', {
      teamId: event.teamId,
      loopId: event.loopId,
      roundNumber: event.roundNumber,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function getTranscriptsByRoundRange(
  teamId: string,
  roundStart: number,
  roundEnd: number,
  typesFilter?: DATranscriptEvent['type'][],
): Promise<DATranscriptEvent[]> {
  const startMs = Date.now()
  let results: DATranscriptEvent[]

  if (isMongoAvailable()) {
    const query: Record<string, unknown> = {
      teamId,
      roundNumber: { $gte: roundStart, $lte: roundEnd },
    }
    if (typesFilter?.length) {
      query.type = { $in: typesFilter }
    }
    results = await transcriptCol()
      .find(query)
      .sort({ roundNumber: 1, step: 1 })
      .toArray()
  } else {
    const all = memTranscripts.get(teamId) ?? []
    results = all.filter(
      (e) =>
        e.roundNumber >= roundStart &&
        e.roundNumber <= roundEnd &&
        (!typesFilter?.length || typesFilter.includes(e.type)),
    )
  }

  logger.info('da_transcripts_queried', {
    teamId,
    roundStart,
    roundEnd,
    typesFilter,
    resultCount: results.length,
    latencyMs: Date.now() - startMs,
  })
  return results
}

export async function getTranscriptsByLoopId(
  teamId: string,
  loopId: string,
): Promise<DATranscriptEvent[]> {
  if (isMongoAvailable()) {
    return transcriptCol().find({ teamId, loopId }).sort({ step: 1 }).toArray()
  }
  return (memTranscripts.get(teamId) ?? []).filter((e) => e.loopId === loopId)
}

export async function getRecentTranscripts(
  teamId: string,
  limit = 200,
): Promise<DATranscriptEvent[]> {
  if (isMongoAvailable()) {
    return transcriptCol()
      .find({ teamId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
      .then((docs) => docs.reverse())
  }
  const all = memTranscripts.get(teamId) ?? []
  return all.slice(-limit)
}

// ─── Conversation Summaries ───

export async function saveSummary(summary: Omit<DAConversationSummary, '_id'>): Promise<void> {
  const startMs = Date.now()

  try {
    if (isMongoAvailable()) {
      await summaryCol().updateOne(
        { teamId: summary.teamId, paragraphIndex: summary.paragraphIndex },
        { $set: summary },
        { upsert: true },
      )
    } else {
      const list = memSummaries.get(summary.teamId) ?? []
      const idx = list.findIndex((s) => s.paragraphIndex === summary.paragraphIndex)
      if (idx >= 0) list[idx] = summary as DAConversationSummary
      else list.push(summary as DAConversationSummary)
      memSummaries.set(summary.teamId, list)
    }

    logger.info('da_summary_saved', {
      teamId: summary.teamId,
      paragraphIndex: summary.paragraphIndex,
      roundStart: summary.roundStart,
      roundEnd: summary.roundEnd,
      summaryLength: summary.summary.length,
      latencyMs: Date.now() - startMs,
    })
  } catch (err) {
    logger.error('da_summary_save_error', {
      teamId: summary.teamId,
      paragraphIndex: summary.paragraphIndex,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function getSummariesForTeam(teamId: string): Promise<DAConversationSummary[]> {
  const startMs = Date.now()
  let results: DAConversationSummary[]

  if (isMongoAvailable()) {
    results = await summaryCol().find({ teamId }).sort({ paragraphIndex: 1 }).toArray()
  } else {
    results = (memSummaries.get(teamId) ?? []).sort(
      (a, b) => a.paragraphIndex - b.paragraphIndex,
    )
  }

  logger.info('da_summaries_loaded', {
    teamId,
    count: results.length,
    latencyMs: Date.now() - startMs,
  })
  return results
}
