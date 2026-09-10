import type {
  Allocation,
  AllocationCreateResult,
  AllocationListResponse,
  AllocationSummary,
} from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useAllocations(
  nodeId: string | undefined,
  filters: { status?: string; ip?: string; port?: number } = {},
) {
  return useQuery({
    queryKey: ["allocations", nodeId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.ip) params.set("ip", filters.ip);
      if (filters.port !== undefined) params.set("port", String(filters.port));
      const qs = params.toString();
      const res = await fetch(
        `${API_URL}/api/admin/nodes/${nodeId}/allocations${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch allocations");
      return res.json() as Promise<AllocationListResponse>;
    },
    enabled: !!nodeId,
  });
}

export function useAllocationSummary(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["allocation-summary", nodeId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/allocations/summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch allocation summary");
      return res.json() as Promise<AllocationSummary>;
    },
    enabled: !!nodeId,
  });
}

export function useAddAllocations(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ip: string;
      portStart: number;
      portEnd?: number;
      protocol?: string;
    }) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to add allocations" };
      }
      return res.json() as Promise<AllocationCreateResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}

export function useDeleteAllocation(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (allocationId: string) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/allocations/${allocationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete allocation" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}

export function useAssignAllocation(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { allocationId: string; serverId: string; isPrimary: boolean }) => {
      const res = await fetch(
        `${API_URL}/api/admin/nodes/${nodeId}/allocations/${input.allocationId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ serverId: input.serverId, isPrimary: input.isPrimary }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to assign allocation" };
      }
      return res.json() as Promise<Allocation>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}

export function useUnassignAllocation(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (allocationId: string) => {
      const res = await fetch(
        `${API_URL}/api/admin/nodes/${nodeId}/allocations/${allocationId}/unassign`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to unassign allocation" };
      }
      return res.json() as Promise<Allocation>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}

export function useAutoAssignAllocation(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: string) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/allocations/auto-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ serverId }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to auto-assign allocation" };
      }
      return res.json() as Promise<{ allocation: Allocation }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}

export function useSetPrimaryIp(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (primaryIp: string | null) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ primaryIp }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to set primary IP" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      queryClient.invalidateQueries({ queryKey: ["allocation-summary", nodeId] });
    },
  });
}
