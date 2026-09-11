import type { ServerLifecycleStatus } from "@sigil/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useNodes } from "../../hooks/useNodes";
import { useServers } from "../../hooks/useServers";

const STATUS_COLORS: Record<ServerLifecycleStatus, string> = {
  offline: "#888",
  starting: "#2d8",
  running: "#2d8",
  stopping: "#d92",
  stopped: "#888",
  crashed: "#c00",
  creation_failed: "#c00",
};

export function ServerList() {
  const navigate = useNavigate();
  const { data: nodesData } = useNodes();
  const [statusFilter, setStatusFilter] = useState("");
  const [nodeFilter, setNodeFilter] = useState("");

  const { data, isLoading } = useServers(nodeFilter || undefined, statusFilter || undefined);
  const servers = data?.servers ?? [];

  const distinctNodeIds = [...new Set((nodesData ?? []).map((n) => n.id))];
  const nodeMap = new Map((nodesData ?? []).map((n) => [n.id, n.displayName]));

  if (isLoading) {
    return <p>Loading servers...</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="offline">Offline</option>
          <option value="starting">Starting</option>
          <option value="running">Running</option>
          <option value="stopping">Stopping</option>
          <option value="stopped">Stopped</option>
          <option value="crashed">Crashed</option>
          <option value="creation_failed">Creation Failed</option>
        </select>
        <select
          value={nodeFilter}
          onChange={(e) => setNodeFilter(e.target.value)}
          aria-label="Filter by node"
        >
          <option value="">All Nodes</option>
          {distinctNodeIds.map((id) => (
            <option key={id} value={id}>
              {nodeMap.get(id) ?? id}
            </option>
          ))}
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Node</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {servers.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: "1rem", textAlign: "center", color: "#888" }}>
                No servers yet
              </td>
            </tr>
          ) : (
            servers.map((s) => (
              <tr
                key={s.id}
                style={{ borderBottom: "1px solid #222", cursor: "pointer" }}
                onClick={() => navigate({ to: `/servers/${s.id}` })}
              >
                <td style={{ padding: "0.5rem" }}>{s.name}</td>
                <td style={{ padding: "0.5rem" }}>{nodeMap.get(s.nodeId) ?? s.nodeId}</td>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ color: STATUS_COLORS[s.status] }}>{s.status}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.5rem" }}>
        Showing {servers.length} of {data?.total ?? 0}
      </p>
    </div>
  );
}
