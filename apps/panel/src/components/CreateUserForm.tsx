import { type UserCreate, UserCreateSchema } from "@sigil/shared";
import { useState } from "react";

interface CreateUserFormProps {
  onCreate: (input: UserCreate) => Promise<{ error?: string }>;
}

export function CreateUserForm({ onCreate }: CreateUserFormProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = UserCreateSchema.safeParse({ email, username, password, role });
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
    const result = await onCreate(parsed.data);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setEmail("");
      setUsername("");
      setPassword("");
      setRole("user");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create User</h2>
      {error && <div role="alert">{error}</div>}
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {fieldErrors.email && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.email}</div>
      )}
      <label>
        Username
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
        />
      </label>
      {fieldErrors.username && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.username}</div>
      )}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      {fieldErrors.password && (
        <div style={{ color: "red", fontSize: "0.85em" }}>{fieldErrors.password}</div>
      )}
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create User"}
      </button>
    </form>
  );
}
