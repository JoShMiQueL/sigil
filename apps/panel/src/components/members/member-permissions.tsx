import type { Permissions } from "@sigil/shared";
import { useState } from "react";

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

interface MemberPermissionsProps {
  permissions: Permissions;
  onSave: (permissions: Permissions) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function MemberPermissions({
  permissions,
  onSave,
  onCancel,
  isPending,
}: MemberPermissionsProps) {
  const [perms, setPerms] = useState<Permissions>(permissions);

  const toggle = (key: keyof Permissions) => {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.25rem" }}>
        {PERMISSION_LABELS.map(({ key, label }) => (
          <label
            key={key}
            style={{ display: "flex", alignItems: "center", gap: "0.15rem", fontSize: "0.75rem" }}
          >
            <input type="checkbox" checked={perms[key]} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={() => onSave(perms)}
          disabled={isPending}
          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
