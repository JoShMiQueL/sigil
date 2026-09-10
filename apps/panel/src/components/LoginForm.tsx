import { LoginRequestSchema } from "@sigil/shared";
import { useState } from "react";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<{ error?: string }>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = LoginRequestSchema.safeParse({ email, password });
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
    const result = await onSubmit(parsed.data.email, parsed.data.password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>SigilPanel</h1>
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
      {fieldErrors.email && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.email}</div>
      )}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      {fieldErrors.password && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.password}</div>
      )}
      <button type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
