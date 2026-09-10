import type { Changelog } from "@sigilpanel/shared";

const CHANGE_TYPE_COLORS: Record<string, string> = {
  added: "green",
  changed: "blue",
  deprecated: "yellow",
  removed: "red",
  fixed: "purple",
  security: "orange",
};

interface ChangelogViewProps {
  changelog: Changelog;
}

export function ChangelogView({ changelog }: ChangelogViewProps) {
  if (!changelog || changelog.length === 0) {
    return <p>No changelog entries.</p>;
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {changelog.map((entry: Changelog[number]) => (
        <div
          key={entry.version}
          style={{ marginBottom: "1rem", borderBottom: "1px solid #ccc", paddingBottom: "0.5rem" }}
        >
          <h3>
            v{entry.version} <span style={{ fontSize: "0.8em", color: "#666" }}>{entry.date}</span>
          </h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {entry.changes.map((change) => (
              <li key={`${change.type}-${change.description}`} style={{ marginBottom: "0.25rem" }}>
                <span
                  style={{
                    color: CHANGE_TYPE_COLORS[change.type] ?? "black",
                    fontWeight: "bold",
                    marginRight: "0.5rem",
                    padding: "0.1rem 0.3rem",
                    border: `1px solid ${CHANGE_TYPE_COLORS[change.type] ?? "black"}`,
                    borderRadius: "3px",
                    fontSize: "0.8em",
                  }}
                >
                  {change.type}
                </span>
                {change.description}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
