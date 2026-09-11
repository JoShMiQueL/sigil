import { z } from "zod";

// Backup status lifecycle: pending → in_progress → completed | failed
export const BackupStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type BackupStatus = z.infer<typeof BackupStatusSchema>;

// Where the backup file is stored
export const BackupStorageLocationSchema = z.enum(["local", "s3"]);
export type BackupStorageLocation = z.infer<typeof BackupStorageLocationSchema>;

// A backup record stored in the panel database
export const BackupSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0),
  status: BackupStatusSchema,
  storageLocation: BackupStorageLocationSchema,
  checksum: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Backup = z.infer<typeof BackupSchema>;

// Response for listing backups
export const BackupListResponseSchema = z.object({
  backups: z.array(BackupSchema),
  total: z.number().int().min(0),
});
export type BackupListResponse = z.infer<typeof BackupListResponseSchema>;

// Input for creating a backup
export const CreateBackupInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes("/"), "name cannot contain path separators")
    .refine((v) => !v.includes("\\"), "name cannot contain path separators")
    .refine((v) => !v.includes("\0"), "name cannot contain null bytes")
    .refine((v) => v !== "." && v !== "..", "name cannot be . or .."),
});
export type CreateBackupInput = z.infer<typeof CreateBackupInputSchema>;

// Storage backend type
export const BackupBackendSchema = z.enum(["local", "s3"]);
export type BackupBackend = z.infer<typeof BackupBackendSchema>;

// Per-node backup storage configuration
export const BackupStorageConfigSchema = z.object({
  nodeId: z.string().uuid(),
  backend: BackupBackendSchema,
  localPath: z.string().nullable(),
  s3Endpoint: z.string().nullable(),
  s3Bucket: z.string().nullable(),
  s3AccessKey: z.string().nullable(),
  s3Region: z.string().nullable(),
  maxBackupSizeGb: z.number().int().min(1).max(1000),
});
export type BackupStorageConfig = z.infer<typeof BackupStorageConfigSchema>;

// Input for updating storage config (s3SecretKey is write-only, not in response)
export const UpdateBackupStorageConfigInputSchema = z
  .object({
    backend: BackupBackendSchema,
    localPath: z.string().nullable().optional(),
    s3Endpoint: z.string().nullable().optional(),
    s3Bucket: z.string().nullable().optional(),
    s3AccessKey: z.string().nullable().optional(),
    s3SecretKey: z.string().nullable().optional(),
    s3Region: z.string().nullable().optional(),
    maxBackupSizeGb: z.number().int().min(1).max(1000).optional(),
  })
  .refine(
    (v) =>
      v.backend === "local" ||
      (v.s3Endpoint != null && v.s3Bucket != null && v.s3AccessKey != null),
    "S3 backend requires endpoint, bucket, and access key",
  );
export type UpdateBackupStorageConfigInput = z.infer<
  typeof UpdateBackupStorageConfigInputSchema
>;

// Daemon response for backup creation
export const DaemonBackupResponseSchema = z.object({
  backupId: z.string(),
  sizeBytes: z.number().int().min(0),
  checksum: z.string().nullable(),
  status: BackupStatusSchema,
});
export type DaemonBackupResponse = z.infer<typeof DaemonBackupResponseSchema>;

// Daemon response for backup restore
export const DaemonRestoreResponseSchema = z.object({
  status: z.literal("completed"),
});
export type DaemonRestoreResponse = z.infer<typeof DaemonRestoreResponseSchema>;
