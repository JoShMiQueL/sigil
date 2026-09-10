import { useState } from "react";
import { useAddAllocations } from "../../hooks/use-allocations";

interface AllocationFormProps {
  nodeId: string | undefined;
}

export function AllocationForm({ nodeId }: AllocationFormProps) {
  const [ip, setIp] = useState("");
  const [portStart, setPortStart] = useState("");
  const [portEnd, setPortEnd] = useState("");
  const [protocol, setProtocol] = useState("tcp");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addMutation = useAddAllocations(nodeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const start = Number.parseInt(portStart, 10);
    if (!start || start < 1 || start > 65535) {
      setError("Port start must be 1-65535");
      return;
    }

    const end = portEnd ? Number.parseInt(portEnd, 10) : undefined;
    if (end !== undefined && (end < 1 || end > 65535)) {
      setError("Port end must be 1-65535");
      return;
    }
    if (end !== undefined && end < start) {
      setError("Port end must be >= port start");
      return;
    }

    // Confirmation for large ranges
    const count = end !== undefined ? end - start + 1 : 1;
    if (count > 100 && !confirm(`This will create ${count} allocations. Continue?`)) {
      return;
    }

    const result = await addMutation.mutateAsync({ ip, portStart: start, portEnd: end, protocol });
    if ("error" in result) {
      setError(result.error);
    } else {
      setSuccess(`Created ${result.created} allocations (${result.skipped} already existed)`);
      setIp("");
      setPortStart("");
      setPortEnd("");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "1rem",
        background: "#1a1a2e",
        borderRadius: "6px",
        border: "1px solid #333",
        margin: "1rem 0",
      }}
    >
      <h3>Add Allocations</h3>
      {error && <p style={{ color: "#c00" }}>{error}</p>}
      {success && <p style={{ color: "#2d8" }}>{success}</p>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label
            htmlFor="alloc-ip"
            style={{ display: "block", fontSize: "0.75rem", color: "#888" }}
          >
            IP Address
          </label>
          <input
            id="alloc-ip"
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="203.0.113.10"
            required
            style={{ width: "160px", fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label
            htmlFor="alloc-port-start"
            style={{ display: "block", fontSize: "0.75rem", color: "#888" }}
          >
            Port Start
          </label>
          <input
            id="alloc-port-start"
            type="number"
            value={portStart}
            onChange={(e) => setPortStart(e.target.value)}
            placeholder="25565"
            required
            min="1"
            max="65535"
            style={{ width: "80px" }}
          />
        </div>
        <div>
          <label
            htmlFor="alloc-port-end"
            style={{ display: "block", fontSize: "0.75rem", color: "#888" }}
          >
            Port End (optional)
          </label>
          <input
            id="alloc-port-end"
            type="number"
            value={portEnd}
            onChange={(e) => setPortEnd(e.target.value)}
            placeholder="25575"
            min="1"
            max="65535"
            style={{ width: "80px" }}
          />
        </div>
        <div>
          <label
            htmlFor="alloc-protocol"
            style={{ display: "block", fontSize: "0.75rem", color: "#888" }}
          >
            Protocol
          </label>
          <select
            id="alloc-protocol"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            style={{ width: "80px" }}
          >
            <option value="tcp">tcp</option>
            <option value="udp">udp</option>
          </select>
        </div>
        <button type="submit" disabled={addMutation.isPending}>
          {addMutation.isPending ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
