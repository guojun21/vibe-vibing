import path from 'node:path'
import type { AgentSession } from './shared/shared-message-and-session-types'
import { config } from './server-configuration-loader'
import type { AgentSessionRecord } from './sqlite-database-connection'

export function toAgentSession(record: AgentSessionRecord): AgentSession {
  return {
    sessionId: record.sessionId,
    logFilePath: record.logFilePath,
    projectPath: record.projectPath,
    agentType: record.agentType,
    displayName: record.displayName,
    createdAt: record.createdAt,
    lastActivityAt: record.lastActivityAt,
    isActive: record.currentWindow !== null,
    host: config.hostLabel,
    lastUserMessage: record.lastUserMessage ?? undefined,
    isPinned: record.isPinned,
    lastResumeError: record.lastResumeError ?? undefined,
  }
}

export function deriveDisplayName(
  projectPath: string,
  sessionId: string,
  fallback?: string
): string {
  if (fallback && fallback.trim()) {
    return fallback.trim()
  }
  if (projectPath) {
    const leaf = path.basename(projectPath)
    if (leaf) return leaf
  }
  return sessionId.slice(0, 8)
}
