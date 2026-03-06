import { useState } from 'react'
import ChevronDownIcon from '@untitledui-icons/react/line/esm/ChevronDownIcon'
import ChevronRightIcon from '@untitledui-icons/react/line/esm/ChevronRightIcon'
import type { Session } from '@shared/shared-message-and-session-types'
import type { Team, TeamRuntimeStatus } from '../stores/team-state-store'
import { isTeamStartupInProgress } from '../utils/team-startup-display'
import { formatRelativeTime } from '../utils/relative-time-formatting'
import { getPathLeaf } from '../utils/session-display-label-generator'
import AgentIcon from './agent-type-icon-badge'
import ProjectBadge from './project-path-color-badge'

const statusPillClass: Record<Session['status'], string> = {
  working: 'bg-green-500/20 text-green-600',
  waiting: 'bg-zinc-500/20 text-zinc-400',
  permission: 'bg-amber-500/20 text-amber-600',
  unknown: 'bg-zinc-500/20 text-zinc-400',
}

interface TeamSessionGroupProps {
  team: Team
  isSelected: boolean
  status?: TeamRuntimeStatus
  sessions: Session[]
  selectedSessionId: string | null
  onSelectTeam: () => void
  onStartTeam: () => void
  onStopTeam: () => void
  onDeleteTeam: () => void
  onSelectSession: (sessionId: string) => void
}

export function TeamSessionGroup({
  team,
  isSelected,
  status,
  sessions,
  selectedSessionId,
  onSelectTeam,
  onStartTeam,
  onStopTeam,
  onDeleteTeam,
  onSelectSession,
}: TeamSessionGroupProps) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = status?.isRunning ?? false
  const isStarting = isTeamStartupInProgress(status)
  const ccCount = team.config?.members?.length ?? team.config?.ccCount ?? 0

  return (
    <div className="border-b border-white/10">
      {/* Team header row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected ? 'bg-white/5' : 'hover:bg-white/[0.03]'
        }`}
        onClick={() => {
          onSelectTeam()
          setExpanded(!expanded)
        }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          className="shrink-0 p-0.5 text-white/40 hover:text-white/70"
        >
          {expanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )}
        </button>

        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isStarting ? 'bg-blue-400 animate-pulse'
            : isRunning ? 'bg-green-500'
            : 'bg-white/20'
          }`}
        />

        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/90">
          {team.name}
        </span>

        {isStarting && (
          <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-blue-900/40 text-blue-400 font-medium">
            Starting
          </span>
        )}

        <span className="shrink-0 text-[10px] text-white/30 tabular-nums">
          {sessions.length > 0 ? sessions.length : ccCount} CC
        </span>
      </div>

      {/* Team action buttons when selected */}
      {isSelected && (
        <div className="flex gap-1.5 px-3 py-1 ml-5">
          {isStarting ? (
            <button
              disabled
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-800/60 text-blue-300 cursor-not-allowed"
            >
              Starting...
            </button>
          ) : !isRunning ? (
            <button
              onClick={(e) => { e.stopPropagation(); onStartTeam() }}
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-600 hover:bg-green-500 text-white"
            >
              Start
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onStopTeam() }}
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Stop
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteTeam() }}
            className="px-2 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 text-white/40"
          >
            Delete
          </button>
        </div>
      )}

      {/* Session list inside team */}
      {expanded && sessions.length > 0 && (
        <div className="pb-1">
          {sessions.map((session) => (
            <TeamSessionRow
              key={session.id}
              session={session}
              isSelected={session.id === selectedSessionId}
              onSelect={() => onSelectSession(session.id)}
            />
          ))}
        </div>
      )}

      {expanded && sessions.length === 0 && !isRunning && !isStarting && (
        <div className="pl-7 pr-3 py-2 text-[10px] text-white/25 italic">
          Not started
        </div>
      )}
    </div>
  )
}

function TeamSessionRow({
  session,
  isSelected,
  onSelect,
}: {
  session: Session
  isSelected: boolean
  onSelect: () => void
}) {
  const displayName = session.agentSessionName?.trim() || session.name?.trim() || session.id
  const lastActivity = formatRelativeTime(session.lastActivity)
  const directoryLeaf = getPathLeaf(session.projectPath)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
      className={`
        flex items-center gap-2 pl-7 pr-3 py-1.5 cursor-pointer transition-colors text-white/70
        ${isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/[0.04]'}
      `}
    >
      <AgentIcon
        agentType={session.agentType}
        command={session.command}
        className="h-3 w-3 shrink-0 text-white/40"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12px]">{displayName}</span>
          {directoryLeaf && (
            <ProjectBadge name={directoryLeaf} fullPath={session.projectPath} />
          )}
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${statusPillClass[session.status]}`}>
        {lastActivity}
      </span>
    </div>
  )
}
