/**
 * TeamView — the main content area for a selected team.
 * Left: DA Chat panel. Right: CC Terminal(s) belonging to this team.
 * This component is the single source of truth for what a "team workspace" looks like.
 * Switching teams swaps this entire component's content.
 */
import { Fragment, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import type { Session } from '@shared/shared-message-and-session-types'
import TerminalInstance from './terminal-instance-with-independent-websocket'
import DAPanel from './delegate-agent-chat-panel'
import { useTeamStore, type TeamRuntimeStatus } from '../stores/team-state-store'
import { useSessionStore } from '../stores/session-state-store'
import { isTeamStartupInProgress, getTeamStartupDisplay } from '../utils/team-startup-display'

interface TeamViewProps {
  teamId: string
  sendMessage: (message: any) => void
}

function useHorizontalResizer(initialFraction: number, min: number, max: number) {
  const [fraction, setFraction] = useState(initialFraction)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const f = (e.clientX - rect.left) / rect.width
      setFraction(Math.min(max, Math.max(min, f)))
    }
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [min, max])

  return { fraction, containerRef, onMouseDown }
}

export default function TeamView({ teamId, sendMessage }: TeamViewProps) {
  const status = useTeamStore((s) => s.teamStatuses[teamId]) as TeamRuntimeStatus | undefined
  const sessions = useSessionStore((s) => s.sessions)

  const ccSessions = useMemo(() => {
    if (!status?.ccSessions || status.ccSessions.length === 0) return []
    return status.ccSessions
      .map((cc) => {
        const found = sessions.find(
          (s) => s.name === cc.tmuxSessionName || s.id === cc.tmuxSessionName
        )
        return found ?? null
      })
      .filter((s): s is Session => s != null)
  }, [status?.ccSessions, sessions])

  const { fraction, containerRef, onMouseDown } = useHorizontalResizer(0.3, 0.15, 0.5)

  const isRunning = status?.isRunning ?? false
  const startingUp = isTeamStartupInProgress(status)
  const startupDisplay = getTeamStartupDisplay(status)

  if (!isRunning && !startingUp && ccSessions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-hidden">
          <DAPanel sendMessage={sendMessage} teamId={teamId} />
        </div>
        <div className="p-4 text-center text-white/30 text-xs border-t border-white/10">
          Team not started. Click "Start" in the sidebar to launch CC instances.
        </div>
      </div>
    )
  }

  const leftPct = `${fraction * 100}%`
  const rightPct = `${(1 - fraction) * 100}%`

  return (
    <div ref={containerRef} className="flex h-full w-full min-h-0 overflow-hidden">
      {/* DA Panel */}
      <div style={{ width: leftPct, minWidth: 200 }} className="shrink-0 h-full min-h-0 overflow-hidden">
        <DAPanel sendMessage={sendMessage} teamId={teamId} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1.5 shrink-0 cursor-col-resize bg-white/5 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
      />

      {/* CC Terminals */}
      <div style={{ width: rightPct }} className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden gap-0">
        {ccSessions.length > 0 ? (
          ccSessions.map((session, i) => (
            <Fragment key={session.id}>
              {i > 0 && <div className="h-1 shrink-0 bg-white/5" />}
              <div className="flex-1 min-h-0 overflow-hidden">
                <TerminalInstance session={session} />
              </div>
            </Fragment>
          ))
        ) : startupDisplay ? (
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-white/60 font-medium">{startupDisplay.message}</span>
              <span className="text-xs text-white/30">{startupDisplay.progressLabel}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            <div className="flex flex-col items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span>Waiting for CC sessions to connect...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
