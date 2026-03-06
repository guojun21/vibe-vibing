import { describe, expect, test } from 'bun:test'
import {
  getTeamStartupDisplay,
  isTeamStartupInProgress,
} from './team-startup-display'
import type { TeamRuntimeStatus } from '../stores/team-state-store'

function createStatus(startup?: TeamRuntimeStatus['startup']): TeamRuntimeStatus {
  return {
    teamId: 'team-1',
    isRunning: true,
    ccStatuses: {
      planner: 'idle',
      reviewer: 'starting',
    },
    daSessionId: null,
    ccSessions: [],
    startup,
  }
}

describe('teamStartupDisplay', () => {
  test('returns phased startup text while team launch is in progress', () => {
    const status = createStatus({
      phase: 'waiting_for_ready',
      message: 'Waiting for reviewer to become ready...',
      readyCount: 1,
      totalCount: 3,
      currentCCName: 'reviewer',
    })

    expect(isTeamStartupInProgress(status)).toBe(true)
    expect(getTeamStartupDisplay(status)).toEqual({
      message: 'Waiting for reviewer to become ready...',
      progressLabel: '1 / 3 ready',
      currentCCName: 'reviewer',
    })
  })

  test('returns null when there is no startup progress', () => {
    expect(isTeamStartupInProgress(createStatus(undefined))).toBe(false)
    expect(getTeamStartupDisplay(createStatus(undefined))).toBeNull()
  })

  test('treats complete startup progress as finished', () => {
    const status = createStatus({
      phase: 'complete',
      message: 'All CC instances ready.',
      readyCount: 3,
      totalCount: 3,
    })

    expect(isTeamStartupInProgress(status)).toBe(false)
    expect(getTeamStartupDisplay(status)).toBeNull()
  })
})
