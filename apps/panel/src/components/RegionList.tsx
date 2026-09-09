import type { RegionWithCounts } from "@sigilpanel/shared";

interface RegionListProps {
  regions: RegionWithCounts[];
  onDelete: (id: string) => Promise<{ error?: string }>;
}

export function RegionList({ regions, onDelete }: RegionListProps) {
  if (regions.length === 0) {
    return <p>No regions yet. Create one to get started.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Name
          </th>
          <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Description
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Nodes
          </th>
          <th style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid #ccc" }}>
            Servers
          </th>
          <th style={{ padding: "0.5rem", borderBottom: "1px solid #ccc" }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {regions.map((region) => (
          <tr key={region.id}>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>{region.name}</td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", color: "#666" }}>
              {region.description ?? "—"}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {region.nodeCount}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee", textAlign: "right" }}>
              {region.serverCount}
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
              <button
                type="button"
                onClick={async () => {
                  await onDelete(region.id);
                }}
                disabled={region.nodeCount > 0}
                style={{
                  cursor: region.nodeCount > 0 ? "not-allowed" : "pointer",
                  color: region.nodeCount > 0 ? "#999" : "#c00",
                }}
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
