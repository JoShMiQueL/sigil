import { z } from "zod";

// Validates a relative file path within a server volume.
// Rejects: null bytes, path traversal (../), absolute paths, empty strings.
export const FilePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((val) => !val.includes("\0"), "Path contains null bytes")
  .refine((val) => !val.startsWith("/"), "Path must be relative")
  .refine((val) => !val.split("/").some((seg) => seg === ".."), "Path traversal not allowed");
export type FilePath = z.infer<typeof FilePathSchema>;

// Validates a single file or directory name (basename).
// Rejects: null bytes, path separators, special names (. and ..).
export const FileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((val) => !val.includes("\0"), "Name contains null bytes")
  .refine((val) => !val.includes("/"), "Name must not contain path separators")
  .refine((val) => val !== "." && val !== "..", "Name must not be . or ..");
export type FileName = z.infer<typeof FileNameSchema>;
