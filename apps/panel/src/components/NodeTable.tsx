import type { Node } from "@sigilpanel/shared";

interface NodeTableProps {
  nodes: Node[];
  onRowClick?: (node: Node) => void;
}

const statusColors: Record<string, string> = {
  online: "#2d8",
  offline: "#c00",
  unknown: "#888",
};

export function NodeTable({ nodes, onRowClick }: NodeTableProps) {
  if (nodes.length === 0) {
    return <p style={{ color: "#666" }}>No nodes registered yet.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Status
          </th>
          <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Hostname
          </th>
          <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Region
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            CPU
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Memory
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Disk
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Containers
          </th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node) => (
          <tr
            key={node.id}
            onClick={() => onRowClick?.(node)}
            style={{ cursor: onRowClick ? "pointer" : "default" }}
          >
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
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
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
              {node.displayName}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>{node.regionName}</td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : "—"}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : "—"}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {node.diskUsage != null ? `${node.diskUsage.toFixed(1)}%` : "—"}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {node.containerCount ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
