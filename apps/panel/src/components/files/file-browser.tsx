import type { FileEntry } from "@sigil/shared";
import { useState } from "react";
import { useDeleteFile, useFileList, useRenameFile } from "../../hooks/useFiles";
import { FileToolbar } from "./file-toolbar";
import { DownloadButton, FileUpload } from "./file-upload";

interface FileBrowserProps {
  serverId: string | undefined;
  isRunning: boolean;
  onOpenFile?: (entry: FileEntry) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function joinPath(dir: string, name: string): string {
  return dir === "." ? name : `${dir}/${name}`;
}

export function FileBrowser({ serverId, isRunning, onOpenFile }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(".");
  const { data, isLoading, error, refetch } = useFileList(serverId, currentPath);
  const deleteMutation = useDeleteFile(serverId);
  const renameMutation = useRenameFile(serverId);

  if (!isRunning) {
    return (
      <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
        Server is not running. File operations are disabled.
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ padding: "16px", color: "#888" }}>Loading files...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "16px", color: "#ff6b6b" }}>
        Error: {error instanceof Error ? error.message : "Failed to load files"}
      </div>
    );
  }

  const entries = data?.entries ?? [];

  // Build breadcrumb segments
  const segments = currentPath === "." ? [] : currentPath.split("/").filter(Boolean);
  const breadcrumbs = [{ label: "root", path: "." }];
  let accum = "";
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    breadcrumbs.push({ label: seg, path: accum });
  }

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(entry.path);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRename = async (entry: FileEntry) => {
    const newName = prompt(`Rename "${entry.name}" to:`, entry.name);
    if (!newName || newName === entry.name) return;
    if (newName.includes("/") || newName.includes("\\") || newName.includes("\0")) {
      alert("Invalid name. Names cannot contain /, \\, or null bytes.");
      return;
    }
    const parentDir = entry.path.includes("/")
      ? entry.path.substring(0, entry.path.lastIndexOf("/"))
      : ".";
    const toPath = joinPath(parentDir, newName);
    try {
      await renameMutation.mutateAsync({ from: entry.path, to: toPath });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {i > 0 && <span style={{ color: "#666" }}>/</span>}
            <button
              type="button"
              onClick={() => setCurrentPath(crumb.path)}
              style={{
                background: "none",
                border: "none",
                color: i === breadcrumbs.length - 1 ? "#e0e0e0" : "#6cf",
                cursor: "pointer",
                padding: "2px 4px",
                font: "inherit",
              }}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar (New File / New Folder) */}
      <FileToolbar
        serverId={serverId}
        currentPath={currentPath}
        selectedEntry={null}
        onActionComplete={() => refetch()}
      />

      {/* Upload */}
      <FileUpload serverId={serverId} currentPath={currentPath} onUploaded={() => refetch()} />

      {/* File listing */}
      {entries.length === 0 ? (
        <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
          This directory is empty.
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Name</th>
              <th style={{ padding: "8px 12px", width: "100px" }}>Size</th>
              <th style={{ padding: "8px 12px", width: "180px" }}>Modified</th>
              <th style={{ padding: "8px 12px", width: "200px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.path}
                onClick={() => {
                  if (entry.isDir) {
                    setCurrentPath(entry.path);
                  } else {
                    onOpenFile?.(entry);
                  }
                }}
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid #222",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#1a1a2e";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                }}
              >
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ marginRight: "8px" }}>{entry.isDir ? "📁" : "📄"}</span>
                  <span style={{ color: entry.isDir ? "#6cf" : "#e0e0e0" }}>{entry.name}</span>
                </td>
                <td style={{ padding: "8px 12px", color: "#888" }}>
                  {entry.isDir ? "—" : formatSize(entry.size)}
                </td>
                <td style={{ padding: "8px 12px", color: "#888" }}>{formatDate(entry.modTime)}</td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRename(entry);
                      }}
                      style={{ padding: "2px 6px", fontSize: "12px", cursor: "pointer" }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry);
                      }}
                      style={{
                        padding: "2px 6px",
                        fontSize: "12px",
                        cursor: "pointer",
                        color: "#c00",
                      }}
                    >
                      Delete
                    </button>
                    {!entry.isDir && (
                      <DownloadButton serverId={serverId} path={entry.path} filename={entry.name} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
