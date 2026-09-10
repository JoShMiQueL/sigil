import type { RegistryIndexEntry } from "@sigilpanel/shared";

interface AvailableTemplatesProps {
  templates: RegistryIndexEntry[];
  onInstall: (sourceId: string) => Promise<{ error?: string }>;
  installingId?: string | null;
}

export function AvailableTemplates({
  templates,
  onInstall,
  installingId,
}: AvailableTemplatesProps) {
  if (templates.length === 0) {
    return <p>No new templates available from this registry.</p>;
  }

  return (
    <table style={{ marginTop: "0.5rem", width: "100%" }}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Group</th>
          <th>Author</th>
          <th>Version</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {templates.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.group}</td>
            <td>{t.author ?? "—"}</td>
            <td>{t.version}</td>
            <td>
              <button
                type="button"
                onClick={async () => {
                  await onInstall(t.id);
                }}
                disabled={installingId === t.id}
              >
                {installingId === t.id ? "Installing..." : "Install"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
