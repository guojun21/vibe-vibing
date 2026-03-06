import type { TeamRuntimeStatus } from '../stores/team-state-store'

interface TeamStartupDisplay {
  message: string
  progressLabel: string
  currentCCName?: string
}

export function isTeamStartupInProgress(status?: TeamRuntimeStatus): boolean {
  return Boolean(status?.startup && status.startup.phase !== 'complete')
}

export function getTeamStartupDisplay(status?: TeamRuntimeStatus): TeamStartupDisplay | null {
  if (!status?.startup || status.startup.phase === 'complete') {
    return null
  }

  return {
    message: status.startup.message,
    progressLabel: `${status.startup.readyCount} / ${status.startup.totalCount} ready`,
    currentCCName: status.startup.currentCCName,
  }
}
