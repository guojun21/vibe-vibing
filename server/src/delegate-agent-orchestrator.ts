import {
  type CCInstance,
  refreshCCInstance,
  sendInputToCCInstance,
} from './cc-instance-manager'
import { isIdleStatus } from './cc-status-detector'
import { logger } from './structured-pino-logger'

export type DAState = 'idle' | 'waiting'

export interface DelegateAgentOrchestrator {
  teamId: string
  instances: CCInstance[]
  state: DAState
  pollTimer: ReturnType<typeof setInterval> | null
  onStatusUpdate?: (statuses: Record<string, string>) => void
  onAllComplete?: (summary: string) => void
}

export function createDelegateAgent(teamId: string, instances: CCInstance[]): DelegateAgentOrchestrator {
  return {
    teamId,
    instances,
    state: 'idle',
    pollTimer: null,
  }
}

export function handleDAInput(da: DelegateAgentOrchestrator, input: string): string[] {
  const errors: string[] = []
  for (const inst of da.instances) {
    try {
      sendInputToCCInstance(inst, input)
    } catch (err) {
      errors.push(`${inst.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  da.state = 'waiting'
  startPolling(da)
  return errors
}

function startPolling(da: DelegateAgentOrchestrator): void {
  if (da.pollTimer) return
  da.pollTimer = setInterval(() => {
    tickDA(da)
  }, 500)
}

export function stopPolling(da: DelegateAgentOrchestrator): void {
  if (da.pollTimer) {
    clearInterval(da.pollTimer)
    da.pollTimer = null
  }
}

export function tickDA(da: DelegateAgentOrchestrator): string {
  if (da.state !== 'waiting') return ''

  let allIdle = true
  const statuses: Record<string, string> = {}

  for (const inst of da.instances) {
    refreshCCInstance(inst)
    statuses[inst.name] = inst.status
    if (!isIdleStatus(inst.status)) {
      allIdle = false
    }
  }

  da.onStatusUpdate?.(statuses)

  if (allIdle) {
    da.state = 'idle'
    stopPolling(da)
    let summary = 'done — 所有 CC 执行完毕'
    for (const inst of da.instances) {
      summary += `\n  ${inst.name}: ${inst.status}`
    }
    da.onAllComplete?.(summary)
    return summary
  }
  return ''
}

export function destroyDelegateAgent(da: DelegateAgentOrchestrator): void {
  stopPolling(da)
}
