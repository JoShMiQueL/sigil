import type { FileEntry } from "@sigil/shared";
import { useEffect, useState } from "react";
import { useFileContent, useWriteFile } from "../../hooks/useFiles";

interface FileEditorProps {
  serverId: string | undefined;
  file: FileEntry | null;
  onClose: () => void;
}

const MAX_EDIT_SIZE = 1048576; // 1MB

export function FileEditor({ serverId, file, onClose }: FileEditorProps) {
  const { data, isLoading, error } = useFileContent(serverId, file?.path ?? null);
  const writeMutation = useWriteFile(serverId);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setContent(data.content);
      setDirty(false);
      setSaved(false);
    }
  }, [data]);

  if (!file) {
    return null;
  }

  if (file.size > MAX_EDIT_SIZE) {
    return (
      <div style={{ padding: "16px", border: "1px solid #444", borderRadius: "4px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <h4 style={{ margin: 0 }}>{file.name}</h4>
          <button type="button" onClick={onClose} style={{ cursor: "pointer" }}>
            Close
          </button>
        </div>
        <p style={{ color: "#ff6b6b" }}>
          File is too large to edit ({(file.size / 1024 / 1024).toFixed(1)} MB). Maximum edit size
          is 1 MB. Please download the file to edit it externally.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: "16px", border: "1px solid #444", borderRadius: "4px" }}>
        <p>Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "16px", border: "1px solid #444", borderRadius: "4px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <h4 style={{ margin: 0 }}>{file.name}</h4>
          <button type="button" onClick={onClose} style={{ cursor: "pointer" }}>
            Close
          </button>
        </div>
        <p style={{ color: "#ff6b6b" }}>
          Error: {error instanceof Error ? error.message : "Failed to load file"}
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await writeMutation.mutateAsync({ path: file.path, content });
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleClose = () => {
    if (dirty) {
      if (!confirm("You have unsaved changes. Are you sure you want to close?")) {
        return;
      }
    }
    onClose();
  };

  return (
    <div style={{ padding: "16px", border: "1px solid #444", borderRadius: "4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <h4 style={{ margin: 0 }}>
          {file.name}
          {dirty && <span style={{ color: "#d92", marginLeft: "8px" }}>*</span>}
        </h4>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || writeMutation.isPending}
            style={{ cursor: dirty ? "pointer" : "not-allowed" }}
          >
            {writeMutation.isPending ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={handleClose} style={{ cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>

      {saved && <p style={{ color: "#2d8", marginBottom: "8px" }}>Saved successfully.</p>}
      {saveError && <p style={{ color: "#ff6b6b", marginBottom: "8px" }}>{saveError}</p>}

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
          setSaved(false);
        }}
        style={{
          width: "100%",
          minHeight: "400px",
          background: "#111",
          color: "#e0e0e0",
          border: "1px solid #333",
          borderRadius: "4px",
          padding: "8px",
          fontFamily: "monospace",
          fontSize: "14px",
          resize: "vertical",
        }}
      />
    </div>
  );
}
