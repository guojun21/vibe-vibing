import { type Collection, ObjectId } from 'mongodb'
import { getDb } from './mongodb-connection'
import { randomUUID } from 'node:crypto'
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

const memoryStore = new Map<string, TeamDocument>()

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
    memoryStore.set(doc.teamId, doc)
    logger.warn({ teamId: doc.teamId }, 'team_created_in_memory (MongoDB unavailable)')
  }
  return doc
}

export async function getTeam(teamId: string): Promise<TeamDocument | null> {
  if (isMongoAvailable()) {
    return collection().findOne({ teamId })
  }
  return memoryStore.get(teamId) ?? null
}

export async function listActiveTeams(): Promise<TeamDocument[]> {
  if (isMongoAvailable()) {
    return collection().find({ status: 'active' }).sort({ updatedAt: -1 }).toArray()
  }
  return [...memoryStore.values()]
    .filter(t => t.status === 'active')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function listAllTeams(): Promise<TeamDocument[]> {
  if (isMongoAvailable()) {
    return collection().find().sort({ updatedAt: -1 }).toArray()
  }
  return [...memoryStore.values()]
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
  const existing = memoryStore.get(teamId)
  if (!existing) return null
  const updated = { ...existing, ...updates, updatedAt: new Date() }
  memoryStore.set(teamId, updated)
  return updated
}

export async function archiveTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().updateOne({ teamId }, { $set: { status: 'archived', updatedAt: new Date() } })
    return
  }
  const existing = memoryStore.get(teamId)
  if (existing) {
    existing.status = 'archived'
    existing.updatedAt = new Date()
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  if (isMongoAvailable()) {
    await collection().deleteOne({ teamId })
    return
  }
  memoryStore.delete(teamId)
}
