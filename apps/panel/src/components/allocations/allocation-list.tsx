import { useState } from "react";
import {
  useAllocations,
  useAssignAllocation,
  useDeleteAllocation,
  useUnassignAllocation,
} from "../../hooks/use-allocations";

interface AllocationListProps {
  nodeId: string | undefined;
}

export function AllocationList({ nodeId }: AllocationListProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [portSearch, setPortSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignServerId, setAssignServerId] = useState("");
  const [assignIsPrimary, setAssignIsPrimary] = useState(false);

  const filters: { status?: string; ip?: string; port?: number } = {};
  if (statusFilter) filters.status = statusFilter;
  if (ipFilter) filters.ip = ipFilter;
  if (portSearch) {
    const p = Number.parseInt(portSearch, 10);
    if (p > 0) filters.port = p;
  }

  const { data, isLoading } = useAllocations(nodeId, filters);
  const deleteMutation = useDeleteAllocation(nodeId);
  const assignMutation = useAssignAllocation(nodeId);
  const unassignMutation = useUnassignAllocation(nodeId);

  const handleDelete = async (allocationId: string) => {
    setError(null);
    const result = await deleteMutation.mutateAsync(allocationId);
    if ("error" in result && result.error) {
      setError(result.error);
    }
  };

  const handleAssign = async (allocationId: string) => {
    setError(null);
    if (!assignServerId.trim()) {
      setError("Server ID is required");
      return;
    }
    const result = await assignMutation.mutateAsync({
      allocationId,
      serverId: assignServerId.trim(),
      isPrimary: assignIsPrimary,
    });
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      setAssigningId(null);
      setAssignServerId("");
      setAssignIsPrimary(false);
    }
  };

  const handleUnassign = async (allocationId: string) => {
    setError(null);
    const result = await unassignMutation.mutateAsync(allocationId);
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
                  {a.status === "available" ? (
                    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAssigningId(a.id);
                          setAssignServerId("");
                          setAssignIsPrimary(false);
                          setError(null);
                        }}
                        disabled={assignMutation.isPending}
                        style={{ color: "#6af" }}
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={deleteMutation.isPending}
                        style={{ color: "#c00" }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUnassign(a.id)}
                      disabled={unassignMutation.isPending}
                      style={{ color: "#d92" }}
                    >
                      Unassign
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

      {/* Assign dialog */}
      {assigningId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setAssigningId(null)}
        >
          <div
            style={{
              background: "#1a1a2e",
              border: "1px solid #444",
              borderRadius: "8px",
              padding: "1.5rem",
              minWidth: "360px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 1rem 0" }}>Assign Allocation</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label
                  htmlFor="assign-server-id"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#888",
                    marginBottom: "0.25rem",
                  }}
                >
                  Server ID
                </label>
                <input
                  id="assign-server-id"
                  type="text"
                  value={assignServerId}
                  onChange={(e) => setAssignServerId(e.target.value)}
                  placeholder="00000000-0000-4000-8000-000000000000"
                  style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={assignIsPrimary}
                  onChange={(e) => setAssignIsPrimary(e.target.checked)}
                />
                Set as primary allocation
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginTop: "1rem",
                justifyContent: "flex-end",
              }}
            >
              <button type="button" onClick={() => setAssigningId(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAssign(assigningId)}
                disabled={assignMutation.isPending || !assignServerId.trim()}
              >
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
