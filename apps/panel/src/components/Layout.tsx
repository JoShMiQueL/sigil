import type { User } from "@sigilpanel/shared";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { useSSE } from "../hooks/useSSE";
import { ReconnectingIndicator } from "./ReconnectingIndicator";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isLoggingOut } = useAuth();
  const router = useRouter();
  const { connectionState } = useSSE();

  if (!user) {
    return (
      <>
        <ReconnectingIndicator state={connectionState} />
        {children}
      </>
    );
  }

  const navItems: Array<{ label: string; to: string; show: boolean }> = [
    { label: "Dashboard", to: "/", show: true },
    { label: "Users", to: "/users", show: user.role === "admin" },
    { label: "Nodes", to: "/nodes", show: user.role === "admin" },
    { label: "Security", to: "/security", show: true },
    { label: "API Keys", to: "/api-keys", show: true },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <ReconnectingIndicator state={connectionState} />
      <nav
        style={{
          width: "200px",
          padding: "1rem",
          borderRight: "1px solid #ccc",
          backgroundColor: "#f5f5f5",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>SigilPanel</h2>
        <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "1rem" }}>
          {user.username} ({user.role})
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <li key={item.to} style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => router.navigate({ to: item.to })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    font: "inherit",
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
        </ul>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.navigate({ to: "/login" });
          }}
          disabled={isLoggingOut}
          style={{ marginTop: "2rem" }}
        >
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </nav>
      <main style={{ flex: 1, padding: "2rem" }}>{children}</main>
    </div>
  );
}

export type { User };
