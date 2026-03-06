import { useEffect, useMemo } from 'react'
import type { Session, AgentSession } from '@shared/shared-message-and-session-types'
import { useTeamStore } from '../stores/team-state-store'
import { InlineTeamCreator } from './inline-team-creator'
import { TeamSessionGroup } from './team-session-group'
import SessionList from './session-list-sidebar'

interface TeamSidebarProps {
  sendMessage: (message: any) => void
  sessions: Session[]
  inactiveSessions?: AgentSession[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newName: string) => void
  onResumeSession?: (sessionId: string) => void
  onKillSession?: (sessionId: string) => void
  onDuplicateSession?: (sessionId: string) => void
  onSetPinned?: (sessionId: string, isPinned: boolean) => void
  loading: boolean
  error: string | null
}

export function TeamSidebar({
  sendMessage,
  sessions,
  inactiveSessions = [],
  selectedSessionId,
  onSelectSession,
  onRenameSession,
  onResumeSession,
  onKillSession,
  onDuplicateSession,
  onSetPinned,
  loading,
  error,
}: TeamSidebarProps) {
  const {
    teams,
    selectedTeamId,
    teamStatuses,
    creatingTeam,
    selectTeam,
    setCreatingTeam,
  } = useTeamStore()

  const activeTeams = teams.filter((t) => t.status === 'active')

  const handleSelectTeam = (teamId: string) => {
    selectTeam(teamId)
    sendMessage({ type: 'team-select', teamId })
  }

  const handleStartTeam = (teamId: string) => {
    sendMessage({ type: 'team-start', teamId })
  }

  const handleStopTeam = (teamId: string) => {
    sendMessage({ type: 'team-stop', teamId })
  }

  const handleDeleteTeam = (teamId: string) => {
    sendMessage({ type: 'team-delete', teamId })
  }

  const handleCreateTeam = (name: string, members: any[], defaultProjectPath: string) => {
    sendMessage({ type: 'team-create', name, members, defaultProjectPath })
    setCreatingTeam(false)
  }

  useEffect(() => {
    if (!selectedTeamId && activeTeams.length > 0) {
      selectTeam(activeTeams[0].teamId)
    }
  }, [selectedTeamId, activeTeams, selectTeam])

  const sessionsByTeam = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const session of sessions) {
      if (session.teamId) {
        const list = map.get(session.teamId) ?? []
        list.push(session)
        map.set(session.teamId, list)
      }
    }
    return map
  }, [sessions])

  const standaloneSessions = useMemo(
    () => sessions.filter((s) => !s.teamId),
    [sessions]
  )

  const hasTeams = activeTeams.length > 0 || creatingTeam

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0d1117] text-white/80">
      {error && (
        <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Teams header with create button */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Teams</span>
        <button
          aria-label="Create new team"
          onClick={() => setCreatingTeam(!creatingTeam)}
          className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
        >
          +
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Inline team creator */}
        {creatingTeam && (
          <InlineTeamCreator
            onSubmit={handleCreateTeam}
            onCancel={() => setCreatingTeam(false)}
          />
        )}

        {/* Team groups with their sessions */}
        {activeTeams.map((team) => (
          <TeamSessionGroup
            key={team.teamId}
            team={team}
            isSelected={team.teamId === selectedTeamId}
            status={teamStatuses[team.teamId]}
            sessions={sessionsByTeam.get(team.teamId) ?? []}
            selectedSessionId={selectedSessionId}
            onSelectTeam={() => handleSelectTeam(team.teamId)}
            onStartTeam={() => handleStartTeam(team.teamId)}
            onStopTeam={() => handleStopTeam(team.teamId)}
            onDeleteTeam={() => handleDeleteTeam(team.teamId)}
            onSelectSession={onSelectSession}
          />
        ))}

        {activeTeams.length === 0 && !creatingTeam && (
          <div className="px-3 py-6 text-center text-white/25 text-[11px]">
            No teams yet. Click + to create one.
          </div>
        )}

        {/* Standalone sessions section */}
        {hasTeams && standaloneSessions.length > 0 && (
          <div className="border-t border-white/10">
            <div className="px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Sessions
              </span>
            </div>
          </div>
        )}

        {/* Reuse the full SessionList for standalone sessions (with all its DnD/animation features) */}
        <SessionList
          sessions={standaloneSessions}
          inactiveSessions={inactiveSessions}
          selectedSessionId={selectedSessionId}
          onSelect={onSelectSession}
          onRename={onRenameSession}
          onResume={onResumeSession}
          onKill={onKillSession}
          onDuplicate={onDuplicateSession}
          onSetPinned={onSetPinned}
          loading={loading}
          error={null}
          embedded
        />
      </div>
    </div>
  )
}
