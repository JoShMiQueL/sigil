import { z } from "zod";

// Content of a text file
export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number().int().min(0),
  encoding: z.literal("utf-8"),
});
export type FileContent = z.infer<typeof FileContentSchema>;

// Input for writing file content
export const FileWriteInputSchema = z.object({
  content: z.string().max(1048576), // 1MB limit for text editing
});
export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

// Input for creating a new file or directory
export const FileCreateInputSchema = z.object({
  path: z.string().min(1).max(1024),
  type: z.enum(["file", "directory"]),
});
export type FileCreateInput = z.infer<typeof FileCreateInputSchema>;

// Input for renaming a file or directory
export const FileRenameInputSchema = z.object({
  from: z.string().min(1).max(1024),
  to: z.string().min(1).max(1024),
});
export type FileRenameInput = z.infer<typeof FileRenameInputSchema>;

// Response after uploading a file
export const FileUploadResponseSchema = z.object({
  path: z.string(),
  size: z.number().int().min(0),
});
export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;
