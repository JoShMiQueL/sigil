import { useEffect, useState } from "react";
import {
  useBackupStorageConfig,
  useTestBackupStorage,
  useUpdateBackupStorageConfig,
} from "../../hooks/useBackups";

interface BackupStorageConfigProps {
  nodeId: string | undefined;
}

export function BackupStorageConfig({ nodeId }: BackupStorageConfigProps) {
  const { data: config, isLoading } = useBackupStorageConfig(nodeId);
  const updateMutation = useUpdateBackupStorageConfig(nodeId);
  const testMutation = useTestBackupStorage(nodeId);

  const [backend, setBackend] = useState<"local" | "s3">("local");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [maxBackupSizeGb, setMaxBackupSizeGb] = useState(10);

  // Initialize form from loaded config
  useEffect(() => {
    if (config) {
      setBackend(config.backend as "local" | "s3");
      setS3Endpoint(config.s3Endpoint ?? "");
      setS3Bucket(config.s3Bucket ?? "");
      setS3AccessKey(config.s3AccessKey ?? "");
      setS3Region(config.s3Region ?? "");
      setMaxBackupSizeGb(config.maxBackupSizeGb);
    }
  }, [config]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const values: Record<string, unknown> = {
      backend,
      maxBackupSizeGb,
    };
    if (backend === "s3") {
      values.s3Endpoint = s3Endpoint;
      values.s3Bucket = s3Bucket;
      values.s3AccessKey = s3AccessKey;
      values.s3SecretKey = s3SecretKey;
      values.s3Region = s3Region;
    }
    updateMutation.mutate(values);
  };

  const handleTest = () => {
    const values: Record<string, unknown> = { backend };
    if (backend === "s3") {
      values.s3Endpoint = s3Endpoint;
      values.s3Bucket = s3Bucket;
      values.s3AccessKey = s3AccessKey;
      values.s3SecretKey = s3SecretKey;
      values.s3Region = s3Region;
    }
    testMutation.mutate(values);
  };

  if (isLoading) return <p>Loading storage config...</p>;

  return (
    <form onSubmit={handleSave} style={{ maxWidth: "500px" }}>
      {updateMutation.error && (
        <p style={{ color: "#c00" }}>{(updateMutation.error as Error).message}</p>
      )}
      {updateMutation.isSuccess && <p style={{ color: "#2d8" }}>Config saved.</p>}
      {testMutation.error && (
        <p style={{ color: "#c00" }}>Test failed: {(testMutation.error as Error).message}</p>
      )}
      {testMutation.isSuccess && <p style={{ color: "#2d8" }}>Connection OK.</p>}

      <div style={{ marginBottom: "12px" }}>
        <label htmlFor="backend" style={{ display: "block", marginBottom: "4px" }}>
          Backend
        </label>
        <select
          id="backend"
          value={backend}
          onChange={(e) => setBackend(e.target.value as "local" | "s3")}
          style={{ padding: "4px 8px" }}
        >
          <option value="local">Local</option>
          <option value="s3">S3-compatible</option>
        </select>
      </div>

      {backend === "s3" && (
        <>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="s3Endpoint" style={{ display: "block", marginBottom: "4px" }}>
              S3 Endpoint
            </label>
            <input
              id="s3Endpoint"
              type="text"
              value={s3Endpoint}
              onChange={(e) => setS3Endpoint(e.target.value)}
              placeholder="https://minio.example.com"
              style={{ width: "100%", padding: "4px 8px" }}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="s3Bucket" style={{ display: "block", marginBottom: "4px" }}>
              Bucket
            </label>
            <input
              id="s3Bucket"
              type="text"
              value={s3Bucket}
              onChange={(e) => setS3Bucket(e.target.value)}
              placeholder="sigil-backups"
              style={{ width: "100%", padding: "4px 8px" }}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="s3AccessKey" style={{ display: "block", marginBottom: "4px" }}>
              Access Key
            </label>
            <input
              id="s3AccessKey"
              type="text"
              value={s3AccessKey}
              onChange={(e) => setS3AccessKey(e.target.value)}
              style={{ width: "100%", padding: "4px 8px" }}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="s3SecretKey" style={{ display: "block", marginBottom: "4px" }}>
              Secret Key
            </label>
            <input
              id="s3SecretKey"
              type="password"
              value={s3SecretKey}
              onChange={(e) => setS3SecretKey(e.target.value)}
              style={{ width: "100%", padding: "4px 8px" }}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="s3Region" style={{ display: "block", marginBottom: "4px" }}>
              Region (optional)
            </label>
            <input
              id="s3Region"
              type="text"
              value={s3Region}
              onChange={(e) => setS3Region(e.target.value)}
              placeholder="us-east-1"
              style={{ width: "100%", padding: "4px 8px" }}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: "12px" }}>
        <label htmlFor="maxBackupSizeGb" style={{ display: "block", marginBottom: "4px" }}>
          Max Backup Size (GB)
        </label>
        <input
          id="maxBackupSizeGb"
          type="number"
          value={maxBackupSizeGb}
          onChange={(e) => setMaxBackupSizeGb(Number(e.target.value))}
          min={1}
          max={1000}
          style={{ padding: "4px 8px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Updating..." : "Update Config"}
        </button>
        <button type="button" onClick={handleTest} disabled={testMutation.isPending}>
          {testMutation.isPending ? "Testing..." : "Test Connection"}
        </button>
      </div>
    </form>
  );
}
