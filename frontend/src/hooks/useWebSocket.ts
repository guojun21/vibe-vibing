import { useEffect, useRef, useCallback, useState } from "react";

export type ServerMessage =
  | { type: "terminal-output"; sessionId: string; data: string }
  | { type: "da-message"; text: string }
  | { type: "cc-status"; sessionId: string; status: string }
  | { type: "sessions"; sessions: { id: string; name: string; status: string }[] };

type MessageHandler = (msg: ServerMessage) => void;

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { console.log("[WS] connected to", url); setConnected(true); };
      ws.onclose = (e) => {
        console.log("[WS] closed", e.code, e.reason);
        setConnected(false);
        setTimeout(connect, 2000);
      };
      ws.onerror = (e) => { console.error("[WS] error", e); ws.close(); };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          handlersRef.current.forEach((h) => h(msg));
        } catch {
          // ignore non-JSON
        }
      };
    };

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [url]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { send, subscribe, connected };
}
