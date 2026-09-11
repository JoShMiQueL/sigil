import { useState } from "react";
import { useTemplates } from "../../hooks/use-templates";
import { useNodes } from "../../hooks/useNodes";
import { useCreateServer } from "../../hooks/useServers";

export function ServerCreateDialog({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateServer();
  const { data: nodesData } = useNodes();
  const { data: templatesData } = useTemplates();
  const [name, setName] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeTemplates = (templatesData ?? []).filter((t) => t.active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name || !nodeId || !templateId) {
      setError("All fields are required");
      return;
    }
    const result = await createMutation.mutateAsync({ name, nodeId, templateId, variables: {} });
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      onClose();
    }
  };

  return (
    <div
      style={{ padding: "1rem", border: "1px solid #444", borderRadius: "4px", marginTop: "1rem" }}
    >
      <h3>Create Server</h3>
      {error && <p style={{ color: "#c00" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "0.5rem" }}>
          <label
            htmlFor="server-name"
            style={{ display: "block", fontSize: "0.85rem", color: "#888" }}
          >
            Name
          </label>
          <input
            id="server-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Game Server"
            style={{ width: "100%", maxWidth: "300px" }}
          />
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <label
            htmlFor="server-node"
            style={{ display: "block", fontSize: "0.85rem", color: "#888" }}
          >
            Node
          </label>
          <select
            id="server-node"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            style={{ width: "100%", maxWidth: "300px" }}
          >
            <option value="">Select a node...</option>
            {(nodesData ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.displayName}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <label
            htmlFor="server-template"
            style={{ display: "block", fontSize: "0.85rem", color: "#888" }}
          >
            Template
          </label>
          <select
            id="server-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{ width: "100%", maxWidth: "300px" }}
          >
            <option value="">Select a template...</option>
            {activeTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Server"}
          </button>
          <button type="button" onClick={onClose} style={{ marginLeft: "0.5rem" }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
