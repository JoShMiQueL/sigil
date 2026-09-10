import { useState } from "react";
import type { Registry } from "@sigilpanel/shared";

interface RegistryFormProps {
  registry?: Registry | null;
  onSubmit: (input: {
    url: string;
    name: string;
    authMethod: "none" | "token" | "basic";
    token?: string;
    username?: string;
    password?: string;
  }) => Promise<{ error?: string }>;
  onCancel?: () => void;
}

export function RegistryForm({ registry, onSubmit, onCancel }: RegistryFormProps) {
  const [url, setUrl] = useState(registry?.url ?? "");
  const [name, setName] = useState(registry?.name ?? "");
  const [authMethod, setAuthMethod] = useState<"none" | "token" | "basic">(registry?.authMethod ?? "none");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: {
      url: string;
      name: string;
      authMethod: "none" | "token" | "basic";
      token?: string;
      username?: string;
      password?: string;
    } = { url, name, authMethod };

    if (authMethod === "token" && token) input.token = token;
    if (authMethod === "basic" && username) input.username = username;
    if (authMethod === "basic" && password) input.password = password;

    const result = await onSubmit(input);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="registry-name">
          Name:
          <input
            id="registry-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="registry-url">
          URL:
          <input
            id="registry-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://example.com/registry"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="registry-auth">
          Auth Method:
          <select
            id="registry-auth"
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value as "none" | "token" | "basic")}
            style={{ display: "block", marginTop: "0.25rem" }}
          >
            <option value="none">None</option>
            <option value="token">Token</option>
            <option value="basic">Basic Auth</option>
          </select>
        </label>
      </div>
      {authMethod === "token" && (
        <div style={{ marginBottom: "0.5rem" }}>
          <label htmlFor="registry-token">
            Token:
            <input
              id="registry-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={registry?.hasCredentials ? "•••••••• (enter new to replace)" : ""}
              style={{ display: "block", marginTop: "0.25rem" }}
            />
          </label>
        </div>
      )}
      {authMethod === "basic" && (
        <>
          <div style={{ marginBottom: "0.5rem" }}>
            <label htmlFor="registry-username">
              Username:
              <input
                id="registry-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ display: "block", marginTop: "0.25rem" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <label htmlFor="registry-password">
              Password:
              <input
                id="registry-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ display: "block", marginTop: "0.25rem" }}
              />
            </label>
          </div>
        </>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : registry ? "Update Registry" : "Add Registry"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={{ marginLeft: "0.5rem" }}>
          Cancel
        </button>
      )}
    </form>
  );
}
