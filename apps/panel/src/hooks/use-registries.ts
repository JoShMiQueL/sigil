import type { Registry, RegistryCreate, RegistryIndexEntry } from "@sigilpanel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useRegistries() {
  return useQuery({
    queryKey: ["registries"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/registries`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch registries");
      return res.json() as Promise<Registry[]>;
    },
  });
}

export function useCreateRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistryCreate) => {
      const res = await fetch(`${API_URL}/api/admin/registries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to create registry" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["registries"] }),
  });
}

export function useDeleteRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/registries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete registry" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["registries"] }),
  });
}

export function useAvailableTemplates(registryId: string | null) {
  return useQuery({
    queryKey: ["registries", registryId, "available"],
    queryFn: async () => {
      if (!registryId) return [];
      const res = await fetch(`${API_URL}/api/admin/registries/${registryId}/available`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch available templates");
      return res.json() as Promise<RegistryIndexEntry[]>;
    },
    enabled: !!registryId,
  });
}

export function useInstallTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ registryId, sourceId }: { registryId: string; sourceId: string }) => {
      const res = await fetch(`${API_URL}/api/admin/registries/${registryId}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceId }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to install template" };
      }
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useCheckRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/registries/${id}/check`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to check registry");
      return res.json() as Promise<{ status: string; availableCount: number }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["registries"] }),
  });
}
