import { useEffect } from 'react'
import { useTeamStore, type Team, type TeamRuntimeStatus } from '../stores/team-state-store'
import { InlineTeamCreator } from './inline-team-creator'
import { TeamItem } from './team-item'

interface TeamSidebarProps {
  sendMessage: (message: any) => void
}

export function TeamSidebar({ sendMessage }: TeamSidebarProps) {
  const {
    teams,
    selectedTeamId,
    teamStatuses,
    creatingTeam,
    selectTeam,
    setCreatingTeam,
  } = useTeamStore()

  const activeTeams = teams.filter((t) => t.status === 'active')
  const archivedTeams = teams.filter((t) => t.status === 'archived')

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

  return (
    <div data-testid="team-sidebar" className="flex flex-col h-full bg-[#0d1117] text-white/80">
      <div data-testid="team-sidebar-header" className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Teams</span>
        <button
          data-testid="team-create-button"
          aria-label="Create new team"
          onClick={() => setCreatingTeam(!creatingTeam)}
          className="w-6 h-6 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold"
        >
          +
        </button>
      </div>

      {creatingTeam && (
        <InlineTeamCreator
          onSubmit={handleCreateTeam}
          onCancel={() => setCreatingTeam(false)}
        />
      )}

      <div data-testid="team-list" className="flex-1 overflow-y-auto">
        {activeTeams.map((team) => (
          <TeamItem
            key={team.teamId}
            team={team}
            isSelected={team.teamId === selectedTeamId}
            status={teamStatuses[team.teamId]}
            onSelect={() => handleSelectTeam(team.teamId)}
            onStart={() => handleStartTeam(team.teamId)}
            onStop={() => handleStopTeam(team.teamId)}
            onDelete={() => handleDeleteTeam(team.teamId)}
          />
        ))}

        {activeTeams.length === 0 && !creatingTeam && (
          <div data-testid="team-empty-state" className="px-3 py-8 text-center text-white/30 text-xs">
            No teams yet. Click + to create one.
          </div>
        )}

        {archivedTeams.length > 0 && (
          <details data-testid="team-archived-section" className="border-t border-white/10 mt-2">
            <summary className="px-3 py-2 text-xs text-white/40 cursor-pointer hover:text-white/60">
              Archived ({archivedTeams.length})
            </summary>
            {archivedTeams.map((team) => (
              <TeamItem
                key={team.teamId}
                team={team}
                isSelected={team.teamId === selectedTeamId}
                status={teamStatuses[team.teamId]}
                onSelect={() => handleSelectTeam(team.teamId)}
                onStart={() => handleStartTeam(team.teamId)}
                onStop={() => handleStopTeam(team.teamId)}
                onDelete={() => handleDeleteTeam(team.teamId)}
              />
            ))}
          </details>
        )}
      </div>
    </div>
  )
}
