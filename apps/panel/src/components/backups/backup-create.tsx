import { useState } from "react";
import { useCreateBackup } from "../../hooks/useBackups";

interface BackupCreateProps {
  serverId: string | undefined;
}

export function BackupCreate({ serverId }: BackupCreateProps) {
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const createMutation = useCreateBackup(serverId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(name.trim(), {
      onSuccess: () => {
        setName("");
        setShowForm(false);
      },
    });
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      {createMutation.error && (
        <p style={{ color: "#c00", marginBottom: "8px" }}>
          {(createMutation.error as Error).message}
        </p>
      )}
      {showForm ? (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Backup name"
            style={{ flex: 1, padding: "4px 8px" }}
          />
          <button type="submit" disabled={createMutation.isPending || !name.trim()}>
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)}>
          Create Backup
        </button>
      )}
    </div>
  );
}
