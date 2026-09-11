import type { DaemonToBrowserMessage } from "@sigil/shared";
import { useEffect, useRef, useState } from "react";
import type { ConsoleConnectionState } from "../../hooks/useConsole";

const STATE_LABELS: Record<ConsoleConnectionState, string> = {
  connecting: "Connecting...",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
  error: "Error",
};

const STATE_COLORS: Record<ConsoleConnectionState, string> = {
  connecting: "#2d8",
  connected: "#2d8",
  reconnecting: "#d92",
  disconnected: "#888",
  error: "#c00",
};

interface ConsoleViewProps {
  messages: DaemonToBrowserMessage[];
  connectionState: ConsoleConnectionState;
  isRunning: boolean;
  onSendCommand: (text: string) => void;
}

export function ConsoleView({
  messages,
  connectionState,
  isRunning,
  onSendCommand,
}: ConsoleViewProps) {
  const [input, setInput] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom on new messages unless user scrolled up
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable, only messages triggers scroll
  useEffect(() => {
    if (autoScrollRef.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const handleSendCommand = () => {
    const text = input.trim();
    if (!text) return;
    onSendCommand(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const canSend = isRunning && connectionState === "connected";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: STATE_COLORS[connectionState],
          }}
        />
        <span style={{ fontSize: "13px", color: STATE_COLORS[connectionState] }}>
          {STATE_LABELS[connectionState]}
        </span>
      </div>

      <pre
        ref={outputRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: "300px",
          maxHeight: "500px",
          overflow: "auto",
          background: "#1a1a2e",
          color: "#e0e0e0",
          padding: "12px",
          borderRadius: "6px",
          fontFamily: "monospace",
          fontSize: "13px",
          lineHeight: "1.4",
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {messages.length === 0
          ? isRunning
            ? "Waiting for output..."
            : "Server is not running."
          : messages
              .map((msg) => {
                if (msg.type === "output") {
                  return msg.text;
                }
                if (msg.type === "error") {
                  return `[ERROR] ${msg.message}`;
                }
                return "";
              })
              .join("\n")}
      </pre>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canSend}
          placeholder={canSend ? "Type a command and press Enter..." : "Console input disabled"}
          maxLength={4096}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #333",
            background: "#1a1a2e",
            color: "#e0e0e0",
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        />
        <button
          type="button"
          onClick={handleSendCommand}
          disabled={!canSend}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: canSend ? "#2d8" : "#444",
            color: "#fff",
            cursor: canSend ? "pointer" : "not-allowed",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
