# Quickstart: File Manager (R11)

**Date**: 2026-09-11

## Prerequisites

- Docker running (for Testcontainers + daemon)
- Dev services up: `bun dev:services && bun --filter @sigil/db db:migrate && bun --filter @sigil/api db:seed`
- API running: `RATE_LIMIT_DISABLED=1 bun --filter @sigil/api dev`
- Panel running: `bun --filter @sigil/panel dev`
- A running server with files in its volume

## Validation Scenarios

### Scenario 1: Browse files (US1)

1. Login to panel at `http://localhost:5173/login`
2. Navigate to a running server's detail page
3. Click the "Files" tab
4. Verify the root directory listing appears with file names, sizes, and dates
5. Click a subdirectory — verify listing updates and breadcrumb shows path
6. Click breadcrumb parent — verify listing returns to parent

### Scenario 2: Edit a file (US2)

1. Browse to a directory with a text file
2. Click the file — verify editor opens with content
3. Modify the content
4. Click Save — verify success indicator
5. Reopen the file — verify changes persisted
6. Try opening a file >1MB — verify "file too large" error

### Scenario 3: Upload and download (US3)

1. Browse to a directory
2. Click Upload, select a file from machine
3. Verify file appears in listing after upload
4. Click Download on a file — verify file downloads to machine
5. Upload a file with same name — verify overwrite confirmation appears

### Scenario 4: Create, rename, delete (US4)

1. Click "New Folder", enter name — verify folder appears
2. Click "New File", enter name — verify empty file appears
3. Click Rename on a file, enter new name — verify item renamed
4. Click Delete on a file, confirm — verify file removed
5. Click Delete on a directory, confirm — verify directory and contents removed

### Scenario 5: Error paths

1. Stop a server, open Files tab — verify "server is not running" indicator
2. Start server, kill daemon, try listing — verify "daemon unreachable" error
3. Try path with `../` — verify "path not found" or validation error

## API Verification (curl)

```bash
# Get admin cookie
COOKIE=$(curl -s -c - http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' | grep better-auth | awk '{print $7}')

# List root directory
curl -s http://localhost:3000/api/admin/servers/<serverId>/files?path=. \
  -H "Cookie: better-auth=$COOKIE" | jq .

# Read a file
curl -s "http://localhost:3000/api/admin/servers/<serverId>/files/read?path=config/server.properties" \
  -H "Cookie: better-auth=$COOKIE" | jq .

# Write a file
curl -s -X PUT "http://localhost:3000/api/admin/servers/<serverId>/files/write?path=test.txt" \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth=$COOKIE" \
  -d '{"content":"hello world"}' -w "%{http_code}"

# Create a directory
curl -s -X POST http://localhost:3000/api/admin/servers/<serverId>/files/create \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth=$COOKIE" \
  -d '{"path":"new-dir","type":"directory"}' -w "%{http_code}"

# Rename a file
curl -s -X POST http://localhost:3000/api/admin/servers/<serverId>/files/rename \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth=$COOKIE" \
  -d '{"from":"test.txt","to":"renamed.txt"}' -w "%{http_code}"

# Delete a file
curl -s -X DELETE "http://localhost:3000/api/admin/servers/<serverId>/files?path=renamed.txt" \
  -H "Cookie: better-auth=$COOKIE" -w "%{http_code}"

# Upload a file
curl -s -X POST "http://localhost:3000/api/admin/servers/<serverId>/files/upload?path=." \
  -H "Cookie: better-auth=$COOKIE" \
  -F "file=@/path/to/local/file.txt" | jq .

# Download a file
curl -s -O "http://localhost:3000/api/admin/servers/<serverId>/files/download?path=file.txt" \
  -H "Cookie: better-auth=$COOKIE"
```
