import { useRef, useState } from "react";
import { downloadFileUrl, useUploadFile } from "../../hooks/useFiles";

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB

interface FileUploadProps {
  serverId: string | undefined;
  currentPath: string;
  onUploaded?: () => void;
}

export function FileUpload({ serverId, currentPath, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const uploadMutation = useUploadFile(serverId);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !serverId) return;

    setError(null);
    setSuccess(null);

    if (file.size > MAX_UPLOAD_SIZE) {
      setError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 100 MB.`,
      );
      return;
    }

    try {
      await uploadMutation.mutateAsync({ dir: currentPath, file });
      setSuccess(`Uploaded ${file.name}`);
      onUploaded?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      const code = (err as Error & { code?: string }).code;
      if (code === "FILE_EXISTS") {
        if (confirm(`File "${file.name}" already exists. Overwrite?`)) {
          try {
            await uploadMutation.mutateAsync({ dir: currentPath, file, overwrite: true });
            setSuccess(`Uploaded ${file.name}`);
            onUploaded?.();
          } catch (retryErr) {
            setError(retryErr instanceof Error ? retryErr.message : "Upload failed");
          }
        }
      } else {
        setError(msg);
      }
    }

    // Reset input so the same file can be selected again
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={uploadMutation.isPending}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          style={{ cursor: uploadMutation.isPending ? "not-allowed" : "pointer" }}
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload File"}
        </button>
      </div>

      {error && <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>}
      {success && <p style={{ color: "#2d8", margin: 0 }}>{success}</p>}
    </div>
  );
}

interface DownloadButtonProps {
  serverId: string | undefined;
  path: string;
  filename: string;
}

export function DownloadButton({ serverId, path, filename }: DownloadButtonProps) {
  if (!serverId) return null;

  const handleDownload = async () => {
    const url = downloadFileUrl(serverId, path);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Download failed");
      return;
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      style={{ cursor: "pointer", padding: "2px 8px", fontSize: "12px" }}
    >
      Download
    </button>
  );
}
