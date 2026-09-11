import type { ServerLifecycleStatus, ServerPowerAction } from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useServers(nodeId?: string, status?: string) {
  return useQuery({
    queryKey: ["servers", nodeId ?? null, status ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (nodeId) params.set("nodeId", nodeId);
      if (status) params.set("status", status);
      const res = await fetch(`${API_URL}/api/admin/servers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch servers");
      return res.json() as Promise<{ servers: ServerRecord[]; total: number }>;
    },
  });
}

export function useServer(serverId: string | undefined) {
  return useQuery({
    queryKey: ["server", serverId ?? ""],
    enabled: !!serverId,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch server");
      return res.json() as Promise<ServerRecord>;
    },
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      nodeId: string;
      templateId: string;
      variables?: Record<string, string>;
    }) => {
      const res = await fetch(`${API_URL}/api/admin/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error?.message ?? "Failed to create server" };
      }
      return data as ServerRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function usePowerAction(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: ServerPowerAction) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error?.message ?? `Failed to ${action} server` };
      }
      return data as { serverId: string; status: ServerLifecycleStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: string) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete server" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

type ServerRecord = {
  id: string;
  name: string;
  nodeId: string;
  templateId: string | null;
  allocationId: string | null;
  status: ServerLifecycleStatus;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
