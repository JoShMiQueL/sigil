import { useState } from "react";

interface ResetPasswordFormProps {
  token: string;
  onSubmit: (token: string, password: string) => Promise<{ error?: string }>;
}

export function ResetPasswordForm({ token, onSubmit }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const result = await onSubmit(token, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div>
        <h1>SigilPanel</h1>
        <p>Password reset successfully. You can now log in with your new password.</p>
        <a href="/login">Go to login</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>SigilPanel</h1>
      <h2>Reset Password</h2>
      {error && <div role="alert">{error}</div>}
      <label>
        New Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm Password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Resetting..." : "Reset Password"}
      </button>
    </form>
  );
}
