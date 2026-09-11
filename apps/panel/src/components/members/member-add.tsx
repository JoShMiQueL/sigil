import type { Permissions } from "@sigil/shared";
import { useState } from "react";
import { useAddMember } from "../../hooks/useMembers";

const PERMISSION_LABELS: { key: keyof Permissions; label: string }[] = [
  { key: "console", label: "Console" },
  { key: "files", label: "Files" },
  { key: "backups", label: "Backups" },
  { key: "power", label: "Power" },
  { key: "settings", label: "Settings" },
  { key: "members", label: "Members" },
  { key: "allocations", label: "Allocations" },
  { key: "databases", label: "Databases" },
];

const NO_PERMS: Permissions = {
  console: false,
  files: false,
  backups: false,
  power: false,
  settings: false,
  members: false,
  allocations: false,
  databases: false,
};

interface MemberAddProps {
  serverId: string | undefined;
}

export function MemberAdd({ serverId }: MemberAddProps) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(NO_PERMS);
  const [error, setError] = useState<string | null>(null);
  const addMember = useAddMember(serverId);

  const togglePermission = (key: keyof Permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    addMember.mutate(
      { email, permissions },
      {
        onSuccess: () => {
          setEmail("");
          setPermissions(NO_PERMS);
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h4>Add Member</h4>
      {error && <div style={{ color: "#c00", marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ flex: 1, padding: "0.25rem 0.5rem" }}
        />
        <button type="submit" disabled={addMember.isPending} style={{ padding: "0.25rem 1rem" }}>
          {addMember.isPending ? "Adding..." : "Add"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {PERMISSION_LABELS.map(({ key, label }) => (
          <label
            key={key}
            style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem" }}
          >
            <input
              type="checkbox"
              checked={permissions[key]}
              onChange={() => togglePermission(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </form>
  );
}
