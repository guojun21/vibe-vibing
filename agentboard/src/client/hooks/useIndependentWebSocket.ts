/**
 * Independent WebSocket connection for split-view terminals.
 * Each TerminalInstance gets its own WS connection so the server
 * can attach it to a different tmux session simultaneously.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ClientMessage, SendClientMessage, ServerMessage } from '@shared/types'
import type { ConnectionStatus } from '../stores/sessionStore'

type MessageListener = (message: ServerMessage) => void

export function useIndependentWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef(new Set<MessageListener>())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${scheme}://${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as ServerMessage
        if (parsed.type === 'pong') return
        listenersRef.current.forEach((l) => l(parsed))
      } catch { /* ignore */ }
    }

    ws.onerror = () => { /* onclose handles reconnect */ }

    ws.onclose = () => {
      wsRef.current = null
      setStatus('reconnecting')
      reconnectAttemptsRef.current += 1
      const delay = Math.min(1000 * 2 ** (reconnectAttemptsRef.current - 1), 15000)
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, delay)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const sendMessage = useMemo<SendClientMessage>(() => (message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  return { status, sendMessage, subscribe }
}
