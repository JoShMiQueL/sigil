# Quickstart: Backups

**Date**: 2026-09-11
**Feature**: R12 Backups

## Prerequisites

- Docker running (for Testcontainers)
- Dev services started: `bun dev:services && bun --filter @sigil/db db:migrate && bun --filter @sigil/api db:seed`
- API on `http://localhost:3000`
- Panel on `http://localhost:5173`
- Admin credentials: `admin@sigil.local` / `admin12345`
- A running server with files in its volume (created via R9 + R11)

## Scenario 1: Create a backup

```bash
# Login and get cookie
COOKIE=$(curl -s -c - -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' \
  | grep sigil_session | awk '{print $NF}')

# Get a server ID (use the first server)
SERVER_ID=$(curl -s http://localhost:3000/api/admin/servers \
  -H "Cookie: sigil_session=$COOKIE" | jq -r '.servers[0].id')

# Create a backup
curl -s -X POST "http://localhost:3000/api/admin/servers/$SERVER_ID/backups" \
  -H "Content-Type: application/json" \
  -H "Cookie: sigil_session=$COOKIE" \
  -d '{"name":"test-backup"}' | jq

# Expected: 201 with status "pending", sizeBytes 0
```

## Scenario 2: List backups

```bash
curl -s "http://localhost:3000/api/admin/servers/$SERVER_ID/backups" \
  -H "Cookie: sigil_session=$COOKIE" | jq

# Expected: list with the backup, status should transition to "completed"
```

## Scenario 3: Restore a backup

```bash
BACKUP_ID=$(curl -s "http://localhost:3000/api/admin/servers/$SERVER_ID/backups" \
  -H "Cookie: sigil_session=$COOKIE" | jq -r '.backups[0].id')

# Restore (will stop server if running)
curl -s -X POST "http://localhost:3000/api/admin/servers/$SERVER_ID/backups/$BACKUP_ID/restore" \
  -H "Cookie: sigil_session=$COOKIE" | jq

# Expected: 200 with "Restore completed. Server is stopped."
```

## Scenario 4: Delete a backup

```bash
curl -s -X DELETE "http://localhost:3000/api/admin/servers/$SERVER_ID/backups/$BACKUP_ID" \
  -H "Cookie: sigil_session=$COOKIE" -w "%{http_code}"

# Expected: 204
```

## Scenario 5: Configure S3 storage

```bash
NODE_ID=$(curl -s http://localhost:3000/api/admin/nodes \
  -H "Cookie: sigil_session=$COOKIE" | jq -r '.nodes[0].id')

# Test S3 connectivity (without saving)
curl -s -X POST "http://localhost:3000/api/admin/nodes/$NODE_ID/backup-storage/test" \
  -H "Content-Type: application/json" \
  -H "Cookie: sigil_session=$COOKIE" \
  -d '{
    "backend": "s3",
    "s3Endpoint": "http://localhost:9000",
    "s3Bucket": "sigil-backups",
    "s3AccessKey": "minioadmin",
    "s3SecretKey": "minioadmin"
  }' | jq

# Save S3 config
curl -s -X PUT "http://localhost:3000/api/admin/nodes/$NODE_ID/backup-storage" \
  -H "Content-Type: application/json" \
  -H "Cookie: sigil_session=$COOKIE" \
  -d '{
    "backend": "s3",
    "s3Endpoint": "http://localhost:9000",
    "s3Bucket": "sigil-backups",
    "s3AccessKey": "minioadmin",
    "s3SecretKey": "minioadmin",
    "maxBackupSizeGb": 20
  }' | jq
```

## Scenario 6: MCP verification (browser)

1. Login at `http://localhost:5173/login` with admin credentials.
2. Navigate to a server's detail page.
3. Verify a "Backups" section appears below "Files".
4. Click "Create Backup", enter a name, submit.
5. Verify the backup appears in the list with "pending" then "completed" status.
6. Click "Restore" on a completed backup, confirm the dialog.
7. Verify the server stops and a success message appears.
8. Click "Delete" on a backup, confirm.
9. Verify the backup disappears from the list.

## Error paths to verify

- Create backup with invalid name (contains `/`) → 400 error.
- Create two backups simultaneously → second gets 409.
- Restore a non-completed backup → 409.
- Delete an in-progress backup → 409.
- Daemon unreachable → 502 error on all operations.
- S3 config with invalid credentials → test returns 502.
