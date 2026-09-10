import type { RegionWithCounts } from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useRegions() {
  return useQuery({
    queryKey: ["regions"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/regions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch regions");
      return res.json() as Promise<RegionWithCounts[]>;
    },
  });
}

export function useCreateRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const res = await fetch(`${API_URL}/api/admin/regions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to create region" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regions"] }),
  });
}

export function useDeleteRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/regions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete region" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regions"] }),
  });
}
