/**
 * TerminalInstance — standalone terminal panel for split-view.
 * Each instance creates its own WebSocket connection so the server
 * can attach it to a different tmux session simultaneously.
 */
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import type { Session } from '@shared/shared-message-and-session-types'
import { useTerminal } from '../hooks/use-terminal-xterm-session'
import { useIndependentWebSocket } from '../hooks/use-independent-websocket-connection'
import { useThemeStore, terminalThemes } from '../stores/theme-preference-store'
import { useSettingsStore, getFontFamily } from '../stores/settings-persistence-store'

interface Props {
  session: Session
}

export interface TerminalInstanceHandle {
  sendText: (text: string) => void
}

const statusLabel: Record<string, string> = {
  working: 'Working',
  waiting: 'Idle',
  permission: 'Needs Input',
  unknown: 'Unknown',
}

const statusDot: Record<string, string> = {
  working: 'bg-green-400',
  waiting: 'bg-blue-400',
  permission: 'bg-amber-400',
  unknown: 'bg-gray-500',
}

const TerminalInstance = forwardRef<TerminalInstanceHandle, Props>(
  function TerminalInstance({ session }, ref) {
    const { status, sendMessage, subscribe } = useIndependentWebSocket()
    const [showScrollBtn, setShowScrollBtn] = useState(false)

    const theme = useThemeStore((s) => s.theme)
    const terminalTheme = terminalThemes[theme]
    const useWebGL = useSettingsStore((s) => s.useWebGL)
    const fontSize = useSettingsStore((s) => s.fontSize)
    const lineHeight = useSettingsStore((s) => s.lineHeight)
    const letterSpacing = useSettingsStore((s) => s.letterSpacing)
    const fontOption = useSettingsStore((s) => s.fontOption)
    const customFontFamily = useSettingsStore((s) => s.customFontFamily)
    const fontFamily = getFontFamily(fontOption, customFontFamily)

    const { containerRef, terminalRef } = useTerminal({
      sessionId: session.id,
      tmuxTarget: session.tmuxWindow ?? null,
      allowAttach: true,
      connectionStatus: status,
      connectionEpoch: 0,
      sendMessage,
      subscribe,
      theme: terminalTheme,
      fontSize,
      lineHeight,
      letterSpacing,
      fontFamily,
      useWebGL,
      onScrollChange: (isAtBottom) => setShowScrollBtn(!isAtBottom),
    })

    useImperativeHandle(ref, () => ({
      sendText(text: string) {
        sendMessage({
          type: 'terminal-input',
          sessionId: session.id,
          data: text,
        })
        setTimeout(() => {
          sendMessage({
            type: 'terminal-input',
            sessionId: session.id,
            data: '\r',
          })
        }, 50)
      },
    }), [sendMessage, session.id])

    const scrollToBottom = useCallback(() => {
      sendMessage({ type: 'tmux-cancel-copy-mode', sessionId: session.id })
      terminalRef.current?.scrollToBottom()
    }, [session.id, sendMessage, terminalRef])

    const dot = statusDot[session.status] || statusDot.unknown
    const label = statusLabel[session.status] || session.status

    return (
      <div className="flex flex-col h-full bg-terminal overflow-hidden rounded-lg border border-white/5">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 border-b border-white/5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-sm font-medium text-white/80 truncate">
            {session.name || session.id}
          </span>
          <span className="text-xs text-white/40">[{label}]</span>
          {status !== 'connected' && (
            <span className="text-xs text-amber-400 ml-auto">{status}</span>
          )}
        </div>

        {/* Terminal */}
        <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />

        {/* Scroll-to-bottom */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-3 rounded-full bg-white/10 hover:bg-white/20 p-1.5 text-white/60 text-xs z-10"
          >
            ↓
          </button>
        )}
      </div>
    )
  }
)

export default TerminalInstance
