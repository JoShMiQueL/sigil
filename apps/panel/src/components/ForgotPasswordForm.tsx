import { PasswordResetRequestSchema } from "@sigil/shared";
import { useState } from "react";

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<{ error?: string }>;
}

export function ForgotPasswordForm({ onSubmit }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = PasswordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setFieldError(null);

    setLoading(true);
    const result = await onSubmit(parsed.data.email);
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
        <h1>Sigil</h1>
        <p>If an account exists for {email}, a password reset link has been sent.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sigil</h1>
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
      {fieldError && <div style={{ color: "red", fontSize: "0.85em" }}>{fieldError}</div>}
      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
    </form>
  );
}
