import { describe, expect, test } from 'bun:test'
import {
  buildRunningTeamStatus,
  buildStoppedTeamStatus,
  type TeamStartupPhase,
} from '../team-runtime-status'

function createStartup(phase: TeamStartupPhase) {
  return {
    phase,
    message: 'Waiting for reviewer to become ready...',
    readyCount: 1,
    totalCount: 3,
    currentCCName: 'reviewer',
  } as const
}

describe('teamRuntimeStatus', () => {
  test('builds a running status snapshot with startup progress', () => {
    const status = buildRunningTeamStatus({
      teamId: 'team-1',
      daSessionId: null,
      startup: createStartup('waiting_for_ready'),
      ccInstances: [
        {
          name: 'planner',
          tmuxSessionName: 'team-1-cc-0',
          status: 'idle',
          outputFilePath: '/tmp/planner.txt',
        },
        {
          name: 'reviewer',
          tmuxSessionName: 'team-1-cc-1',
          status: 'processing',
          outputFilePath: '/tmp/reviewer.txt',
        },
      ],
      ccStatusOverrides: {
        planner: 'idle',
        reviewer: 'starting',
      },
    })

    expect(status).toEqual({
      teamId: 'team-1',
      isRunning: true,
      ccStatuses: {
        planner: 'idle',
        reviewer: 'starting',
      },
      daSessionId: null,
      ccOutputFiles: {
        planner: '/tmp/planner.txt',
        reviewer: '/tmp/reviewer.txt',
      },
      ccSessions: [
        { name: 'planner', tmuxSessionName: 'team-1-cc-0' },
        { name: 'reviewer', tmuxSessionName: 'team-1-cc-1' },
      ],
      startup: createStartup('waiting_for_ready'),
    })
  })

  test('builds a stopped status snapshot with cleared startup progress', () => {
    expect(buildStoppedTeamStatus('team-1')).toEqual({
      teamId: 'team-1',
      isRunning: false,
      ccStatuses: {},
      daSessionId: null,
      ccOutputFiles: {},
      ccSessions: [],
      startup: null,
    })
  })
})
