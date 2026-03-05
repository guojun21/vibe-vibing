import { useState, useRef, useEffect, useCallback } from 'react'
import {
  useTeamStore,
  type DAMessage,
  type DAAgentEvent,
  type DAToolCallInfo,
  type DAToolResultInfo,
} from '../stores/team-state-store'

interface DAPanelProps {
  onSendToAll: (text: string) => void
  sendMessage?: (message: any) => void
  teamId?: string | null
}

function ToolCallBlock({ tc }: { tc: DAToolCallInfo }) {
  const [expanded, setExpanded] = useState(false)
  let parsedArgs: string
  try {
    parsedArgs = JSON.stringify(JSON.parse(tc.arguments), null, 2)
  } catch {
    parsedArgs = tc.arguments
  }

  return (
    <div
      data-testid={`tool-call-${tc.id}`}
      className="mt-1 rounded bg-white/5 border border-white/10 text-xs"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-white/5"
      >
        <span className="text-yellow-400 font-mono">{tc.name}</span>
        <span className="text-white/30 ml-auto">{expanded ? '[-]' : '[+]'}</span>
      </button>
      {expanded && (
        <pre className="px-2 py-1 border-t border-white/5 text-white/50 overflow-x-auto max-h-32">
          {parsedArgs}
        </pre>
      )}
    </div>
  )
}

