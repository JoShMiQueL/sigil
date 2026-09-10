import type { Group, GroupCreate, GroupUpdate } from "@sigilpanel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/groups`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json() as Promise<Group[]>;
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GroupCreate) => {
      const res = await fetch(`${API_URL}/api/admin/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to create group" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: GroupUpdate }) => {
      const res = await fetch(`${API_URL}/api/admin/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to update group" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/groups/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete group" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}
