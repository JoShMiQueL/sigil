import type { FileEntry } from "@sigil/shared";
import { useState } from "react";
import { useCreateFile, useDeleteFile, useRenameFile } from "../../hooks/useFiles";

interface FileToolbarProps {
  serverId: string | undefined;
  currentPath: string;
  selectedEntry: FileEntry | null;
  onActionComplete?: () => void;
}

function isValidName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("\0")) return false;
  if (name === "." || name === "..") return false;
  return true;
}

function joinPath(dir: string, name: string): string {
  return dir === "." ? name : `${dir}/${name}`;
}

export function FileToolbar({
  serverId,
  currentPath,
  selectedEntry,
  onActionComplete,
}: FileToolbarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<"file" | "directory">("file");
  const [showRename, setShowRename] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateFile(serverId);
  const deleteMutation = useDeleteFile(serverId);
  const renameMutation = useRenameFile(serverId);

  const handleCreate = async () => {
    if (!isValidName(createName)) {
      setError("Invalid name. Names cannot contain /, \\, null bytes, or be . or ..");
      return;
    }
    setError(null);
    try {
      const fullPath = joinPath(currentPath, createName);
      await createMutation.mutateAsync({ path: fullPath, type: createType });
      setShowCreate(false);
      setCreateName("");
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;
    if (!confirm(`Delete "${selectedEntry.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(selectedEntry.path);
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRename = async () => {
    if (!selectedEntry) return;
    if (!isValidName(renameName)) {
      setError("Invalid name. Names cannot contain /, \\, null bytes, or be . or ..");
      return;
    }
    setError(null);
    try {
      const parentDir = selectedEntry.path.includes("/")
        ? selectedEntry.path.substring(0, selectedEntry.path.lastIndexOf("/"))
        : ".";
      const toPath = joinPath(parentDir, renameName);
      await renameMutation.mutateAsync({ from: selectedEntry.path, to: toPath });
      setShowRename(false);
      setRenameName("");
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setShowCreate(!showCreate);
            setShowRename(false);
            setError(null);
          }}
        >
          New File
        </button>
        <button
          type="button"
          onClick={() => {
            setCreateType("directory");
            setShowCreate(!showCreate);
            setShowRename(false);
            setError(null);
          }}
        >
          New Folder
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!selectedEntry || deleteMutation.isPending}
          style={{
            cursor: selectedEntry ? "pointer" : "not-allowed",
            color: selectedEntry ? "#c00" : "#666",
          }}
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedEntry) {
              setRenameName(selectedEntry.name);
              setShowRename(!showRename);
              setShowCreate(false);
              setError(null);
            }
          }}
          disabled={!selectedEntry}
          style={{ cursor: selectedEntry ? "pointer" : "not-allowed" }}
        >
          Rename
        </button>
      </div>

      {showCreate && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            padding: "8px",
            border: "1px solid #444",
            borderRadius: "4px",
          }}
        >
          <span style={{ fontSize: "14px" }}>
            New {createType === "directory" ? "folder" : "file"}:
          </span>
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={createType === "directory" ? "folder name" : "file name"}
            style={{
              flex: 1,
              background: "#111",
              color: "#e0e0e0",
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "4px 8px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowCreate(false);
            }}
          />
          <button type="button" onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
          <button type="button" onClick={() => setShowCreate(false)}>
            Cancel
          </button>
        </div>
      )}

      {showRename && selectedEntry && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            padding: "8px",
            border: "1px solid #444",
            borderRadius: "4px",
          }}
        >
          <span style={{ fontSize: "14px" }}>Rename to:</span>
          <input
            type="text"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            style={{
              flex: 1,
              background: "#111",
              color: "#e0e0e0",
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "4px 8px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setShowRename(false);
            }}
          />
          <button type="button" onClick={handleRename} disabled={renameMutation.isPending}>
            {renameMutation.isPending ? "Renaming..." : "Rename"}
          </button>
          <button type="button" onClick={() => setShowRename(false)}>
            Cancel
          </button>
        </div>
      )}

      {error && <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>}
    </div>
  );
}
