import { MongoClient, type Db } from 'mongodb'
import { logger } from '../structured-pino-logger'

let client: MongoClient | null = null
let db: Db | null = null

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'vibe_vibing'

export async function connectMongoDB(): Promise<Db> {
  if (db) return db
  client = new MongoClient(MONGODB_URI)
  await client.connect()
  db = client.db(MONGODB_DB_NAME)
  logger.info({ uri: MONGODB_URI, database: MONGODB_DB_NAME }, 'MongoDB connected')
  await ensureIndexes(db)
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('MongoDB not connected. Call connectMongoDB() first.')
  return db
}

export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
    logger.info('MongoDB disconnected')
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection('teams').createIndex({ teamId: 1 }, { unique: true })
  await database.collection('teams').createIndex({ status: 1, updatedAt: -1 })
  await database.collection('sessions').createIndex({ sessionId: 1 }, { unique: true })
  await database.collection('sessions').createIndex({ teamId: 1, role: 1 })
  await database.collection('sessions').createIndex({ tmuxSessionName: 1 })
  await database.collection('messages').createIndex({ teamId: 1, timestamp: -1 })
  await database.collection('messages').createIndex({ sessionId: 1, timestamp: 1 })
  await database.collection('cc_snapshots').createIndex({ sessionId: 1, capturedAt: -1 })
  await database.collection('cc_snapshots').createIndex({ teamId: 1 })
  logger.info('MongoDB indexes ensured')
}
