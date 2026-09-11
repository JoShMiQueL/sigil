import type { Backup } from "@sigil/shared";
import { useState } from "react";
import { useDeleteBackup, useRestoreBackup } from "../../hooks/useBackups";

interface BackupListProps {
  serverId: string | undefined;
  backups: Backup[];
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#888",
  in_progress: "#2d8",
  completed: "#2d8",
  failed: "#c00",
};

export function BackupList({ serverId, backups }: BackupListProps) {
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const restoreMutation = useRestoreBackup(serverId);
  const deleteMutation = useDeleteBackup(serverId);

  const handleRestore = (backupId: string) => {
    restoreMutation.mutate(backupId, {
      onSuccess: () => setConfirmRestore(null),
    });
  };

  const handleDelete = (backupId: string) => {
    deleteMutation.mutate(backupId, {
      onSuccess: () => setConfirmDelete(null),
    });
  };

  if (backups.length === 0) {
    return <p style={{ color: "#888" }}>No backups yet.</p>;
  }

  return (
    <div>
      {restoreMutation.error && (
        <p style={{ color: "#c00", marginBottom: "8px" }}>
          Restore failed: {(restoreMutation.error as Error).message}
        </p>
      )}
      {deleteMutation.error && (
        <p style={{ color: "#c00", marginBottom: "8px" }}>
          Delete failed: {(deleteMutation.error as Error).message}
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "8px" }}>Name</th>
            <th style={{ padding: "8px" }}>Size</th>
            <th style={{ padding: "8px" }}>Status</th>
            <th style={{ padding: "8px" }}>Storage</th>
            <th style={{ padding: "8px" }}>Created</th>
            <th style={{ padding: "8px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.id} style={{ borderBottom: "1px solid #222" }}>
              <td style={{ padding: "8px" }}>{backup.name}</td>
              <td style={{ padding: "8px" }}>{formatSize(backup.sizeBytes)}</td>
              <td style={{ padding: "8px" }}>
                <span style={{ color: STATUS_COLORS[backup.status] ?? "#888" }}>
                  {backup.status}
                </span>
                {backup.errorMessage && (
                  <span style={{ color: "#c00", marginLeft: "8px", fontSize: "0.85em" }}>
                    ({backup.errorMessage})
                  </span>
                )}
              </td>
              <td style={{ padding: "8px" }}>{backup.storageLocation}</td>
              <td style={{ padding: "8px" }}>{formatDate(backup.createdAt)}</td>
              <td style={{ padding: "8px" }}>
                {backup.status === "completed" &&
                  (confirmRestore === backup.id ? (
                    <span>
                      <button
                        type="button"
                        onClick={() => handleRestore(backup.id)}
                        disabled={restoreMutation.isPending}
                        style={{ marginRight: "4px" }}
                      >
                        Confirm Restore
                      </button>
                      <button type="button" onClick={() => setConfirmRestore(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(backup.id)}
                      style={{ marginRight: "4px" }}
                    >
                      Restore
                    </button>
                  ))}
                {backup.status !== "in_progress" &&
                  (confirmDelete === backup.id ? (
                    <span>
                      <button
                        type="button"
                        onClick={() => handleDelete(backup.id)}
                        disabled={deleteMutation.isPending}
                        style={{ marginRight: "4px" }}
                      >
                        Confirm Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(backup.id)}>
                      Delete
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
