import type {
  ApiKey,
  ApiKeyScope,
  Template,
  TemplateUpdate,
  User,
  UserCreate,
} from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ApiKeyManager } from "./components/ApiKeyManager";
import { CreateUserForm } from "./components/CreateUserForm";
import { ErrorState } from "./components/ErrorState";
import { ForgotPasswordForm } from "./components/ForgotPasswordForm";

import { Layout } from "./components/Layout";
import { LoadingState } from "./components/LoadingState";
import { LoginForm } from "./components/LoginForm";
import { ResetPasswordForm } from "./components/ResetPasswordForm";
import { AvailableTemplates } from "./components/registries/available-templates";
import { RegistryForm } from "./components/registries/registry-form";
import { TotpSetup } from "./components/TotpSetup";
import { TwoFactorPrompt } from "./components/TwoFactorPrompt";
import { ChangelogView } from "./components/templates/changelog-view";
import { ImportDialog } from "./components/templates/import-dialog";
import { TemplateForm } from "./components/templates/template-form";
import { TemplateList } from "./components/templates/template-list";
import {
  UpdateNotification,
  type UpdateNotificationData,
} from "./components/templates/update-notification";
import { UserTable } from "./components/UserTable";

import {
  useAvailableTemplates,
  useCheckRegistry,
  useCreateRegistry,
  useDeleteRegistry,
  useInstallTemplate,
  useRegistries,
} from "./hooks/use-registries";
import {
  useActivateTemplate,
  useApplyUpdate,
  useCreateTemplate,
  useDeactivateTemplate,
  useDeleteTemplate,
  useDismissUpdate,
  useImportTemplate,
  useResetTemplate,
  useTemplates,
  useUpdateTemplate,
} from "./hooks/use-templates";
import { useAuth } from "./hooks/useAuth";
import { useSSE } from "./hooks/useSSE";
import { NodeDetailPage } from "./routes/node-detail";
import { NodesPage } from "./routes/nodes";
import { ServerDetailPage } from "./routes/server-detail";
import { ServersPage } from "./routes/servers";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function fetchUser(): Promise<User | null | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as User;
  } catch {
    // Network error (API down) — don't redirect, let the page render.
    // The SSE reconnect indicator will show the connection state.
    return undefined;
  }
}

function Root() {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: Root,
});

function LoginPage() {
  const { login, verify2fa } = useAuth();
  const router = useRouter();
  const [twoFactorUserId, setTwoFactorUserId] = useState<string | null>(null);

  if (twoFactorUserId) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <TwoFactorPrompt
          userId={twoFactorUserId}
          onVerify={async (userId, code) => {
            const result = await verify2fa({ userId, code });
            if ("error" in result && result.error) {
              return { error: result.error };
            }
            setTwoFactorUserId(null);
            router.navigate({ to: "/" });
            return {};
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <LoginForm
        onSubmit={async (email, password) => {
          const result = await login({ email, password });
          if ("error" in result && result.error) {
            return { error: result.error };
          }
          if ("twoFactorRequired" in result && result.twoFactorRequired && result.userId) {
            setTwoFactorUserId(result.userId);
            return {};
          }
          router.navigate({ to: "/" });
          return {};
        }}
      />
    </div>
  );
}

function DashboardPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <Layout>
      <h1>Sigil Dashboard</h1>
      <p>
        Welcome, {user.username} ({user.role})
      </p>
      {user.role === "admin" && (
        <p>
          <button type="button" onClick={() => router.navigate({ to: "/users" })}>
            Manage Users
          </button>
        </p>
      )}
      {user.role === "admin" && (
        <p>
          <button type="button" onClick={() => router.navigate({ to: "/nodes" })}>
            Manage Nodes
          </button>
        </p>
      )}
      {user.role === "admin" && (
        <p>
          <button type="button" onClick={() => router.navigate({ to: "/registries" })}>
            Manage Registries
          </button>
        </p>
      )}
      {user.role === "admin" && (
        <p>
          <button type="button" onClick={() => router.navigate({ to: "/templates" })}>
            Manage Templates
          </button>
        </p>
      )}
      {user.role === "admin" && (
        <p>
          <button type="button" onClick={() => router.navigate({ to: "/servers" })}>
            Manage Servers
          </button>
        </p>
      )}
      <p>
        <button type="button" onClick={() => router.navigate({ to: "/security" })}>
          Security Settings
        </button>
      </p>
      <p>
        <button type="button" onClick={() => router.navigate({ to: "/api-keys" })}>
          API Keys
        </button>
      </p>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.navigate({ to: "/login" });
        }}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </Layout>
  );
}

