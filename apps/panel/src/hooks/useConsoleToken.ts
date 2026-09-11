import { useQuery } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useConsoleToken(serverId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["console-token", serverId ?? ""],
    enabled: !!serverId && enabled,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/console-token`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Failed to get console token");
      }
      return res.json() as Promise<{
        token: string;
        daemonUrl: string;
        serverId: string;
        expiresIn: number;
      }>;
    },
    staleTime: 4 * 60 * 1000, // token is valid for 5 min, refetch at 4 min
    refetchOnWindowFocus: false,
  });
}
