import { z } from "zod";

// A file or directory entry in a server's volume
export const FileEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  size: z.number().int().min(0),
  isDir: z.boolean(),
  modTime: z.string(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

// Response for directory listing
export const FileListResponseSchema = z.object({
  path: z.string(),
  entries: z.array(FileEntrySchema),
});
export type FileListResponse = z.infer<typeof FileListResponseSchema>;