function ToolResultBlock({ result }: { result: DAToolResultInfo }) {
  const [expanded, setExpanded] = useState(false)
  const preview = result.output.slice(0, 80) + (result.output.length > 80 ? '...' : '')

  return (
    <div
      data-testid={`tool-result-${result.id}`}
      className={`mt-1 rounded border text-xs ${
        result.isError ? 'bg-red-900/20 border-red-500/30' : 'bg-white/5 border-white/10'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-white/5"
      >
        <span className={`font-mono ${result.isError ? 'text-red-400' : 'text-green-400'}`}>
          {result.name}
        </span>
        <span className="text-white/40 truncate flex-1 ml-2">{preview}</span>
        <span className="text-white/30 ml-auto shrink-0">{expanded ? '[-]' : '[+]'}</span>
      </button>
      {expanded && (
        <pre className="px-2 py-1 border-t border-white/5 text-white/50 overflow-x-auto max-h-48 whitespace-pre-wrap">
          {result.output}
        </pre>
      )}
    </div>
  )
}

function AgentEventBlock({ event }: { event: DAAgentEvent }) {
  if (event.type === 'thinking' && event.content) {
    return (
      <div data-testid="da-event-thinking" className="flex flex-col">
        <span className="text-[10px] text-purple-400/80 font-semibold mb-0.5">
          DA Thinking (step {event.step})
        </span>
        <span className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">
          {event.content}
        </span>
      </div>
    )
  }

  if (event.type === 'tool-call' && event.toolCalls) {
    return (
      <div data-testid="da-event-tool-call" className="flex flex-col">
        <span className="text-[10px] text-yellow-400/80 font-semibold mb-0.5">
          Tool Calls (step {event.step})
        </span>
        {event.toolCalls.map((tc) => (
          <ToolCallBlock key={tc.id} tc={tc} />
        ))}
      </div>
    )
  }

  if (event.type === 'tool-result' && event.toolResults) {
    return (
      <div data-testid="da-event-tool-result" className="flex flex-col">
        <span className="text-[10px] text-blue-400/80 font-semibold mb-0.5">
          Tool Results (step {event.step})
        </span>
        {event.toolResults.map((r) => (
          <ToolResultBlock key={r.id} result={r} />
        ))}
      </div>
    )
  }

  if (event.type === 'complete') {
    return (
      <div data-testid="da-event-complete" className="flex flex-col">
        <span className="text-[10px] text-green-400 font-semibold mb-0.5">DA Complete</span>
        <span className="text-[12px] text-white/70 leading-relaxed whitespace-pre-wrap">
          {event.content}
        </span>
      </div>
    )
  }

  if (event.type === 'error') {
    return (
      <div data-testid="da-event-error" className="flex flex-col">
        <span className="text-[10px] text-red-400 font-semibold mb-0.5">DA Error</span>
        <span className="text-[12px] text-red-300/80 leading-relaxed whitespace-pre-wrap">
          {event.content}
        </span>
      </div>
    )
  }

  return null
}

export default function DAPanel({ onSendToAll, sendMessage, teamId }: DAPanelProps) {
  const { selectedTeamId, daMessages, daAgentEvents, daAgentRunning, clearDAAgentEvents } = useTeamStore()
  const activeTeamId = teamId ?? selectedTeamId
  const teamMessages = activeTeamId ? (daMessages[activeTeamId] || []) : []
  const agentEvents = activeTeamId ? (daAgentEvents[activeTeamId] || []) : []
  const isRunning = activeTeamId ? (daAgentRunning[activeTeamId] ?? false) : false

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showEvents, setShowEvents] = useState(true)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [teamMessages, agentEvents])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    if (activeTeamId) {
      clearDAAgentEvents(activeTeamId)
    }
    if (sendMessage && activeTeamId) {
      sendMessage({ type: 'da-input', teamId: activeTeamId, text })
    }
    onSendToAll(text)
    setInput('')
  }, [input, onSendToAll, sendMessage, activeTeamId, clearDAAgentEvents])

  return (
    <div data-testid="da-panel" className="flex flex-col h-full bg-terminal overflow-hidden rounded-lg border border-white/5">
      <div data-testid="da-panel-header" className="flex items-center gap-2 px-3 py-2 bg-black/20 border-b border-white/5 shrink-0">
        <span className="text-sm font-bold text-blue-400">DA</span>
        <span className="text-xs text-white/40">Delegate Agent</span>
        {isRunning && (
          <span data-testid="da-running-indicator" className="ml-auto flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px] text-yellow-400/70">working...</span>
          </span>
        )}
        {agentEvents.length > 0 && (
          <button
            data-testid="da-toggle-events"
            onClick={() => setShowEvents(!showEvents)}
            className="text-[10px] text-white/30 hover:text-white/60 ml-auto"
          >
            {showEvents ? 'Hide Steps' : 'Show Steps'}
          </button>
        )}
      </div>

      <div data-testid="da-panel-messages" className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {teamMessages.map((msg) => (
          <div key={msg.messageId} data-testid={`da-message-${msg.messageId}`} className="flex flex-col">
            <span className={`text-[11px] font-semibold mb-0.5 ${
              msg.role === 'user' ? 'text-cyan-400' : 'text-green-400'
            }`}>
              {msg.role === 'user' ? 'You' : 'DA'}
            </span>
            <span className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </span>
          </div>
        ))}

        {showEvents && agentEvents.length > 0 && (
          <div data-testid="da-agent-events" className="border-t border-white/10 pt-2 space-y-2">
            {agentEvents.map((event, i) => (
              <AgentEventBlock key={`${event.type}-${event.step}-${i}`} event={event} />
            ))}
          </div>
        )}

        {teamMessages.length === 0 && agentEvents.length === 0 && (
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold mb-0.5 text-green-400">DA</span>
            <span className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
              DA Agent ready. Type an instruction and press Enter. I will plan, dispatch to CCs, and report back.
            </span>
          </div>
        )}

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
            placeholder={isRunning ? 'DA is working...' : 'Type instruction...'}
            disabled={isRunning}
            className="flex-1 px-3 py-1.5 rounded-md bg-white/5 text-white/80 text-sm border border-white/10 outline-none focus:border-blue-500/50 placeholder-white/25 disabled:opacity-50"
          />
          <button
            data-testid="da-send-button"
            aria-label="Send DA command"
            onClick={handleSend}
            disabled={isRunning}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
