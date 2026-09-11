import type { ServerLifecycleStatus } from "@sigil/shared";
import { useConsole } from "../../hooks/useConsole";
import { useConsoleToken } from "../../hooks/useConsoleToken";
import { useNodes } from "../../hooks/useNodes";
import { useDeleteServer, usePowerAction, useServer } from "../../hooks/useServers";
import { ConsoleView } from "./console-view";
import { ServerStats } from "./server-stats";

const STATUS_COLORS: Record<ServerLifecycleStatus, string> = {
  offline: "#888",
  starting: "#2d8",
  running: "#2d8",
  stopping: "#d92",
  stopped: "#888",
  crashed: "#c00",
  creation_failed: "#c00",
};

export function ServerDetail({ serverId }: { serverId: string }) {
  const { data: server, isLoading } = useServer(serverId);
  const { data: nodesData } = useNodes();
  const powerMutation = usePowerAction(serverId);
  const deleteMutation = useDeleteServer();
  const nodeMap = new Map((nodesData ?? []).map((n) => [n.id, n.displayName]));

  const isRunning = server?.status === "running" || server?.status === "starting";
  const { data: tokenData } = useConsoleToken(serverId, isRunning);
  const { messages, connectionState, stats, sendMessage } = useConsole({
    daemonUrl: tokenData?.daemonUrl,
    token: tokenData?.token,
    enabled: isRunning,
  });

  if (isLoading) {
    return <p>Loading server...</p>;
  }

  if (!server) {
    return <p>Server not found</p>;
  }

  const canStart = ["offline", "stopped", "crashed", "creation_failed"].includes(server.status);
  const canStop = server.status === "running";
  const canRestart = ["running", "stopped", "crashed"].includes(server.status);

  return (
    <div>
      <h2>{server.name}</h2>
      <div style={{ marginBottom: "1rem" }}>
        <p>
          <strong>Status:</strong>{" "}
          <span style={{ color: STATUS_COLORS[server.status], fontWeight: "bold" }}>
            {server.status}
          </span>
        </p>
        <p>
          <strong>Node:</strong> {nodeMap.get(server.nodeId) ?? server.nodeId}
        </p>
        <p>
          <strong>Allocation ID:</strong> {server.allocationId ?? "none"}
        </p>
        <p>
          <strong>Created:</strong> {new Date(server.createdAt).toLocaleString()}
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => powerMutation.mutate("start")}
          disabled={!canStart || powerMutation.isPending}
        >
          {powerMutation.isPending ? "Working..." : "Start"}
        </button>
        <button
          type="button"
          onClick={() => powerMutation.mutate("stop")}
          disabled={!canStop || powerMutation.isPending}
        >
          {powerMutation.isPending ? "Working..." : "Stop"}
        </button>
        <button
          type="button"
          onClick={() => powerMutation.mutate("restart")}
          disabled={!canRestart || powerMutation.isPending}
        >
          {powerMutation.isPending ? "Working..." : "Restart"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                `Delete server "${server.name}"? This will remove the container and release allocations.`,
              )
            ) {
              deleteMutation.mutate(serverId);
            }
          }}
          disabled={deleteMutation.isPending}
          style={{ color: "#c00" }}
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete Server"}
        </button>
      </div>

      {powerMutation.data && "error" in powerMutation.data && powerMutation.data.error && (
        <p style={{ color: "#c00" }}>{powerMutation.data.error}</p>
      )}
      {deleteMutation.data && "error" in deleteMutation.data && deleteMutation.data.error && (
        <p style={{ color: "#c00" }}>{deleteMutation.data.error}</p>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <h3>Resource Stats</h3>
        <ServerStats stats={stats} isRunning={isRunning} />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <h3>Console</h3>
        <ConsoleView
          messages={messages}
          connectionState={connectionState}
          isRunning={isRunning}
          onSendCommand={sendMessage}
        />
      </div>
    </div>
  );
}
