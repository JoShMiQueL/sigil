# API Contracts: Backups

**Date**: 2026-09-11
**Feature**: R12 Backups

## Panel REST API (Browser → API)

All routes require authenticated admin user. Mounted under `/api/admin/servers/:serverId/backups` and `/api/admin/nodes/:nodeId/backup-storage`.

### Backup Routes

#### `GET /api/admin/servers/:serverId/backups`

List all backups for a server.

**Response 200**:
```json
{
  "backups": [
    {
      "id": "uuid",
      "serverId": "uuid",
      "nodeId": "uuid",
      "name": "backup-1",
      "sizeBytes": 1048576,
      "status": "completed",
      "storageLocation": "local",
      "checksum": "sha256hex",
      "errorMessage": null,
      "createdAt": "2026-09-11T12:00:00Z",
      "completedAt": "2026-09-11T12:01:00Z"
    }
  ],
  "total": 1
}
```

#### `POST /api/admin/servers/:serverId/backups`

Create a new backup.

**Request**:
```json
{ "name": "my-backup" }
```

**Response 201**:
```json
{
  "id": "uuid",
  "serverId": "uuid",
  "nodeId": "uuid",
  "name": "my-backup",
  "sizeBytes": 0,
  "status": "pending",
  "storageLocation": "local",
  "checksum": null,
  "errorMessage": null,
  "createdAt": "2026-09-11T12:00:00Z",
  "completedAt": null
}
```

**Errors**:
- 400: Invalid name
- 404: Server not found
- 409: Backup already in progress for this server
- 502: Daemon unreachable

#### `POST /api/admin/servers/:serverId/backups/:backupId/restore`

Restore a backup to its server. Stops the server if running, replaces volume contents, leaves server stopped.

**Response 200**:
```json
{ "message": "Restore completed. Server is stopped." }
```

**Errors**:
- 404: Backup or server not found
- 409: Backup status is not "completed"
- 502: Daemon unreachable

#### `DELETE /api/admin/servers/:serverId/backups/:backupId`

Delete a backup. Removes from both the list and the storage backend.

**Response 204**: No content

**Errors**:
- 404: Backup or server not found
- 409: Backup is in progress (cannot delete)
- 502: Daemon unreachable

### Storage Config Routes

#### `GET /api/admin/nodes/:nodeId/backup-storage`

Get the backup storage configuration for a node.

**Response 200**:
```json
{
  "nodeId": "uuid",
  "backend": "local",
  "localPath": "/var/lib/sigil/backups",
  "s3Endpoint": null,
  "s3Bucket": null,
  "s3AccessKey": null,
  "s3Region": null,
  "maxBackupSizeGb": 10
}
```

Note: `s3SecretKey` is never returned.

#### `PUT /api/admin/nodes/:nodeId/backup-storage`

Update the backup storage configuration for a node.

**Request**:
```json
{
  "backend": "s3",
  "s3Endpoint": "https://minio.example.com",
  "s3Bucket": "sigil-backups",
  "s3AccessKey": "minioadmin",
  "s3SecretKey": "minioadmin",
  "s3Region": "us-east-1",
  "maxBackupSizeGb": 20
}
```

**Response 200**: Same as GET response (without secret key).

**Errors**:
- 400: Invalid config (missing required S3 fields)
- 404: Node not found
- 502: S3 connection test failed

#### `POST /api/admin/nodes/:nodeId/backup-storage/test`

Test S3 connectivity without saving the configuration.

**Request**: Same as PUT.

**Response 200**:
```json
{ "ok": true }
```

**Response 502**:
```json
{ "error": { "code": "S3_CONNECTION_FAILED", "message": "..." } }
```

## Daemon API (API → Daemon)

All daemon routes require HMAC-SHA256 auth headers (`X-Node-Id`, `X-Node-Signature`, `X-Node-Timestamp`).

### `POST /servers/{serverId}/backups`

Create a backup of the server's volume.

**Query params**: `name=<backup-name>`, `backup_id=<uuid>`, `storage=<local|s3>`

If `storage=s3`, the daemon reads S3 config from its config file (passed by the panel when registering the node, or fetched via a separate config endpoint).

**Response 200**:
```json
{
  "backupId": "uuid",
  "sizeBytes": 1048576,
  "checksum": "sha256hex",
  "status": "completed"
}
```

**Response 500**:
```json
{
  "error": {
    "code": "BACKUP_FAILED",
    "message": "disk full"
  }
}
```

**Response 409**:
```json
{
  "error": {
    "code": "BACKUP_IN_PROGRESS",
    "message": "a backup is already in progress for this server"
  }
}
```

### `POST /servers/{serverId}/backups/{backupId}/restore`

Restore a backup to the server's volume. The panel must stop the server before calling this.

**Query params**: `storage=<local|s3>`

**Response 200**:
```json
{
  "status": "completed"
}
```

**Response 404**: Backup file not found.

**Response 500**: Restore failed (corrupted archive, disk error).

### `DELETE /servers/{serverId}/backups/{backupId}`

Delete a backup file from storage.

**Query params**: `storage=<local|s3>`

**Response 204**: No content.

**Response 404**: Backup file not found.

## Error Codes

| Code | HTTP Status | Description |
|------|-----------|-------------|
| `BACKUP_IN_PROGRESS` | 409 | A backup is already being created for this server |
| `BACKUP_NOT_FOUND` | 404 | Backup record or file not found |
| `BACKUP_FAILED` | 500 | Backup creation failed (disk full, archive error) |
| `RESTORE_FAILED` | 500 | Restore failed (corrupted archive, extraction error) |
| `S3_CONNECTION_FAILED` | 502 | S3 endpoint unreachable or credentials invalid |
| `S3_UPLOAD_FAILED` | 500 | S3 upload failed after retries |
| `DAEMON_UNREACHABLE` | 502 | Daemon is offline or timed out |
| `SERVER_NOT_FOUND` | 404 | Server does not exist |
| `INVALID_NAME` | 400 | Backup name contains invalid characters |
| `BACKUP_TOO_LARGE` | 413 | Backup exceeds configured max size |
