import { useState } from "react";
import { useAllocations, useDeleteAllocation } from "../../hooks/use-allocations";

interface AllocationListProps {
  nodeId: string | undefined;
}

export function AllocationList({ nodeId }: AllocationListProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [portSearch, setPortSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filters: { status?: string; ip?: string; port?: number } = {};
  if (statusFilter) filters.status = statusFilter;
  if (ipFilter) filters.ip = ipFilter;
  if (portSearch) {
    const p = Number.parseInt(portSearch, 10);
    if (p > 0) filters.port = p;
  }

  const { data, isLoading } = useAllocations(nodeId, filters);
  const deleteMutation = useDeleteAllocation(nodeId);

  const handleDelete = async (allocationId: string) => {
    setError(null);
    const result = await deleteMutation.mutateAsync(allocationId);
    if ("error" in result && result.error) {
      setError(result.error);
    }
  };

  if (isLoading) return <p>Loading allocations...</p>;

  const allocations = data?.allocations ?? [];

  // Get distinct IPs for the filter dropdown
  const distinctIps = [...new Set(allocations.map((a) => a.ip))].sort();

  return (
    <div>
      {error && <p style={{ color: "#c00" }}>{error}</p>}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "120px" }}
        >
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
        </select>
        <select
          value={ipFilter}
          onChange={(e) => setIpFilter(e.target.value)}
          style={{ width: "160px", fontFamily: "monospace" }}
        >
          <option value="">All IPs</option>
          {distinctIps.map((ip) => (
            <option key={ip} value={ip}>
              {ip}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={portSearch}
          onChange={(e) => setPortSearch(e.target.value)}
          placeholder="Search port..."
          style={{ width: "120px" }}
        />
        {(statusFilter || ipFilter || portSearch) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setIpFilter("");
              setPortSearch("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {allocations.length === 0 ? (
        <p style={{ color: "#888" }}>No allocations found. Add some using the form above.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>IP</th>
              <th style={{ padding: "0.5rem" }}>Port</th>
              <th style={{ padding: "0.5rem" }}>Protocol</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Server</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{a.ip}</td>
                <td style={{ padding: "0.5rem" }}>{a.port}</td>
                <td style={{ padding: "0.5rem" }}>{a.protocol}</td>
                <td style={{ padding: "0.5rem" }}>
                  {a.status === "available" ? (
                    <span style={{ color: "#2d8" }}>available</span>
                  ) : (
                    <span style={{ color: "#d92" }}>assigned{a.isPrimary ? " (primary)" : ""}</span>
                  )}
                </td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {a.serverId ? a.serverId.slice(0, 8) + "..." : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {a.status === "available" && (
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={deleteMutation.isPending}
                      style={{ color: "#c00" }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary line */}
      {data && (
        <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.5rem" }}>
          Showing {allocations.length} of {data.total} — {data.available} available, {data.assigned}{" "}
          assigned
        </p>
      )}
    </div>
  );
}
