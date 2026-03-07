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

export interface TeamCCSession {
  name: string
  tmuxSessionName: string
}

export type TeamStartupPhase =
  | 'initializing'
  | 'launching_cc'
  | 'waiting_for_ready'
  | 'creating_da'
  | 'complete'

export interface TeamStartupStatus {
  phase: TeamStartupPhase
  message: string
  readyCount: number
  totalCount: number
  currentCCName?: string
}

export interface TeamRuntimeStatus {
  teamId: string
  isRunning: boolean
  ccStatuses: Record<string, string>
  daSessionId: string | null
  ccSessions?: TeamCCSession[]
  ccOutputFiles?: Record<string, string>
  startup?: TeamStartupStatus | null
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

export interface DAAgentEvent {
  type: 'thinking' | 'tool-call' | 'tool-result' | 'complete' | 'error'
  step: number
  content?: string
  toolCalls?: DAToolCallInfo[]
  toolResults?: DAToolResultInfo[]
  timestamp: string
}

interface TeamState {
  teams: Team[]
  selectedTeamId: string | null
  teamStatuses: Record<string, TeamRuntimeStatus>
  daMessages: Record<string, DAMessage[]>
  daAgentEvents: Record<string, DAAgentEvent[]>
  daAgentRunning: Record<string, boolean>
  creatingTeam: boolean

  setTeams: (teams: Team[]) => void
  addTeam: (team: Team) => void
  updateTeamInStore: (team: Team) => void
  selectTeam: (teamId: string | null) => void
  setTeamStatus: (status: TeamRuntimeStatus) => void
  setDAMessages: (teamId: string, messages: DAMessage[]) => void
  addDAMessage: (teamId: string, message: DAMessage) => void
  addDAAgentEvent: (teamId: string, event: DAAgentEvent) => void
  setDAAgentEvents: (teamId: string, events: DAAgentEvent[]) => void
  clearDAAgentEvents: (teamId: string) => void
  setDAAgentRunning: (teamId: string, running: boolean) => void
  setCreatingTeam: (creating: boolean) => void
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      teams: [],
      selectedTeamId: null,
      teamStatuses: {},
      daMessages: {},
      daAgentEvents: {},
      daAgentRunning: {},
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
      addDAAgentEvent: (teamId, event) =>
        set((state) => ({
          daAgentEvents: {
            ...state.daAgentEvents,
            [teamId]: [...(state.daAgentEvents[teamId] || []), event],
          },
        })),
      setDAAgentEvents: (teamId, events) =>
        set((state) => ({
          daAgentEvents: { ...state.daAgentEvents, [teamId]: events },
        })),
      clearDAAgentEvents: (teamId) =>
        set((state) => ({
          daAgentEvents: { ...state.daAgentEvents, [teamId]: [] },
        })),
      setDAAgentRunning: (teamId, running) =>
        set((state) => ({
          daAgentRunning: { ...state.daAgentRunning, [teamId]: running },
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
