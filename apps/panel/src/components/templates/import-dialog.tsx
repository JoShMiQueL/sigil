import { useState } from "react";

interface ImportDialogProps {
  onImport: (
    file: File,
    tags: string[],
    conflict: "overwrite" | "skip",
  ) => Promise<{ error?: string; skippedFields?: string[]; conflict?: string }>;
  onClose: () => void;
}

export function ImportDialog({ onImport, onClose }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [conflict, setConflict] = useState<"overwrite" | "skip">("skip");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ skippedFields: string[]; conflict: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }
    setError(null);
    setImporting(true);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await onImport(file, tags, conflict);
    setImporting(false);

    if (res.error) {
      setError(res.error);
    } else if (res.skippedFields !== undefined && res.conflict) {
      setResult({ skippedFields: res.skippedFields, conflict: res.conflict });
    }
  };

  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", marginBottom: "1rem" }}>
      <h2>Import Template</h2>
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      {result && (
        <div style={{ marginBottom: "0.5rem" }}>
          <p>
            <strong>Result:</strong> {result.conflict}
          </p>
          {result.skippedFields.length > 0 && (
            <div>
              <strong>Skipped fields:</strong>
              <ul>
                {result.skippedFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="import-file">
          File (PTDL_v2 JSON or native YAML):
          <input
            id="import-file"
            type="file"
            accept=".json,.yaml,.yml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="import-tags">
          Tags (comma-separated):
          <input
            id="import-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="minecraft, java"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="import-conflict">
          Conflict strategy:
          <select
            id="import-conflict"
            value={conflict}
            onChange={(e) => setConflict(e.target.value as "overwrite" | "skip")}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="skip">Skip if exists</option>
            <option value="overwrite">Overwrite if exists</option>
          </select>
        </label>
      </div>
      <button type="button" onClick={handleImport} disabled={importing}>
        {importing ? "Importing..." : "Import"}
      </button>
      <button type="button" onClick={onClose} style={{ marginLeft: "0.5rem" }}>
        Close
      </button>
    </div>
  );
}
