import { useState, useRef, useEffect } from "react";
import type { ServerMessage } from "../hooks/useWebSocket";

interface Message {
  role: "user" | "da";
  text: string;
}

interface Props {
  subscribe: (handler: (msg: ServerMessage) => void) => () => void;
  send: (msg: Record<string, unknown>) => void;
}

export default function ChatPanel({ subscribe, send }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "da", text: "DA 准备就绪。输入指令后按 Enter，我会把原文发送给所有 CC。" },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "da-message") {
        setMessages((prev) => [...prev, { role: "da", text: msg.text }]);
      }
    });
  }, [subscribe]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    send({ type: "da-input", text });
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1b26", borderRadius: 8, overflow: "hidden", border: "1px solid #292e42" }}>
      <div style={{ padding: "8px 12px", background: "#16161e", borderBottom: "1px solid #292e42" }}>
        <span style={{ color: "#7aa2f7", fontWeight: 700, fontSize: 14 }}>DA</span>
        <span style={{ color: "#565f89", fontSize: 12, marginLeft: 8 }}>Delegate Agent</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, color: msg.role === "user" ? "#7dcfff" : "#9ece6a", fontWeight: 600, marginBottom: 2 }}>
              {msg.role === "user" ? "You" : "DA"}
            </span>
            <span style={{ color: "#a9b1d6", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 8, borderTop: "1px solid #292e42", background: "#16161e" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入指令发送给所有 CC..."
            style={{
              flex: 1, padding: "8px 12px", background: "#24283b", color: "#a9b1d6", border: "1px solid #3b4261",
              borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: "8px 16px", background: "#7aa2f7", color: "#1a1b26", border: "none", borderRadius: 6,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
