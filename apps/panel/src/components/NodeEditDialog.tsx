import type { RegionWithCounts } from "@sigilpanel/shared";
import { useState } from "react";

interface NodeEditDialogProps {
  displayName: string;
  regionId: string;
  regions: RegionWithCounts[];
  onSave: (input: { displayName?: string; regionId?: string }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function NodeEditDialog({
  displayName,
  regionId,
  regions,
  onSave,
  onCancel,
  isSaving,
}: NodeEditDialogProps) {
  const [editDisplayName, setEditDisplayName] = useState(displayName);
  const [editRegionId, setEditRegionId] = useState(regionId);

  const save = async () => {
    const input: { displayName?: string; regionId?: string } = {};
    if (editDisplayName !== displayName) input.displayName = editDisplayName;
    if (editRegionId !== regionId) input.regionId = editRegionId;

    if (Object.keys(input).length === 0) {
      onCancel();
      return;
    }

    await onSave(input);
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <select value={editRegionId} onChange={(e) => setEditRegionId(e.target.value)}>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={editDisplayName}
        onChange={(e) => setEditDisplayName(e.target.value)}
      />
      <button type="button" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
