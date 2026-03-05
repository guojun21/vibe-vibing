import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { randomUUID } from 'node:crypto'

export interface MessageDocument {
  _id?: ObjectId
  messageId: string
  sessionId: string
  teamId: string
  role: 'user' | 'da' | 'system'
  content: string
  timestamp: Date
  metadata: {
    targetCCs?: string[]
    ccResponses?: Record<string, string>
  }
}

const memoryStore: MessageDocument[] = []

function isMongoAvailable(): boolean {
  try { getDb(); return true } catch { return false }
}

function collection(): Collection<MessageDocument> {
  return getDb().collection<MessageDocument>('messages')
}

export async function insertMessage(params: {
  sessionId: string
  teamId: string
  role: 'user' | 'da' | 'system'
  content: string
  metadata?: MessageDocument['metadata']
}): Promise<MessageDocument> {
  const doc: MessageDocument = {
    messageId: randomUUID(),
    sessionId: params.sessionId,
    teamId: params.teamId,
    role: params.role,
    content: params.content,
    timestamp: new Date(),
    metadata: params.metadata || {},
  }
  if (isMongoAvailable()) {
    await collection().insertOne(doc)
  } else {
    memoryStore.push(doc)
  }
  return doc
}

export async function getMessagesByTeam(teamId: string, limit = 100, before?: Date): Promise<MessageDocument[]> {
  if (isMongoAvailable()) {
    const query: Record<string, unknown> = { teamId }
    if (before) query.timestamp = { $lt: before }
    return collection().find(query).sort({ timestamp: -1 }).limit(limit).toArray()
  }
  let msgs = memoryStore.filter(m => m.teamId === teamId)
  if (before) msgs = msgs.filter(m => m.timestamp < before)
  return msgs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit)
}

export async function getMessagesBySession(sessionId: string, limit = 100): Promise<MessageDocument[]> {
  if (isMongoAvailable()) {
    return collection().find({ sessionId }).sort({ timestamp: -1 }).limit(limit).toArray()
  }
  return memoryStore
    .filter(m => m.sessionId === sessionId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
}

export async function deleteMessagesByTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().deleteMany({ teamId })
    return
  }
  for (let i = memoryStore.length - 1; i >= 0; i--) {
    if (memoryStore[i].teamId === teamId) memoryStore.splice(i, 1)
  }
}
