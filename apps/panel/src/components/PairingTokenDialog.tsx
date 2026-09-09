import { useState } from "react";

interface PairingTokenDialogProps {
  regions: Array<{ id: string; name: string }>;
  onGenerate: (regionId: string) => Promise<{
    token?: string;
    expiresAt?: string;
    error?: string;
  }>;
}

export function PairingTokenDialog({ regions, onGenerate }: PairingTokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [regionId, setRegionId] = useState("");
  const [tokenData, setTokenData] = useState<{ token: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!regionId) return;
    setError(null);
    setIsGenerating(true);

    const result = await onGenerate(regionId);
    setIsGenerating(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.token && result.expiresAt) {
      setTokenData({ token: result.token, expiresAt: result.expiresAt });
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTokenData(null);
    setError(null);
    setRegionId("");
    setCopied(false);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ marginBottom: "1rem" }}>
        Generate Pairing Token
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          border: "none",
          padding: 0,
          cursor: "default",
        }}
        onClick={handleClose}
      />
      <div
        style={{
          position: "relative",
          background: "white",
          padding: "2rem",
          borderRadius: "8px",
          maxWidth: "500px",
          width: "100%",
        }}
      >
        <h3>Generate Pairing Token</h3>
        {error && <p style={{ color: "#c00" }}>{error}</p>}
        {!tokenData ? (
          <>
            <label>
              Region
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                style={{ display: "block", marginTop: "0.25rem", marginBottom: "1rem" }}
              >
                <option value="">Select a region...</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleGenerate} disabled={isGenerating || !regionId}>
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            <button type="button" onClick={handleClose} style={{ marginLeft: "0.5rem" }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <p style={{ fontWeight: "bold", color: "#c00" }}>
              Copy this token now — it won't be shown again.
            </p>
            <textarea
              readOnly
              value={tokenData.token}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                padding: "0.5rem",
              }}
              rows={3}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(tokenData.token);
                setCopied(true);
              }}
              style={{ marginTop: "0.5rem" }}
            >
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
              Expires: {new Date(tokenData.expiresAt).toLocaleString()}
            </p>
            <button type="button" onClick={handleClose} style={{ marginTop: "1rem" }}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
