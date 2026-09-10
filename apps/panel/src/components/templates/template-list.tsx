import type { Template } from "@sigilpanel/shared";
import { ExportButton } from "./export-button";

interface TemplateListProps {
  templates: Template[];
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (template: Template) => void;
  onReset: (id: string) => void;
  onViewChangelog: (template: Template) => void;
}

export function TemplateList({
  templates,
  onActivate,
  onDeactivate,
  onDelete,
  onEdit,
  onReset,
  onViewChangelog,
}: TemplateListProps) {
  if (templates.length === 0) {
    return <p>No templates found.</p>;
  }

  return (
    <table style={{ marginTop: "1rem", width: "100%" }}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Version</th>
          <th>Image</th>
          <th>Active</th>
          <th>Customized</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {templates.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.version}</td>
            <td>{t.image}</td>
            <td>{t.active ? "✓" : "—"}</td>
            <td>{t.customized ? "⚠" : "—"}</td>
            <td>
              {t.active ? (
                <button type="button" onClick={() => onDeactivate(t.id)}>
                  Deactivate
                </button>
              ) : (
                <button type="button" onClick={() => onActivate(t.id)}>
                  Activate
                </button>
              )}
              <button type="button" onClick={() => onEdit(t)} style={{ marginLeft: "0.5rem" }}>
                Edit
              </button>
              {t.registryId && (
                <button type="button" onClick={() => onReset(t.id)} style={{ marginLeft: "0.5rem" }}>
                  Reset
                </button>
              )}
              <button type="button" onClick={() => onViewChangelog(t)} style={{ marginLeft: "0.5rem" }}>
                Changelog
              </button>
              <ExportButton templateId={t.id} templateName={t.name} />
              <button type="button" onClick={() => onDelete(t.id)} style={{ marginLeft: "0.5rem" }}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
