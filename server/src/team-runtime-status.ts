import type { CCInstance } from './cc-instance-manager'
import type {
  TeamRuntimeStatus,
  TeamStartupPhase,
  TeamStartupStatus,
} from './shared/shared-message-and-session-types'

type StatusInstance = Pick<CCInstance, 'name' | 'tmuxSessionName' | 'status' | 'outputFilePath'>

interface BuildRunningTeamStatusParams {
  teamId: string
  ccInstances: StatusInstance[]
  daSessionId: string | null
  startup?: TeamStartupStatus | null
  ccStatusOverrides?: Record<string, string>
}

interface BuildTeamStartupStatusParams {
  phase: TeamStartupPhase
  readyCount: number
  totalCount: number
  currentCCName?: string
}

export type { TeamStartupPhase }

export function buildTeamStartupStatus({
  phase,
  readyCount,
  totalCount,
  currentCCName,
}: BuildTeamStartupStatusParams): TeamStartupStatus {
  switch (phase) {
    case 'initializing':
      return {
        phase,
        message: `Preparing ${totalCount} CC instance${totalCount === 1 ? '' : 's'}...`,
        readyCount,
        totalCount,
      }
    case 'launching_cc':
      return {
        phase,
        message: currentCCName
          ? `Launching ${currentCCName}...`
          : 'Launching CC instance...',
        readyCount,
        totalCount,
        currentCCName,
      }
    case 'waiting_for_ready':
      return {
        phase,
        message: currentCCName
          ? `Waiting for ${currentCCName} to become ready...`
          : 'Waiting for CC instance to become ready...',
        readyCount,
        totalCount,
        currentCCName,
      }
    case 'creating_da':
      return {
        phase,
        message: 'Starting delegate agent...',
        readyCount,
        totalCount,
      }
    case 'complete':
      return {
        phase,
        message: 'All CC instances ready.',
        readyCount,
        totalCount,
      }
  }
}

export function buildRunningTeamStatus({
  teamId,
  ccInstances,
  daSessionId,
  startup = null,
  ccStatusOverrides = {},
}: BuildRunningTeamStatusParams): TeamRuntimeStatus {
  const ccStatuses: Record<string, string> = {}
  const ccOutputFiles: Record<string, string> = {}

  for (const inst of ccInstances) {
    ccStatuses[inst.name] = ccStatusOverrides[inst.name] ?? inst.status
    ccOutputFiles[inst.name] = inst.outputFilePath
  }

  return {
    teamId,
    isRunning: true,
    ccStatuses,
    daSessionId,
    ccOutputFiles,
    ccSessions: ccInstances.map((inst) => ({
      name: inst.name,
      tmuxSessionName: inst.tmuxSessionName,
    })),
    startup,
  }
}

export function buildStoppedTeamStatus(teamId: string): TeamRuntimeStatus {
  return {
    teamId,
    isRunning: false,
    ccStatuses: {},
    daSessionId: null,
    ccOutputFiles: {},
    ccSessions: [],
    startup: null,
  }
}
