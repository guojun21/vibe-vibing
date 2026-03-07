import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { logger } from '../structured-pino-logger'

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
  /** Claude Code session UUID for --resume support */
  lastAgentSessionId?: string
}

const DATA_DIR = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'data')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')

function loadFileStore(): Map<string, SessionDocument> {
  const store = new Map<string, SessionDocument>()
  try {
    if (existsSync(SESSIONS_FILE)) {
      const raw = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as any[]
      for (const s of raw) {
        s.createdAt = new Date(s.createdAt)
        s.lastActivityAt = new Date(s.lastActivityAt)
        store.set(s.sessionId, s)
      }
    }
  } catch (err) {
    logger.warn('session_file_load_error', { error: String(err) })
  }
  return store
}

function saveFileStore(store: Map<string, SessionDocument>) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SESSIONS_FILE, JSON.stringify([...store.values()], null, 2), 'utf-8')
  } catch (err) {
    logger.warn('session_file_save_error', { error: String(err) })
  }
}

const fileStore = loadFileStore()

function isMongoAvailable(): boolean {
  try { getDb(); return true } catch { return false }
}

function collection(): Collection<SessionDocument> {
  return getDb().collection<SessionDocument>('sessions')
}

export async function migrateFileStoreToMongo(): Promise<void> {
  if (!isMongoAvailable() || fileStore.size === 0) return
  const coll = collection()
  const existing = await coll.countDocuments()
  if (existing > 0) {
    logger.info('session_migration_skipped', { reason: 'mongo_not_empty', mongoCount: existing, fileCount: fileStore.size })
    return
  }
  const docs = [...fileStore.values()].map(s => {
    const { _id, ...rest } = s as any
    return rest as SessionDocument
  })
  if (docs.length === 0) return
  await coll.insertMany(docs)
  logger.info('session_migration_completed', { migratedCount: docs.length })
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
  }
  fileStore.set(doc.sessionId, doc)
  saveFileStore(fileStore)
  return doc
}

export async function getSessionsByTeam(teamId: string): Promise<SessionDocument[]> {
  if (isMongoAvailable()) return collection().find({ teamId }).toArray()
  return [...fileStore.values()].filter(s => s.teamId === teamId)
}

export async function getSession(sessionId: string): Promise<SessionDocument | null> {
  if (isMongoAvailable()) return collection().findOne({ sessionId })
  return fileStore.get(sessionId) ?? null
}

export async function updateSessionStatus(sessionId: string, status: SessionDocument['status']): Promise<void> {
  if (isMongoAvailable()) {
    await collection().updateOne({ sessionId }, { $set: { status, lastActivityAt: new Date() } })
  }
  const s = fileStore.get(sessionId)
  if (s) {
    s.status = status
    s.lastActivityAt = new Date()
    saveFileStore(fileStore)
  }
}

export async function deleteSessionsByTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().deleteMany({ teamId })
  }
  for (const [id, s] of fileStore) {
    if (s.teamId === teamId) fileStore.delete(id)
  }
  saveFileStore(fileStore)
}

export async function getAllSessions(): Promise<SessionDocument[]> {
  if (isMongoAvailable()) return collection().find().toArray()
  return [...fileStore.values()]
}

export async function getDASession(teamId: string): Promise<SessionDocument | null> {
  if (isMongoAvailable()) return collection().findOne({ teamId, role: 'da' })
  return [...fileStore.values()].find(s => s.teamId === teamId && s.role === 'da') ?? null
}

export async function getCCSessions(teamId: string): Promise<SessionDocument[]> {
  if (isMongoAvailable()) return collection().find({ teamId, role: 'cc' }).sort({ memberIndex: 1 }).toArray()
  return [...fileStore.values()]
    .filter(s => s.teamId === teamId && s.role === 'cc')
    .sort((a, b) => (a.memberIndex ?? 0) - (b.memberIndex ?? 0))
}

export async function updateAgentSessionId(sessionId: string, agentSessionId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().updateOne({ sessionId }, { $set: { lastAgentSessionId: agentSessionId, lastActivityAt: new Date() } })
  }
  const s = fileStore.get(sessionId)
  if (s) {
    s.lastAgentSessionId = agentSessionId
    s.lastActivityAt = new Date()
    saveFileStore(fileStore)
  }
  logger.info('session_agent_id_updated', { sessionId, agentSessionId })
}

export async function getLatestCCSessionForResume(teamId: string, memberIndex: number): Promise<SessionDocument | null> {
  if (isMongoAvailable()) {
    return collection().findOne(
      { teamId, role: 'cc', memberIndex, lastAgentSessionId: { $exists: true, $ne: null } },
      { sort: { lastActivityAt: -1 } },
    )
  }
  return [...fileStore.values()]
    .filter(s => s.teamId === teamId && s.role === 'cc' && s.memberIndex === memberIndex && s.lastAgentSessionId)
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0] ?? null
}
