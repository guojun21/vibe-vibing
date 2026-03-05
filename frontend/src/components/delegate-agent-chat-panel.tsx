/**
 * DAPanel — Delegate Agent chat panel (left side of split-view).
 * MVP: pure passthrough. User types, DA forwards text to all pinned CCs.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTeamStore, type DAMessage } from '../stores/team-state-store'

interface Message {
  role: 'user' | 'da'
  text: string
}

interface DAPanelProps {
  onSendToAll: (text: string) => void
  sendMessage?: (message: any) => void
  teamId?: string | null
}

export default function DAPanel({ onSendToAll, sendMessage, teamId }: DAPanelProps) {
  const { selectedTeamId, daMessages } = useTeamStore()
  const activeTeamId = teamId ?? selectedTeamId
  const teamMessages = activeTeamId ? (daMessages[activeTeamId] || []) : []

  const [messages, setMessages] = useState<Message[]>([
    { role: 'da', text: 'DA 准备就绪。输入指令后按 Enter，我会把原文发送给所有 CC。' },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const displayMessages: Array<{ key: string; role: 'user' | 'da'; text: string }> =
    teamMessages.length > 0
      ? teamMessages.map((m) => ({ key: m.messageId, role: m.role as 'user' | 'da', text: m.content }))
      : messages.map((m, i) => ({ key: `local-${i}`, role: m.role, text: m.text }))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, teamMessages])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [...prev, { role: 'user', text }])
    onSendToAll(text)
    if (sendMessage && activeTeamId) {
      sendMessage({ type: 'da-input', teamId: activeTeamId, text })
    }
    setMessages((prev) => [...prev, { role: 'da', text: `✓ 已发送到所有 CC` }])
    setInput('')
  }, [input, onSendToAll, sendMessage, activeTeamId])

  return (
    <div data-testid="da-panel" className="flex flex-col h-full bg-terminal overflow-hidden rounded-lg border border-white/5">
      <div data-testid="da-panel-header" className="flex items-center gap-2 px-3 py-2 bg-black/20 border-b border-white/5 shrink-0">
        <span className="text-sm font-bold text-blue-400">DA</span>
        <span className="text-xs text-white/40">Delegate Agent</span>
      </div>

      <div data-testid="da-panel-messages" className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {displayMessages.map((msg) => (
          <div key={msg.key} data-testid={`da-message-${msg.key}`} className="flex flex-col">
            <span className={`text-[11px] font-semibold mb-0.5 ${
              msg.role === 'user' ? 'text-cyan-400' : 'text-green-400'
            }`}>
              {msg.role === 'user' ? 'You' : 'DA'}
            </span>
            <span className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div data-testid="da-panel-input-area" className="p-2 border-t border-white/5 bg-black/20 shrink-0">
        <div className="flex gap-2">
          <input
            data-testid="da-input"
            aria-label="DA command input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="输入指令..."
            className="flex-1 px-3 py-1.5 rounded-md bg-white/5 text-white/80 text-sm border border-white/10 outline-none focus:border-blue-500/50 placeholder-white/25"
          />
          <button
            data-testid="da-send-button"
            aria-label="Send DA command"
            onClick={handleSend}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
