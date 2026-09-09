import type { User, UserCreate } from "@sigilpanel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CreateUserForm } from "./components/CreateUserForm";
import { ForgotPasswordForm } from "./components/ForgotPasswordForm";
import { LoginForm } from "./components/LoginForm";
import { ResetPasswordForm } from "./components/ResetPasswordForm";
import { UserTable } from "./components/UserTable";
import { useAuth } from "./hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function Root() {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: Root,
});

function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();

  if (user) {
    throw redirect({ to: "/" });
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

  if (!user) {
    throw redirect({ to: "/login" });
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>SigilPanel Dashboard</h1>
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
    </div>
  );
}

function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  if (!user) {
    throw redirect({ to: "/login" });
  }
  if (user.role !== "admin") {
    throw redirect({ to: "/" });
  }

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
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Users</h1>
      <button type="button" onClick={() => router.navigate({ to: "/" })}>
        Back to Dashboard
      </button>
      <CreateUserForm
        onCreate={async (input) => {
          const result = await createMutation.mutateAsync(input);
          return result;
        }}
      />
      {isLoading ? (
        <p>Loading users...</p>
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
    </div>
  );
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: UsersPage,
});

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

export const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute,
  usersRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
]);
