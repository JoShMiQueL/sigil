import { useState } from "react";

interface TwoFactorPromptProps {
  userId: string;
  onVerify: (userId: string, code: string) => Promise<{ error?: string }>;
}

export function TwoFactorPrompt({ userId, onVerify }: TwoFactorPromptProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onVerify(userId, code);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setCode("");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>SigilPanel</h1>
      <h2>Two-Factor Authentication</h2>
      <p>Enter the 6-digit code from your authenticator app, or a recovery code.</p>
      {error && <div role="alert">{error}</div>}
      <label>
        Authentication Code
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
          autoComplete="one-time-code"
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Verifying..." : "Verify"}
      </button>
    </form>
  );
}
