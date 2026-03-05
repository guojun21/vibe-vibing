import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { ServerMessage } from "../hooks/useWebSocket";

interface Props {
  sessionId: string;
  name: string;
  status: string;
  subscribe: (handler: (msg: ServerMessage) => void) => () => void;
  send: (msg: Record<string, unknown>) => void;
}

export default function TerminalPanel({ sessionId, name, status, subscribe, send }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: false,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#414868",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#c0caf5",
      },
      scrollback: 5000,
      convertEol: true,
      disableStdin: false,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      send({ type: "terminal-input", sessionId, data });
    });

    const unsubscribe = subscribe((msg) => {
      if (msg.type === "terminal-output" && msg.sessionId === sessionId) {
        console.log(`[TERM ${sessionId}] received ${msg.data.length} chars`);
        term.write(msg.data);
      }
    });

    term.onResize(({ cols, rows }) => {
      send({ type: "terminal-resize", sessionId, cols, rows });
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    resizeObserver.observe(containerRef.current);

    // Trigger initial fit + resize, then request current screen content
    requestAnimationFrame(() => {
      fit.fit();
      send({ type: "terminal-attach", sessionId });
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId, subscribe, send]);

  const statusColor =
    status === "idle" || status === "completed" ? "#73daca" :
    status === "processing" ? "#ff9e64" :
    status === "permission" ? "#f7768e" : "#565f89";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1b26", borderRadius: 8, overflow: "hidden", border: "1px solid #292e42" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#16161e", borderBottom: "1px solid #292e42", flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor }} />
        <span style={{ color: "#a9b1d6", fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span style={{ color: "#565f89", fontSize: 12 }}>[{status}]</span>
      </div>
      <div ref={containerRef} style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }} />
    </div>
  );
}
