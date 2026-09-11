import type { Backup, BackupListResponse, BackupStorageConfig } from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useBackupList(serverId: string | undefined) {
  return useQuery({
    queryKey: ["backups", serverId ?? ""],
    enabled: !!serverId,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/backups`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to list backups");
      }
      return res.json() as Promise<BackupListResponse>;
    },
  });
}

export function useCreateBackup(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to create backup");
      }
      return res.json() as Promise<Backup>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups", serverId ?? ""] });
    },
  });
}

export function useRestoreBackup(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backupId: string) => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/backups/${backupId}/restore`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to restore backup");
      }
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups", serverId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["server", serverId ?? ""] });
    },
  });
}

export function useDeleteBackup(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backupId: string) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/backups/${backupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to delete backup");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups", serverId ?? ""] });
    },
  });
}

export function useBackupStorageConfig(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["backup-storage", nodeId ?? ""],
    enabled: !!nodeId,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/backup-storage`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to get storage config");
      }
      return res.json() as Promise<BackupStorageConfig>;
    },
  });
}

export function useUpdateBackupStorageConfig(nodeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/backup-storage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to update storage config");
      }
      return res.json() as Promise<BackupStorageConfig>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backup-storage", nodeId ?? ""] });
    },
  });
}

export function useTestBackupStorage(nodeId: string | undefined) {
  return useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      const res = await fetch(`${API_URL}/api/admin/nodes/${nodeId}/backup-storage/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "S3 connection test failed");
      }
      return res.json() as Promise<{ ok: boolean }>;
    },
  });
}
