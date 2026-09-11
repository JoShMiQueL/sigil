import type { Member, Permissions } from "@sigil/shared";
import { useState } from "react";
import { useRemoveMember, useTransferOwnership, useUpdateMember } from "../../hooks/useMembers";

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

interface MemberListProps {
  serverId: string | undefined;
  members: Member[];
}

export function MemberList({ serverId, members }: MemberListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<string | null>(null);
  const updateMember = useUpdateMember(serverId);
  const removeMember = useRemoveMember(serverId);
  const transferOwnership = useTransferOwnership(serverId);

  if (members.length === 0) {
    return <p style={{ color: "#888" }}>No members yet.</p>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
          <th style={{ padding: "0.5rem" }}>User</th>
          <th style={{ padding: "0.5rem" }}>Role</th>
          <th style={{ padding: "0.5rem" }}>Permissions</th>
          <th style={{ padding: "0.5rem" }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.id} style={{ borderBottom: "1px solid #222" }}>
            <td style={{ padding: "0.5rem" }}>
              <div>{member.username}</div>
              <div style={{ color: "#888", fontSize: "0.75rem" }}>{member.email}</div>
            </td>
            <td style={{ padding: "0.5rem" }}>
              <span
                style={{
                  padding: "0.1rem 0.4rem",
                  borderRadius: "0.25rem",
                  fontSize: "0.75rem",
                  background: member.role === "owner" ? "#4a3" : "#333",
                  color: member.role === "owner" ? "#fff" : "#ccc",
                }}
              >
                {member.role}
              </span>
            </td>
            <td style={{ padding: "0.5rem" }}>
              {editingId === member.id ? (
                <MemberPermissionsEditor
                  permissions={member.permissions}
                  onSave={(perms) => {
                    updateMember.mutate(
                      { memberId: member.id, permissions: perms },
                      { onSuccess: () => setEditingId(null) },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  isPending={updateMember.isPending}
                />
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                  {PERMISSION_LABELS.filter((p) => member.permissions[p.key]).map((p) => (
                    <span
                      key={p.key}
                      style={{
                        padding: "0.1rem 0.3rem",
                        borderRadius: "0.2rem",
                        fontSize: "0.7rem",
                        background: "#2a4a6a",
                        color: "#8cf",
                      }}
                    >
                      {p.label}
                    </span>
                  ))}
                  {PERMISSION_LABELS.filter((p) => member.permissions[p.key]).length === 0 && (
                    <span style={{ color: "#888", fontSize: "0.75rem" }}>none</span>
                  )}
                </div>
              )}
            </td>
            <td style={{ padding: "0.5rem" }}>
              {member.role === "owner" ? (
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {confirmTransfer === member.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          transferOwnership.mutate(member.id, {
                            onSuccess: () => setConfirmTransfer(null),
                          });
                        }}
                        disabled={transferOwnership.isPending}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        {transferOwnership.isPending ? "Transferring..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTransfer(null)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmTransfer(member.id)}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    >
                      Transfer
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {confirmRemove === member.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          removeMember.mutate(member.id, {
                            onSuccess: () => setConfirmRemove(null),
                          });
                        }}
                        disabled={removeMember.isPending}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", color: "#c44" }}
                      >
                        {removeMember.isPending ? "Removing..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(null)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(member.id)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(member.id)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", color: "#c44" }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface MemberPermissionsEditorProps {
  permissions: Permissions;
  onSave: (permissions: Permissions) => void;
  onCancel: () => void;
  isPending: boolean;
}

function MemberPermissionsEditor({
  permissions,
  onSave,
  onCancel,
  isPending,
}: MemberPermissionsEditorProps) {
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
