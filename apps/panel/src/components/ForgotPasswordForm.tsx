import { useState } from "react";

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<{ error?: string }>;
}

export function ForgotPasswordForm({ onSubmit }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onSubmit(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div>
        <h1>SigilPanel</h1>
        <p>If an account exists for {email}, a password reset link has been sent.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>SigilPanel</h1>
      <h2>Forgot Password</h2>
      {error && <div role="alert">{error}</div>}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
    </form>
  );
}
