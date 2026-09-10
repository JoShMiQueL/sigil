import type { Group } from "@sigilpanel/shared";
import { useState } from "react";

interface GroupFormProps {
  group?: Group | null;
  onSubmit: (input: {
    name: string;
    description?: string | null;
    icon?: string | null;
  }) => Promise<{ error?: string }>;
  onCancel?: () => void;
}

export function GroupForm({ group, onSubmit, onCancel }: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [icon, setIcon] = useState(group?.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await onSubmit({
      name,
      description: description || null,
      icon: icon || null,
    });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="group-name">
          Name:
          <input
            id="group-name"
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
        <label htmlFor="group-description">
          Description:
          <input
            id="group-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="group-icon">
          Icon (optional):
          <input
            id="group-icon"
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="emoji or icon name"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
      </div>
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : group ? "Update Group" : "Create Group"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={{ marginLeft: "0.5rem" }}>
          Cancel
        </button>
      )}
    </form>
  );
}
