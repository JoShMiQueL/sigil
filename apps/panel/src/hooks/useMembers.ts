import type { Member, MemberListResponse, Permissions } from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useMemberList(serverId: string | undefined) {
  return useQuery({
    queryKey: ["members", serverId ?? ""],
    enabled: !!serverId,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/members`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to list members");
      }
      return res.json() as Promise<MemberListResponse>;
    },
  });
}

export function useAddMember(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; permissions: Permissions }) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to add member");
      }
      return res.json() as Promise<Member>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", serverId ?? ""] });
    },
  });
}

export function useUpdateMember(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; permissions: Permissions }) => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/members/${input.memberId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ permissions: input.permissions }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to update member");
      }
      return res.json() as Promise<Member>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", serverId ?? ""] });
    },
  });
}

export function useRemoveMember(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/members/${memberId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to remove member");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", serverId ?? ""] });
    },
  });
}

export function useTransferOwnership(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/members/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newOwnerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to transfer ownership");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", serverId ?? ""] });
    },
  });
}
