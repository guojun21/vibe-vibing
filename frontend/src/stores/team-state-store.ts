import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface TeamMemberConfig {
  role: 'cc'
  agentType: 'claude' | 'codex' | 'claude-rp' | 'pi'
  name: string
  command?: string
  projectPath?: string
}

export interface Team {
  teamId: string
  name: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'
  config: {
    members: TeamMemberConfig[]
    defaultProjectPath: string
  }
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

interface TeamState {
  teams: Team[]
  selectedTeamId: string | null
  teamStatuses: Record<string, TeamRuntimeStatus>
  daMessages: Record<string, DAMessage[]>
  creatingTeam: boolean

  setTeams: (teams: Team[]) => void
  addTeam: (team: Team) => void
  updateTeamInStore: (team: Team) => void
  selectTeam: (teamId: string | null) => void
  setTeamStatus: (status: TeamRuntimeStatus) => void
  setDAMessages: (teamId: string, messages: DAMessage[]) => void
  addDAMessage: (teamId: string, message: DAMessage) => void
  setCreatingTeam: (creating: boolean) => void
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      teams: [],
      selectedTeamId: null,
      teamStatuses: {},
      daMessages: {},
      creatingTeam: false,

      setTeams: (teams) => set({ teams }),
      addTeam: (team) => set((state) => ({ teams: [team, ...state.teams] })),
      updateTeamInStore: (team) =>
        set((state) => ({
          teams: state.teams.map((t) => (t.teamId === team.teamId ? team : t)),
        })),
      selectTeam: (teamId) => set({ selectedTeamId: teamId }),
      setTeamStatus: (status) =>
        set((state) => ({
          teamStatuses: { ...state.teamStatuses, [status.teamId]: status },
        })),
      setDAMessages: (teamId, messages) =>
        set((state) => ({
          daMessages: { ...state.daMessages, [teamId]: messages },
        })),
      addDAMessage: (teamId, message) =>
        set((state) => ({
          daMessages: {
            ...state.daMessages,
            [teamId]: [...(state.daMessages[teamId] || []), message],
          },
        })),
      setCreatingTeam: (creating) => set({ creatingTeam: creating }),
    }),
    {
      name: 'vibe-vibing-teams',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTeamId: state.selectedTeamId,
      }),
    }
  )
)
