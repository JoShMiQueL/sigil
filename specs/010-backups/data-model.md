# Data Model: Backups

**Date**: 2026-09-11
**Feature**: R12 Backups

## Database Schema

### Table: `backups`

Stores metadata for each backup. The actual backup files live on the daemon (local or S3).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Unique backup ID |
| `server_id` | uuid | NOT NULL, FK → `servers(id)` ON DELETE CASCADE | Server this backup belongs to |
| `node_id` | uuid | NOT NULL, FK → `nodes(id)` ON DELETE CASCADE | Node where backup was created |
| `name` | text | NOT NULL | Display name (admin-provided or auto-generated) |
| `size_bytes` | bigint | NOT NULL DEFAULT 0 | Backup file size in bytes (0 until completed) |
| `status` | text | NOT NULL DEFAULT 'pending' | `pending`, `in_progress`, `completed`, `failed` |
| `storage_location` | text | NOT NULL DEFAULT 'local' | `local` or `s3` |
| `checksum` | text | | SHA256 checksum of the archive (optional, for integrity) |
| `error_message` | text | | Failure reason if status = `failed` |
| `created_at` | timestamptz | NOT NULL DEFAULT `now()` | When backup was requested |
| `completed_at` | timestamptz | | When backup finished (success or failure) |

**Indexes**:
- `idx_backups_server_id` on `server_id` (list backups for a server)
- `idx_backups_node_id` on `node_id` (list backups on a node)
- `idx_backups_status` on `status` (find in-progress backups)

### Table: `backup_storage_configs`

Per-node storage backend configuration. One row per node.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Unique config ID |
| `node_id` | uuid | NOT NULL, UNIQUE, FK → `nodes(id)` ON DELETE CASCADE | Node this config applies to |
| `backend` | text | NOT NULL DEFAULT 'local' | `local` or `s3` |
| `local_path` | text | | Local backup directory (if backend=local) |
| `s3_endpoint` | text | | S3-compatible endpoint URL |
| `s3_bucket` | text | | S3 bucket name |
| `s3_access_key` | text | | S3 access key ID |
| `s3_secret_key` | text | | S3 secret key (encrypted) |
| `s3_region` | text | | S3 region (optional for MinIO/R2) |
| `max_backup_size_gb` | integer | DEFAULT 10 | Max backup size in GB |
| `created_at` | timestamptz | NOT NULL DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL DEFAULT `now()` | |

**Indexes**:
- `idx_backup_storage_node_id` UNIQUE on `node_id` (one config per node)

## Shared Zod Schemas

### `BackupSchema`

```typescript
{
  id: string (uuid),
  serverId: string (uuid),
  nodeId: string (uuid),
  name: string,
  sizeBytes: number,
  status: "pending" | "in_progress" | "completed" | "failed",
  storageLocation: "local" | "s3",
  checksum: string | null,
  errorMessage: string | null,
  createdAt: string (ISO 8601),
  completedAt: string | null (ISO 8601),
}
```

### `BackupListResponseSchema`

```typescript
{
  backups: Backup[],
  total: number,
}
```

### `CreateBackupInputSchema`

```typescript
{
  name: string (max 255 chars, no path separators, no null bytes),
}
```

### `BackupStorageConfigSchema`

```typescript
{
  nodeId: string (uuid),
  backend: "local" | "s3",
  localPath: string | null,
  s3Endpoint: string | null,
  s3Bucket: string | null,
  s3AccessKey: string | null,
  s3Region: string | null,
  maxBackupSizeGb: number,
}
```

### `UpdateBackupStorageConfigInputSchema`

Same as `BackupStorageConfigSchema` but all fields optional except `backend`, and `s3SecretKey` is write-only (not returned in responses).

## State Machine

### Backup Status

```text
pending → in_progress → completed
                     ↘ failed
```

- `pending`: Record created in DB, daemon command not yet sent.
- `in_progress`: Daemon is creating the archive.
- `completed`: Archive created and stored successfully.
- `failed`: Archive creation or storage failed. `errorMessage` is set.

### Transitions

| From | To | Trigger |
|------|-----|---------|
| pending | in_progress | Daemon starts creating archive |
| in_progress | completed | Daemon finishes, archive stored |
| in_progress | failed | Daemon error (disk full, S3 failure, etc.) |
| completed | (deleted) | Admin deletes backup |
| failed | (deleted) | Admin deletes failed backup |

## Validation Rules

- Backup name: 1-255 chars, no `/`, `\`, `\0`, not `.` or `..`.
- Only one in-progress backup per server at a time.
- Server must exist and belong to the node.
- Storage config must exist for the node before creating a backup (default: local).
- S3 config requires endpoint, bucket, access key, and secret key.
- Local config requires a valid path (no path traversal in the local path).
