import type { ChangelogEntry } from "@sigilpanel/shared";

const CHANGE_TYPE_COLORS: Record<string, string> = {
  added: "green",
  changed: "blue",
  deprecated: "yellow",
  removed: "red",
  fixed: "purple",
  security: "orange",
};

export interface UpdateNotificationData {
  templateId: string;
  templateName: string;
  oldVersion: string;
  newVersion: string;
  changes: ChangelogEntry["changes"];
  customized: boolean;
}

interface UpdateNotificationProps {
  notifications: UpdateNotificationData[];
  onApply: (templateId: string) => void;
  onDismiss: (templateId: string) => void;
}

export function UpdateNotification({ notifications, onApply, onDismiss }: UpdateNotificationProps) {
  if (notifications.length === 0) return null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      {notifications.map((n) => (
        <div
          key={n.templateId}
          style={{
            padding: "1rem",
            border: "1px solid orange",
            borderRadius: "4px",
            marginBottom: "0.5rem",
            background: "#fffbe6",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0" }}>
            Update available: {n.templateName} ({n.oldVersion} → {n.newVersion})
          </h3>
          {n.changes.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.5rem 0" }}>
              {n.changes.map((change, idx) => (
                <li key={idx} style={{ marginBottom: "0.25rem" }}>
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
          )}
          {n.customized && (
            <div style={{ color: "red", marginBottom: "0.5rem" }}>
              ⚠ This template has been customized. Applying the update will overwrite your changes.
            </div>
          )}
          <div>
            <button type="button" onClick={() => onApply(n.templateId)}>
              Apply Update
            </button>
            <button
              type="button"
              onClick={() => onDismiss(n.templateId)}
              style={{ marginLeft: "0.5rem" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
