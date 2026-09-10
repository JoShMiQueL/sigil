import type { ApiKey, ApiKeyScope } from "@sigil/shared";
import { useState } from "react";

const ALL_SCOPES: ApiKeyScope[] = [
  "read",
  "control",
  "files",
  "databases",
  "backups",
  "allocations",
  "settings",
  "users",
];

interface ApiKeyManagerProps {
  keys: ApiKey[];
  onCreate: (name: string, scopes: ApiKeyScope[]) => Promise<{ key?: string; error?: string }>;
  onRevoke: (id: string) => Promise<{ error?: string }>;
}

export function ApiKeyManager({ keys, onCreate, onRevoke }: ApiKeyManagerProps) {
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(["read"]);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onCreate(name, selectedScopes);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.key) {
      setNewKey(result.key);
      setName("");
      setSelectedScopes(["read"]);
    }
  }

  return (
    <div>
      <h2>API Keys</h2>

      {newKey && (
        <div role="alert">
          <strong>Copy your API key now. It won't be shown again:</strong>
          <br />
          <code>{newKey}</code>
          <br />
          <button type="button" onClick={() => setNewKey(null)}>
            I've copied it
          </button>
        </div>
      )}

      {error && <div role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
        <h3>Create New API Key</h3>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={64}
          />
        </label>
        <fieldset>
          <legend>Scopes</legend>
          {ALL_SCOPES.map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              {scope}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Key"}
        </button>
      </form>

      <h3>Your API Keys</h3>
      {keys.length === 0 ? (
        <p>No API keys yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>{key.keyPrefix}...</td>
                <td>{key.scopes.join(", ")}</td>
                <td>{key.lastUsedAt ?? "Never"}</td>
                <td>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await onRevoke(key.id);
                      if (result.error) setError(result.error);
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
