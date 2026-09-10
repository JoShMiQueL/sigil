import type { Template, TemplateCreate, TemplateUpdate } from "@sigilpanel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useTemplates(opts: { groupId?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.groupId) params.set("groupId", opts.groupId);

  return useQuery({
    queryKey: ["templates", opts.groupId ?? "all"],
    queryFn: async () => {
      const url = `${API_URL}/api/admin/templates${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json() as Promise<Template[]>;
    },
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`${API_URL}/api/admin/templates/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json() as Promise<Template>;
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TemplateCreate) => {
      const res = await fetch(`${API_URL}/api/admin/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to create template" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TemplateUpdate }) => {
      const res = await fetch(`${API_URL}/api/admin/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to update template" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to delete template" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useActivateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/templates/${id}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to activate template");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeactivateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/templates/${id}/deactivate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to deactivate template");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useResetTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/admin/templates/${id}/reset`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        return { error: data.error?.message ?? "Failed to reset template" };
      }
      return {};
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}
