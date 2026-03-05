import { useState, useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import ChatPanel from "./components/ChatPanel";
import TerminalPanel from "./components/TerminalPanel";

interface CCSession {
  id: string;
  name: string;
  status: string;
}

const WS_URL = `ws://127.0.0.1:${import.meta.env.VITE_WS_PORT || 8765}/ws`;

export default function App() {
  const { send, subscribe, connected } = useWebSocket(WS_URL);
  const [sessions, setSessions] = useState<CCSession[]>([]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "sessions") {
        setSessions(msg.sessions);
      } else if (msg.type === "cc-status") {
        setSessions((prev) =>
          prev.map((s) => (s.id === msg.sessionId ? { ...s, status: msg.status } : s))
        );
      }
    });
  }, [subscribe]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1a1b26", color: "#a9b1d6", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", background: "#16161e", borderBottom: "1px solid #292e42", fontSize: 12 }}>
        <span style={{ color: "#7aa2f7", fontWeight: 700 }}>Vibe Curlaude</span>
        <span style={{ color: connected ? "#73daca" : "#f7768e" }}>
          {connected ? "● Connected" : "○ Disconnected"}
        </span>
        <span style={{ color: "#565f89" }}>
          CC: {sessions.length} instance{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", flex: "1 1 0", minHeight: 0, overflow: "hidden", gap: 4, padding: 4 }}>
        {/* Left: DA Chat */}
        <div style={{ width: "30%", minWidth: 300, display: "flex", flexDirection: "column" }}>
          <ChatPanel subscribe={subscribe} send={send} />
        </div>

        {/* Right: CC Terminals */}
        <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {sessions.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#565f89", fontSize: 14 }}>
              Waiting for CC sessions...
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <TerminalPanel
                  sessionId={session.id}
                  name={session.name}
                  status={session.status}
                  subscribe={subscribe}
                  send={send}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
