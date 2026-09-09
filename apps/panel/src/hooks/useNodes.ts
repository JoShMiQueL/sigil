import type { Node } from "@sigilpanel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useNodes(poll = true) {
  return useQuery({
    queryKey: ["nodes"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch nodes");
      return res.json() as Promise<Node[]>;
    },
    refetchInterval: poll ? 15000 : false,
  });
}

export function useNode(nodeId: string | undefined, poll = true) {
  return useQuery({
    queryKey: ["node", nodeId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch node");
      return res.json() as Promise<Node>;
    },
    enabled: !!nodeId,
    refetchInterval: poll ? 15000 : false,
  });
}

export function useUpdateNode(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { displayName?: string; regionId?: string }) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to update node" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    },
  });
}

export function useDeleteNode(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to delete node" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    },
  });
}

export function useRegenerateCredentials(nodeId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/credentials/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to regenerate credentials" };
      }
      return res.json() as Promise<{ secretId: string; secret: string }>;
    },
  });
}

export function useRevokeCredentials(nodeId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/credentials/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error ?? "Failed to revoke credentials" };
      }
      return {};
    },
  });
}

export function useGeneratePairingToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (regionId: string) => {
      const res = await fetch(`${API_URL}/api/admin/pairing/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ regionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to generate token" };
      }
      return res.json() as Promise<{ token: string; expiresAt: string }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nodes"] }),
  });
}
