import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { randomUUID } from 'node:crypto'

export interface SessionDocument {
  _id?: ObjectId
  sessionId: string
  teamId: string
  role: 'da' | 'cc'
  memberIndex?: number
  tmuxSessionName: string
  agentType?: 'claude' | 'codex' | 'claude-rp' | 'pi'
  status: 'running' | 'idle' | 'stopped' | 'error'
  createdAt: Date
  lastActivityAt: Date
  projectPath: string
  metadata: Record<string, unknown>
}

const memoryStore = new Map<string, SessionDocument>()

function isMongoAvailable(): boolean {
  try { getDb(); return true } catch { return false }
}

function collection(): Collection<SessionDocument> {
  return getDb().collection<SessionDocument>('sessions')
}

export async function createSession(params: {
  teamId: string
  role: 'da' | 'cc'
  memberIndex?: number
  tmuxSessionName: string
  agentType?: string
  projectPath: string
}): Promise<SessionDocument> {
  const doc: SessionDocument = {
    sessionId: randomUUID(),
    teamId: params.teamId,
    role: params.role,
    memberIndex: params.memberIndex,
    tmuxSessionName: params.tmuxSessionName,
    agentType: params.agentType as SessionDocument['agentType'],
    status: 'running',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    projectPath: params.projectPath,
    metadata: {},
  }
  if (isMongoAvailable()) {
    await collection().insertOne(doc)
  } else {
    memoryStore.set(doc.sessionId, doc)
  }
  return doc
}

export async function getSessionsByTeam(teamId: string): Promise<SessionDocument[]> {
  if (isMongoAvailable()) return collection().find({ teamId }).toArray()
  return [...memoryStore.values()].filter(s => s.teamId === teamId)
}

export async function getSession(sessionId: string): Promise<SessionDocument | null> {
  if (isMongoAvailable()) return collection().findOne({ sessionId })
  return memoryStore.get(sessionId) ?? null
}

export async function updateSessionStatus(sessionId: string, status: SessionDocument['status']): Promise<void> {
  if (isMongoAvailable()) {
    await collection().updateOne({ sessionId }, { $set: { status, lastActivityAt: new Date() } })
    return
  }
  const s = memoryStore.get(sessionId)
  if (s) { s.status = status; s.lastActivityAt = new Date() }
}

export async function deleteSessionsByTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().deleteMany({ teamId })
    return
  }
  for (const [id, s] of memoryStore) {
    if (s.teamId === teamId) memoryStore.delete(id)
  }
}

export async function getDASession(teamId: string): Promise<SessionDocument | null> {
  if (isMongoAvailable()) return collection().findOne({ teamId, role: 'da' })
  return [...memoryStore.values()].find(s => s.teamId === teamId && s.role === 'da') ?? null
}

export async function getCCSessions(teamId: string): Promise<SessionDocument[]> {
  if (isMongoAvailable()) return collection().find({ teamId, role: 'cc' }).sort({ memberIndex: 1 }).toArray()
  return [...memoryStore.values()]
    .filter(s => s.teamId === teamId && s.role === 'cc')
    .sort((a, b) => (a.memberIndex ?? 0) - (b.memberIndex ?? 0))
}
