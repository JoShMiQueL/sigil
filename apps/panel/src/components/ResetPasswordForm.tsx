import { PasswordResetSchema } from "@sigil/shared";
import { useState } from "react";

interface ResetPasswordFormProps {
  token: string;
  onSubmit: (token: string, password: string) => Promise<{ error?: string }>;
}

export function ResetPasswordForm({ token, onSubmit }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match" });
      return;
    }

    const parsed = PasswordResetSchema.safeParse({ token, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString() ?? "form";
        errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    const result = await onSubmit(token, parsed.data.password);
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
      {fieldErrors.password && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.password}</div>
      )}
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
      {fieldErrors.confirmPassword && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.confirmPassword}</div>
      )}
      <button type="submit" disabled={loading}>
        {loading ? "Resetting..." : "Reset Password"}
      </button>
    </form>
  );
}
