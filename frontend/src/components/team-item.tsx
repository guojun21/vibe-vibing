import type { Team, TeamRuntimeStatus } from '../stores/team-state-store'
import { isTeamStartupInProgress } from '../utils/team-startup-display'

interface TeamItemProps {
  team: Team
  isSelected: boolean
  status?: TeamRuntimeStatus
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}

export function TeamItem({ team, isSelected, status, onSelect, onStart, onStop, onDelete }: TeamItemProps) {
  const isRunning = status?.isRunning ?? false
  const isStarting = isTeamStartupInProgress(status)
  const ccCount = team.config?.members?.length ?? team.config?.ccCount ?? 0

  return (
    <div
      data-testid={`team-item-${team.teamId}`}
      aria-label={`Team ${team.name}`}
      aria-selected={isSelected}
      role="button"
      onClick={onSelect}
      className={`
        px-3 py-2 cursor-pointer border-l-2 transition-colors
        ${isSelected ? 'border-blue-500 bg-white/5' : 'border-transparent hover:bg-white/[0.03]'}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            data-testid={`team-status-indicator-${team.teamId}`}
            aria-label={isStarting ? 'Starting' : isRunning ? 'Running' : 'Stopped'}
            className={`w-2 h-2 rounded-full shrink-0 ${
              isStarting ? 'bg-blue-400 animate-pulse'
              : isRunning ? 'bg-green-500'
              : 'bg-white/20'
            }`}
          />
          <span data-testid={`team-name-${team.teamId}`} className="text-sm truncate">{team.name}</span>
          {isStarting && (
            <span
              data-testid={`team-starting-badge-${team.teamId}`}
              className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 font-medium"
            >
              Starting
            </span>
          )}
          {isRunning && !isStarting && (
            <span
              data-testid={`team-running-badge-${team.teamId}`}
              className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 font-medium"
            >
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {team.status === 'archived' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/40">Archived</span>
          )}
          <span data-testid={`team-cc-count-${team.teamId}`} className="text-[10px] text-white/40">
            {ccCount} CC
          </span>
        </div>
      </div>

      {isSelected && (
        <div data-testid={`team-actions-${team.teamId}`} className="flex gap-2 mt-1.5 ml-4">
          {isStarting ? (
            <button
              data-testid={`team-start-${team.teamId}`}
              disabled
              className="px-3 py-1 text-xs font-medium rounded-md bg-blue-800/60 text-blue-300 cursor-not-allowed transition-colors"
            >
              Starting...
            </button>
          ) : !isRunning ? (
            <button
              data-testid={`team-start-${team.teamId}`}
              aria-label={`Start team ${team.name}`}
              onClick={(e) => { e.stopPropagation(); onStart() }}
              className="px-3 py-1 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors"
            >
              Start
            </button>
          ) : (
            <button
              data-testid={`team-stop-${team.teamId}`}
              aria-label={`Stop team ${team.name}`}
              onClick={(e) => { e.stopPropagation(); onStop() }}
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              Stop
            </button>
          )}
          <button
            data-testid={`team-delete-${team.teamId}`}
            aria-label={`Delete team ${team.name}`}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="px-2 py-1 text-[10px] rounded bg-white/5 hover:bg-white/10 text-white/40"
          >
            Delete
          </button>
        </div>
      )}

      {(isRunning || isStarting) && status && Object.keys(status.ccStatuses).length > 0 && (
        <div data-testid={`team-cc-statuses-${team.teamId}`} className="flex gap-1 mt-1 ml-4 flex-wrap">
          {Object.entries(status.ccStatuses).map(([name, ccStatus]) => (
            <span
              key={name}
              data-testid={`cc-status-${team.teamId}-${name}`}
              aria-label={`${name}: ${ccStatus}`}
              className={`text-[9px] px-1 py-0.5 rounded ${
                ccStatus === 'idle' || ccStatus === 'completed'
                  ? 'bg-green-900/30 text-green-400'
                  : ccStatus === 'processing'
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : ccStatus === 'starting' || ccStatus === 'queued'
                      ? 'bg-blue-900/30 text-blue-400'
                      : 'bg-white/5 text-white/30'
              }`}
            >
              {name}: {ccStatus}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
