/**
 * SplitView — VSCode-style resizable layout via native CSS + drag.
 * Left: DA chat panel. Right: CC terminal panels stacked vertically.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@shared/shared-message-and-session-types'
import TerminalInstance from './terminal-instance-with-independent-websocket'
import DAPanel from './delegate-agent-chat-panel'

interface Props {
  pinnedSessions: Session[]
  sendMessage?: (message: any) => void
}

function useResizer(
  direction: 'horizontal' | 'vertical',
  initialFraction: number,
  min: number,
  max: number
) {
  const [fraction, setFraction] = useState(initialFraction)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction]
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let f: number
      if (direction === 'horizontal') {
        f = (e.clientX - rect.left) / rect.width
      } else {
        f = (e.clientY - rect.top) / rect.height
      }
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
  }, [direction, min, max])

  return { fraction, containerRef, onMouseDown }
}

function HorizontalHandle({ onMouseDown }: { onMouseDown: React.MouseEventHandler }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-white/5 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
    />
  )
}

export default function SplitView({ pinnedSessions, sendMessage }: Props) {
  const { fraction: hFrac, containerRef, onMouseDown: hDrag } = useResizer(
    'horizontal',
    0.25,
    0.15,
    0.45
  )

  if (pinnedSessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-sm">
        No CC sessions pinned. Select sessions from the sidebar to pin them.
      </div>
    )
  }

  const leftPct = `${hFrac * 100}%`
  const rightPct = `${(1 - hFrac) * 100}%`

  return (
    <div ref={containerRef} className="flex h-full w-full min-h-0 overflow-hidden">
      {/* Left: DA Panel */}
      <div style={{ width: leftPct, minWidth: 200 }} className="shrink-0 h-full min-h-0 overflow-hidden">
        <DAPanel sendMessage={sendMessage} />
      </div>

      <HorizontalHandle onMouseDown={hDrag} />

      {/* Right: CC Terminals stacked */}
      <div style={{ width: rightPct }} className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden gap-0">
        {pinnedSessions.map((session, i) => (
          <Fragment key={session.id}>
            {i > 0 && <div className="h-1 shrink-0 bg-white/5" />}
            <div className="flex-1 min-h-0 overflow-hidden">
              <TerminalInstance session={session} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
