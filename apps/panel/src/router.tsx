import { createRootRoute, createRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { LoginForm } from "./components/LoginForm";
import { useAuth } from "./hooks/useAuth";

function Root() {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: Root,
});

function LoginPage() {
  const { login, user, isLoggingIn } = useAuth();
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

export const routeTree = rootRoute.addChildren([loginRoute, dashboardRoute]);
