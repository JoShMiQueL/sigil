import type { Node } from "@sigil/shared";

const statusColors: Record<string, string> = {
  online: "#2d8",
  offline: "#c00",
  unknown: "#888",
};

export function NodeDetailPanel({ node }: { node: Node }) {
  return (
    <dl style={{ marginTop: "1rem" }}>
      <dt>Hostname</dt>
      <dd>{node.hostname}</dd>
      <dt>IP Address</dt>
      <dd>{node.ipAddress}</dd>
      <dt>Region</dt>
      <dd>{node.regionName}</dd>
      <dt>Display Name</dt>
      <dd>{node.displayName}</dd>
      <dt>Status</dt>
      <dd>
        <span
          style={{
            display: "inline-block",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: statusColors[node.status] ?? "#888",
            marginRight: "0.5rem",
          }}
        />
        {node.status}
      </dd>
      <dt>CPU</dt>
      <dd>{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : "—"}</dd>
      <dt>Memory</dt>
      <dd>{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : "—"}</dd>
      <dt>Disk</dt>
      <dd>{node.diskUsage != null ? `${node.diskUsage.toFixed(1)}%` : "—"}</dd>
      <dt>Containers</dt>
      <dd>{node.containerCount ?? "—"}</dd>
      <dt>Capabilities</dt>
      <dd>
        {Object.keys(node.capabilities ?? {}).length > 0
          ? Object.entries(node.capabilities)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
              .join(", ")
          : "—"}
      </dd>
      <dt>Last Heartbeat</dt>
      <dd>{node.lastHeartbeatAt ? new Date(node.lastHeartbeatAt).toLocaleString() : "Never"}</dd>
    </dl>
  );
}
