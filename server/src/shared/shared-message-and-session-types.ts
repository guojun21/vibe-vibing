// Inactive sessions lookback limits (in hours)
export const INACTIVE_MAX_AGE_MIN_HOURS = 1
export const INACTIVE_MAX_AGE_MAX_HOURS = 168 // 7 days

export type SessionStatus = 'working' | 'waiting' | 'permission' | 'unknown'

export type SessionSource = 'managed' | 'external'
export type AgentType = 'claude' | 'claude-rp' | 'codex' | 'pi'
export type TerminalErrorCode =
  | 'ERR_INVALID_WINDOW'
  | 'ERR_SESSION_CREATE_FAILED'
  | 'ERR_START_TIMEOUT'
  | 'ERR_TMUX_ATTACH_FAILED'
  | 'ERR_TMUX_SWITCH_FAILED'
  | 'ERR_TTY_DISCOVERY_TIMEOUT'
  | 'ERR_NOT_READY'

export interface Session {
  id: string
  name: string
  tmuxWindow: string
  projectPath: string
  status: SessionStatus
  lastActivity: string
  createdAt: string
  agentType?: AgentType
  source: SessionSource
  host?: string
  remote?: boolean
  command?: string
  agentSessionId?: string
  agentSessionName?: string
  logFilePath?: string
  lastUserMessage?: string
  isPinned?: boolean
}

export interface AgentSession {
  sessionId: string
  logFilePath: string
  projectPath: string
  agentType: AgentType
  displayName: string
  createdAt: string
  lastActivityAt: string
  isActive: boolean
  host?: string
  lastUserMessage?: string
  isPinned?: boolean
  lastResumeError?: string
}

export interface HostStatus {
  host: string
  ok: boolean
  lastUpdated: string
  error?: string
}

// Directory browser types
export interface DirectoryEntry {
  name: string
  path: string
}

export interface DirectoryListing {
  path: string
  parent: string | null
  directories: DirectoryEntry[]
  truncated: boolean
}

export interface DirectoryErrorResponse {
  error: 'invalid_path' | 'forbidden' | 'not_found' | 'internal_error'
  message: string
}

export interface TeamMemberConfig {
  role: 'cc'
  agentType: AgentType
  name: string
  command?: string
  projectPath?: string
}

export interface TeamConfig {
  members: TeamMemberConfig[]
  defaultProjectPath: string
}

export interface Team {
  teamId: string
  name: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'
  config: TeamConfig
}

export interface TeamRuntimeStatus {
  teamId: string
  isRunning: boolean
  ccStatuses: Record<string, string>
  daSessionId: string | null
}

export interface DAMessage {
  messageId: string
  teamId: string
  role: 'user' | 'da' | 'system'
  content: string
  timestamp: string
}

export interface DAToolCallInfo {
  id: string
  name: string
  arguments: string
}

export interface DAToolResultInfo {
  id: string
  name: string
  output: string
  isError: boolean
}

export type ServerMessage =
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'session-update'; session: Session }
  | { type: 'session-created'; session: Session }
  | { type: 'session-removed'; sessionId: string }
  | { type: 'host-status'; hosts: HostStatus[] }
  | { type: 'agent-sessions'; active: AgentSession[]; inactive: AgentSession[] }
  | { type: 'session-orphaned'; session: AgentSession; supersededBy?: string }
  | { type: 'session-activated'; session: AgentSession; window: string }
  | { type: 'session-resume-result'; sessionId: string; ok: boolean; session?: Session; error?: ResumeError }
  | { type: 'session-pin-result'; sessionId: string; ok: boolean; error?: string }
  | { type: 'session-resurrection-failed'; sessionId: string; displayName: string; error: string }
  | { type: 'terminal-output'; sessionId: string; data: string }
  | {
      type: 'terminal-error'
      sessionId: string | null
      code: TerminalErrorCode
      message: string
      retryable: boolean
    }
  | { type: 'terminal-ready'; sessionId: string }
  | { type: 'tmux-copy-mode-status'; sessionId: string; inCopyMode: boolean }
  | { type: 'server-config'; remoteAllowControl: boolean; remoteAllowAttach: boolean; hostLabel: string; clientLogLevel?: string }
  | { type: 'pong'; seq?: number }
  | { type: 'error'; message: string }
  | { type: 'kill-failed'; sessionId: string; message: string }
  | { type: 'teams'; teams: Team[] }
  | { type: 'team-created'; team: Team }
  | { type: 'team-updated'; team: Team }
  | { type: 'team-status'; status: TeamRuntimeStatus }
  | { type: 'da-message'; teamId: string; message: DAMessage }
  | { type: 'da-history'; teamId: string; messages: DAMessage[] }
  | { type: 'cc-status-update'; teamId: string; statuses: Record<string, string> }
  | { type: 'da-thinking'; teamId: string; content: string; step: number }
  | { type: 'da-tool-call'; teamId: string; toolCalls: DAToolCallInfo[]; step: number }
  | { type: 'da-tool-result'; teamId: string; results: DAToolResultInfo[]; step: number }
  | { type: 'da-complete'; teamId: string; summary: string }
  | { type: 'da-error'; teamId: string; error: string }

export interface ResumeError {
  code: 'NOT_FOUND' | 'ALREADY_ACTIVE' | 'RESUME_FAILED'
  message: string
}

export type ClientMessage =
  | {
      type: 'terminal-attach'
      sessionId: string
      tmuxTarget?: string
      cols?: number
      rows?: number
    }
  | { type: 'terminal-detach'; sessionId: string }
  | { type: 'terminal-input'; sessionId: string; data: string }
  | { type: 'terminal-resize'; sessionId: string; cols: number; rows: number }
  | { type: 'session-create'; projectPath: string; name?: string; command?: string; host?: string }
  | { type: 'session-kill'; sessionId: string }
  | { type: 'session-rename'; sessionId: string; newName: string }
  | { type: 'session-refresh' }
  | { type: 'tmux-cancel-copy-mode'; sessionId: string }
  | { type: 'tmux-check-copy-mode'; sessionId: string }
  | { type: 'session-resume'; sessionId: string; name?: string }
  | { type: 'ping'; seq?: number }
  | { type: 'session-pin'; sessionId: string; isPinned: boolean }
  | { type: 'team-create'; name: string; members: TeamMemberConfig[]; defaultProjectPath: string }
  | { type: 'team-update'; teamId: string; name?: string; config?: Partial<TeamConfig> }
  | { type: 'team-delete'; teamId: string }
  | { type: 'team-start'; teamId: string }
  | { type: 'team-stop'; teamId: string }
  | { type: 'team-select'; teamId: string }
  | { type: 'da-input'; teamId: string; text: string }
  | { type: 'da-history-request'; teamId: string; limit?: number }

// Typed function signatures for client-side messaging
export type SendClientMessage = (message: ClientMessage) => void
export type SubscribeServerMessage = (listener: (message: ServerMessage) => void) => () => void
