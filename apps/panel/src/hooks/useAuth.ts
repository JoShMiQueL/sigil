import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface User {
  id: string;
  email: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LoginResult {
  error?: string;
  twoFactorRequired?: boolean;
  userId?: string;
}

async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as User;
  } catch {
    // Network error (API down) — return null, don't throw.
    // The SSE reconnect indicator handles the UI state.
    return null;
  }
}

async function loginRequest(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.error ?? "Login failed" };
  }

  if (data.status === "2fa_required") {
    return { twoFactorRequired: true, userId: data.userId };
  }

  return {};
}

async function verify2faRequest(userId: string, code: string): Promise<{ error?: string }> {
  const res = await fetch(`${API_URL}/api/auth/login/2fa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ userId, code }),
  });

  if (!res.ok) {
    const data = await res.json();
    return { error: data.error ?? "2FA verification failed" };
  }

  return {};
}

async function logoutRequest(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginRequest(email, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  const verify2faMutation = useMutation({
    mutationFn: ({ userId, code }: { userId: string; code: string }) =>
      verify2faRequest(userId, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    verify2fa: verify2faMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
