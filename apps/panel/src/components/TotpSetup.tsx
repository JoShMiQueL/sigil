import { useState } from "react";

interface TotpSetupProps {
  qrUri: string;
  secret: string;
  recoveryCodes: string[];
  onVerify: (code: string) => Promise<{ error?: string }>;
}

export function TotpSetup({ qrUri, secret, recoveryCodes, onVerify }: TotpSetupProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onVerify(code);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setVerified(true);
    }
  }

  if (verified) {
    return (
      <div>
        <h2>2FA Enabled Successfully</h2>
        <p>Save these recovery codes in a safe place. Each can be used once:</p>
        <ul>
          {recoveryCodes.map((code, i) => (
            <li key={i}>{code}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <h2>Enable Two-Factor Authentication</h2>
      <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
      <p>
        QR URI: <code>{qrUri}</code>
      </p>
      <p>
        Or enter this secret manually: <code>{secret}</code>
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div role="alert">{error}</div>}
        <label>
          Enter the 6-digit code from your authenticator app:
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Verifying..." : "Verify and Enable"}
        </button>
      </form>
    </div>
  );
}
