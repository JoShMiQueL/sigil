import type { SSEConnectionState } from "../hooks/useSSE";

interface ReconnectingIndicatorProps {
  state: SSEConnectionState;
}

export function ReconnectingIndicator({ state }: ReconnectingIndicatorProps) {
  if (state === "connected" || state === "connecting") return null;

  const message =
    state === "reconnecting"
      ? "Reconnecting to real-time updates..."
      : "Real-time updates disconnected. Refresh the page to retry.";

  const color = state === "reconnecting" ? "#c80" : "#c00";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        padding: "8px 16px",
        background: color,
        color: "white",
        textAlign: "center",
        fontSize: "14px",
        zIndex: 9999,
      }}
    >
      {message}
    </div>
  );
}
