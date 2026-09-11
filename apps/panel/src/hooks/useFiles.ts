import type { FileEntry, FileListResponse } from "@sigil/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function useFileList(serverId: string | undefined, path: string) {
  return useQuery({
    queryKey: ["files", serverId ?? "", path],
    enabled: !!serverId,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to list files");
      }
      return res.json() as Promise<FileListResponse>;
    },
  });
}

export function useFileContent(serverId: string | undefined, path: string | null) {
  return useQuery({
    queryKey: ["file-content", serverId ?? "", path ?? ""],
    enabled: !!serverId && !!path,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/files/read?path=${encodeURIComponent(path ?? "")}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to read file");
      }
      return res.json() as Promise<{
        path: string;
        content: string;
        size: number;
        encoding: string;
      }>;
    },
  });
}

export function useWriteFile(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/files/write?path=${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to write file");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", serverId] });
    },
  });
}

export function useCreateFile(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, type }: { path: string; type: "file" | "directory" }) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/files/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path, type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to create file");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", serverId] });
    },
  });
}

export function useDeleteFile(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to delete file");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", serverId] });
    },
  });
}

export function useRenameFile(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const res = await fetch(`${API_URL}/api/admin/servers/${serverId}/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to rename file");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", serverId] });
    },
  });
}

export function useUploadFile(serverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dir,
      file,
      overwrite,
    }: {
      dir: string;
      file: File;
      overwrite?: boolean;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      const overwriteParam = overwrite ? "&overwrite=true" : "";
      const res = await fetch(
        `${API_URL}/api/admin/servers/${serverId}/files/upload?path=${encodeURIComponent(dir)}${overwriteParam}`,
        { method: "POST", credentials: "include", body: formData },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const err = new Error(body?.error?.message ?? "Failed to upload file");
        (err as Error & { code?: string }).code = body?.error?.code;
        throw err;
      }
      return res.json() as Promise<{ path: string; size: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", serverId] });
    },
  });
}

export function downloadFileUrl(serverId: string, path: string): string {
  return `${API_URL}/api/admin/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`;
}

export type { FileEntry };
