import type { SSEConnectionState } from "../hooks/useSSE";

interface ReconnectingIndicatorProps {
  state: SSEConnectionState;
}

export function ReconnectingIndicator({ state }: ReconnectingIndicatorProps) {
  if (state === "connected" || state === "connecting") return null;

  let message: string;
  let color: string;

  if (state === "reconnecting") {
    message = "Reconnecting to real-time updates...";
    color = "#c80";
  } else if (state === "degraded") {
    message = "Degraded mode — real-time updates paused, using HTTP polling";
    color = "#c80";
  } else {
    message = "Real-time updates disconnected. Refresh the page to retry.";
    color = "#c00";
  }

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
