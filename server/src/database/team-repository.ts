import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { logger } from '../structured-pino-logger'

export interface TeamMemberConfig {
  role: 'cc'
  agentType: 'claude' | 'codex' | 'claude-rp' | 'pi'
  name: string
  command?: string
  projectPath?: string
}

export interface TeamDocument {
  _id?: ObjectId
  teamId: string
  name: string
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'archived'
  config: {
    members: TeamMemberConfig[]
    defaultProjectPath: string
  }
}

const DATA_DIR = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'data')
const TEAMS_FILE = join(DATA_DIR, 'teams.json')

function loadFileStore(): Map<string, TeamDocument> {
  const store = new Map<string, TeamDocument>()
  try {
    if (existsSync(TEAMS_FILE)) {
      const raw = JSON.parse(readFileSync(TEAMS_FILE, 'utf-8')) as any[]
      for (const t of raw) {
        t.createdAt = new Date(t.createdAt)
        t.updatedAt = new Date(t.updatedAt)
        store.set(t.teamId, t)
      }
    }
  } catch (err) {
    logger.warn('team_file_load_error', { error: String(err) })
  }
  return store
}

function saveFileStore(store: Map<string, TeamDocument>) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(TEAMS_FILE, JSON.stringify([...store.values()], null, 2), 'utf-8')
  } catch (err) {
    logger.warn('team_file_save_error', { error: String(err) })
  }
}

const fileStore = loadFileStore()

function isMongoAvailable(): boolean {
  try {
    getDb()
    return true
  } catch {
    return false
  }
}

function collection(): Collection<TeamDocument> {
  return getDb().collection<TeamDocument>('teams')
}

export async function createTeam(name: string, members: TeamMemberConfig[], defaultProjectPath: string): Promise<TeamDocument> {
  const doc: TeamDocument = {
    teamId: randomUUID(),
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
    config: { members, defaultProjectPath },
  }
  if (isMongoAvailable()) {
    await collection().insertOne(doc)
  } else {
    fileStore.set(doc.teamId, doc)
    saveFileStore(fileStore)
  }
  return doc
}

export async function getTeam(teamId: string): Promise<TeamDocument | null> {
  if (isMongoAvailable()) {
    return collection().findOne({ teamId })
  }
  return fileStore.get(teamId) ?? null
}

export async function listActiveTeams(): Promise<TeamDocument[]> {
  if (isMongoAvailable()) {
    return collection().find({ status: 'active' }).sort({ updatedAt: -1 }).toArray()
  }
  return [...fileStore.values()]
    .filter(t => t.status === 'active')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function listAllTeams(): Promise<TeamDocument[]> {
  if (isMongoAvailable()) {
    return collection().find().sort({ updatedAt: -1 }).toArray()
  }
  return [...fileStore.values()]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function updateTeam(teamId: string, updates: Partial<Pick<TeamDocument, 'name' | 'config' | 'status'>>): Promise<TeamDocument | null> {
  if (isMongoAvailable()) {
    return collection().findOneAndUpdate(
      { teamId },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
  }
  const existing = fileStore.get(teamId)
  if (!existing) return null
  const updated = { ...existing, ...updates, updatedAt: new Date() }
  fileStore.set(teamId, updated)
  saveFileStore(fileStore)
  return updated
}

export async function archiveTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().updateOne({ teamId }, { $set: { status: 'archived', updatedAt: new Date() } })
    return
  }
  const existing = fileStore.get(teamId)
  if (existing) {
    existing.status = 'archived'
    existing.updatedAt = new Date()
    saveFileStore(fileStore)
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().deleteOne({ teamId })
    return
  }
  fileStore.delete(teamId)
  saveFileStore(fileStore)
}