function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  useSSE({
    invalidations: {
      "user.update": [["users"]],
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["users", page],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/users?page=${page}&limit=20`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json() as Promise<{ users: User[]; total: number }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: UserCreate) => {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to create user" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const suspendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "suspended" }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to suspend user" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <Layout>
      <h1>Users</h1>
      <CreateUserForm
        onCreate={async (input) => {
          const result = await createMutation.mutateAsync(input);
          return result;
        }}
      />
      {isLoading ? (
        <LoadingState message="Loading users..." />
      ) : data ? (
        <UserTable
          users={data.users}
          total={data.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSuspend={(id) => suspendMutation.mutate(id)}
        />
      ) : null}
    </Layout>
  );
}

function ForgotPasswordPage() {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <ForgotPasswordForm
        onSubmit={async (email) => {
          const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email }),
          });
          if (!res.ok) {
            return { error: "Failed to send reset email" };
          }
          router.navigate({ to: "/login" });
          return {};
        }}
      />
    </div>
  );
}

function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const router = useRouter();

  if (!token) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>Invalid Reset Link</h1>
        <p>No reset token found in the URL.</p>
        <button type="button" onClick={() => router.navigate({ to: "/login" })}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <ResetPasswordForm
        token={token}
        onSubmit={async (t, password) => {
          const res = await fetch(`${API_URL}/api/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: t, password }),
          });
          if (!res.ok) {
            const data = await res.json();
            return { error: data.error ?? "Failed to reset password" };
          }
          return {};
        }}
      />
    </div>
  );
}

interface TotpEnableResponse {
  secret: string;
  qrUri: string;
  recoveryCodes: string[];
}

function SecurityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [totpData, setTotpData] = useState<TotpEnableResponse | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!user) return null;

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/auth/2fa/enable`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to enable 2FA");
      return res.json() as Promise<TotpEnableResponse>;
    },
    onSuccess: (data) => setTotpData(data),
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`${API_URL}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Verification failed" };
      }
      return {};
    },
    onSuccess: () => {
      setTotpData(null);
      setMessage("2FA enabled successfully");
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`${API_URL}/api/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to disable 2FA" };
      }
      return {};
    },
    onSuccess: () => {
      setMessage("2FA disabled");
      setDisablePassword("");
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return (
    <Layout>
      <h1>Security Settings</h1>

      {error && <ErrorState message={error} />}
      {message && <div>{message}</div>}

      <h2>Two-Factor Authentication</h2>
      {user.totpEnabled ? (
        <div>
          <p>2FA is currently enabled.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const result = await disableMutation.mutateAsync(disablePassword);
              if ("error" in result && result.error) {
                setError(result.error);
              }
            }}
          >
            <label>
              Password (required to disable):
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={disableMutation.isPending}>
              {disableMutation.isPending ? "Disabling..." : "Disable 2FA"}
            </button>
          </form>
        </div>
      ) : totpData ? (
        <TotpSetup
          qrUri={totpData.qrUri}
          secret={totpData.secret}
          recoveryCodes={totpData.recoveryCodes}
          onVerify={async (code) => {
            const result = await verifyMutation.mutateAsync(code);
            return "error" in result ? result : {};
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => enableMutation.mutate()}
          disabled={enableMutation.isPending}
        >
          {enableMutation.isPending ? "Enabling..." : "Enable 2FA"}
        </button>
      )}
    </Layout>
  );
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user) throw redirect({ to: "/" });
    // undefined = network error, stay on login page
  },
  component: LoginPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
  },
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: UsersPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/security",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
  },
  component: SecurityPage,
});

function ApiKeysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (!user) return null;

  const { data } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/api-keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json() as Promise<{ keys: ApiKey[] }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, scopes }: { name: string; scopes: ApiKeyScope[] }) => {
      const res = await fetch(`${API_URL}/api/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, scopes }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to create API key" };
      }
      return res.json() as Promise<{ key: string }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to revoke API key" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <Layout>
      <h1>API Keys</h1>
      <ApiKeyManager
        keys={data?.keys ?? []}
        onCreate={async (name, scopes) => {
          const result = await createMutation.mutateAsync({ name, scopes });
          if ("error" in result) return { error: result.error };
          return { key: result.key };
        }}
        onRevoke={async (id) => {
          const result = await revokeMutation.mutateAsync(id);
          return "error" in result ? result : {};
        }}
      />
    </Layout>
  );
}

const apiKeysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api-keys",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
  },
  component: ApiKeysPage,
});

const nodesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/nodes",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: NodesPage,
});

const nodeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/nodes/$nodeId",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: NodeDetailPage,
});

const serversRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/servers",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: ServersPage,
});

const serverDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/servers/$serverId",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: ServerDetailPage,
});

function RegistriesPage() {
  const { data: registries, isLoading } = useRegistries();
  const createMutation = useCreateRegistry();
  const deleteMutation = useDeleteRegistry();
  const checkMutation = useCheckRegistry();
  const installMutation = useInstallTemplate();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const { data: availableTemplates } = useAvailableTemplates(selectedRegistryId);

  useSSE({
    invalidations: {
      "registry.update": [["registries"]],
    },
  });

  return (
    <Layout>
      <h1>Template Registries</h1>
      {error && <ErrorState message={error} />}

      {showCreate ? (
        <RegistryForm
          onSubmit={async (input) => {
            const result = await createMutation.mutateAsync(input);
            if (result.error) {
              setError(result.error);
              return result;
            }
            setError(null);
            setShowCreate(false);
            return {};
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowCreate(true)}>
          Add Registry
        </button>
      )}

      {isLoading ? (
        <LoadingState message="Loading registries..." />
      ) : registries && registries.length > 0 ? (
        <table style={{ marginTop: "1rem", width: "100%" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Auth</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {registries.map((reg) => (
              <tr key={reg.id}>
                <td>
                  {reg.isOfficial ? "★ " : ""}
                  {reg.name}
                </td>
                <td>{reg.url}</td>
                <td>{reg.authMethod}</td>
                <td>{reg.status}</td>
                <td>
                  <button type="button" onClick={() => setSelectedRegistryId(reg.id)}>
                    Browse
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await checkMutation.mutateAsync(reg.id);
                    }}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    Check
                  </button>
                  {!reg.isOfficial && (
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await deleteMutation.mutateAsync(reg.id);
                        if (result.error) setError(result.error);
                        else setError(null);
                      }}
                      style={{ marginLeft: "0.5rem" }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No registries configured.</p>
      )}

      {selectedRegistryId && (
        <div style={{ marginTop: "1rem" }}>
          <h2>Available Templates</h2>
          <AvailableTemplates
            templates={availableTemplates ?? []}
            installingId={installingId}
            onInstall={async (sourceId) => {
              setInstallingId(sourceId);
              const result = await installMutation.mutateAsync({
                registryId: selectedRegistryId,
                sourceId,
              });
              setInstallingId(null);
              if (result.error) setError(result.error);
              else setError(null);
              return result;
            }}
          />
        </div>
      )}
    </Layout>
  );
}

const registriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registries",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: RegistriesPage,
});

function TemplatesPage() {
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const { data: templates, isLoading } = useTemplates({ tag: selectedTag });
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();
  const activateMutation = useActivateTemplate();
  const deactivateMutation = useDeactivateTemplate();
  const resetMutation = useResetTemplate();
  const importMutation = useImportTemplate();
  const applyUpdateMutation = useApplyUpdate();
  const dismissUpdateMutation = useDismissUpdate();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [changelogTemplate, setChangelogTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateNotifications, setUpdateNotifications] = useState<UpdateNotificationData[]>([]);

  useSSE({
    invalidations: {
      "template.create": [["templates"]],
      "template.update": [["templates"]],
      "template.delete": [["templates"]],
      "template.update_applied": [["templates"]],
    },
    handlers: {
      "template.update_available": (data: unknown) => {
        const payload = data as UpdateNotificationData;
        setUpdateNotifications((prev) => {
          const filtered = prev.filter((n) => n.templateId !== payload.templateId);
          return [...filtered, payload];
        });
      },
    },
  });

  const allTags = Array.from(new Set((templates ?? []).flatMap((t) => t.tags ?? []))).sort();

  return (
    <Layout>
      <h1>Templates</h1>
      {error && <ErrorState message={error} />}

      <UpdateNotification
        notifications={updateNotifications}
        onApply={async (templateId) => {
          const result = await applyUpdateMutation.mutateAsync(templateId);
          if (result.error) setError(result.error);
          else {
            setError(null);
            setUpdateNotifications((prev) => prev.filter((n) => n.templateId !== templateId));
          }
        }}
        onDismiss={async (templateId) => {
          await dismissUpdateMutation.mutateAsync(templateId);
          setUpdateNotifications((prev) => prev.filter((n) => n.templateId !== templateId));
        }}
      />

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="tag-filter">
          Filter by tag:
          <select
            id="tag-filter"
            value={selectedTag ?? ""}
            onChange={(e) => setSelectedTag(e.target.value || undefined)}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showCreate && (
        <TemplateForm
          onSubmit={async (input) => {
            const result = await createMutation.mutateAsync(input);
            if (result.error) {
              setError(result.error);
              return result;
            }
            setError(null);
            setShowCreate(false);
            return {};
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editingTemplate && (
        <TemplateForm
          template={editingTemplate}
          onSubmit={async (input) => {
            const result = await updateMutation.mutateAsync({
              id: editingTemplate.id,
              input: input as TemplateUpdate,
            });
            if (result.error) {
              setError(result.error);
              return result;
            }
            setError(null);
            setEditingTemplate(null);
            return {};
          }}
          onCancel={() => setEditingTemplate(null)}
        />
      )}

      {changelogTemplate && (
        <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ccc" }}>
          <h2>Changelog: {changelogTemplate.name}</h2>
          <ChangelogView changelog={changelogTemplate.changelog} />
          <button type="button" onClick={() => setChangelogTemplate(null)}>
            Close
          </button>
        </div>
      )}

      {!showCreate && !editingTemplate && !showImport && (
        <>
          <button type="button" onClick={() => setShowCreate(true)}>
            Create Template
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            style={{ marginLeft: "0.5rem" }}
          >
            Import Template
          </button>
        </>
      )}

      {showImport && (
        <ImportDialog
          onImport={async (file, tags, conflict) => {
            const result = await importMutation.mutateAsync({
              file,
              tags,
              conflict,
            });
            if ("error" in result && result.error) {
              setError(result.error);
              return { error: result.error };
            }
            setError(null);
            return {
              skippedFields: result.skippedFields,
              conflict: result.conflict,
            };
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {isLoading ? (
        <LoadingState message="Loading templates..." />
      ) : (
        <TemplateList
          templates={templates ?? []}
          onActivate={async (id) => {
            try {
              await activateMutation.mutateAsync(id);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to activate");
            }
          }}
          onDeactivate={async (id) => {
            try {
              await deactivateMutation.mutateAsync(id);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to deactivate");
            }
          }}
          onDelete={async (id) => {
            const result = await deleteMutation.mutateAsync(id);
            if (result.error) setError(result.error);
            else setError(null);
          }}
          onEdit={(t) => setEditingTemplate(t)}
          onReset={async (id) => {
            const result = await resetMutation.mutateAsync(id);
            if (result.error) setError(result.error);
            else setError(null);
          }}
          onViewChangelog={(t) => setChangelogTemplate(t)}
        />
      )}
    </Layout>
  );
}

const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/templates",
  beforeLoad: async () => {
    const user = await fetchUser();
    if (user === null) throw redirect({ to: "/login" });
    if (user && user.role !== "admin") throw redirect({ to: "/" });
  },
  component: TemplatesPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute,
  usersRoute,
  nodesRoute,
  nodeDetailRoute,
  serversRoute,
  serverDetailRoute,
  registriesRoute,
  templatesRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  securityRoute,
  apiKeysRoute,
]);
