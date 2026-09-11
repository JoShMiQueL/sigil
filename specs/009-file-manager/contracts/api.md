# API Contracts: File Manager (R11)

**Date**: 2026-09-11

All endpoints are mounted under `/api/admin/servers/:serverId/files` and require admin authentication.

## REST Endpoints

### List Directory

```
GET /api/admin/servers/:serverId/files?path=<relative-path>
```

**Response 200**: `FileListResponse`
```json
{
  "path": "config",
  "entries": [
    { "name": "server.properties", "path": "config/server.properties", "size": 1024, "isDir": false, "modTime": "2026-09-11T12:00:00Z" },
    { "name": "mods", "path": "config/mods", "size": 0, "isDir": true, "modTime": "2026-09-11T12:00:00Z" }
  ]
}
```

**Errors**: 404 SERVER_NOT_FOUND, 409 SERVER_NOT_RUNNING, 404 FILE_NOT_FOUND, 502 DAEMON_UNREACHABLE

---

### Read File

```
GET /api/admin/servers/:serverId/files/read?path=<relative-path>
```

**Response 200**: `FileContent`
```json
{
  "path": "config/server.properties",
  "content": "# Server properties\nmotd=My Server\n",
  "size": 32,
  "encoding": "utf-8"
}
```

**Errors**: 404 FILE_NOT_FOUND, 413 FILE_TOO_LARGE (>1MB), 502 DAEMON_UNREACHABLE

---

### Write File

```
PUT /api/admin/servers/:serverId/files/write?path=<relative-path>
Content-Type: application/json
```

**Body**: `FileWriteInput`
```json
{ "content": "# Server properties\nmotd=Updated Server\n" }
```

**Response 204**: No content

**Errors**: 413 FILE_TOO_LARGE (>1MB), 502 DAEMON_UNREACHABLE

---

### Create File or Directory

```
POST /api/admin/servers/:serverId/files/create
Content-Type: application/json
```

**Body**: `FileCreateInput`
```json
{ "path": "config/new-folder", "type": "directory" }
```

**Response 201**: Created

**Errors**: 409 FILE_EXISTS, 502 DAEMON_UNREACHABLE

---

### Delete File or Directory

```
DELETE /api/admin/servers/:serverId/files?path=<relative-path>
```

**Response 204**: No content

**Errors**: 404 FILE_NOT_FOUND, 502 DAEMON_UNREACHABLE

---

### Rename File or Directory

```
POST /api/admin/servers/:serverId/files/rename
Content-Type: application/json
```

**Body**: `FileRenameInput`
```json
{ "from": "config/old-name.txt", "to": "config/new-name.txt" }
```

**Response 204**: No content

**Errors**: 404 FILE_NOT_FOUND, 409 FILE_EXISTS, 502 DAEMON_UNREACHABLE

---

### Upload File

```
POST /api/admin/servers/:serverId/files/upload?path=<directory-path>&overwrite=<bool>
Content-Type: multipart/form-data
```

**Form field**: `file` — the file to upload

**Response 201**: `FileUploadResponse`
```json
{ "path": "plugins/my-plugin.jar", "size": 5242880 }
```

**Errors**: 409 FILE_EXISTS (without overwrite=true), 413 FILE_TOO_LARGE (>100MB), 502 DAEMON_UNREACHABLE

---

### Download File

```
GET /api/admin/servers/:serverId/files/download?path=<relative-path>
```

**Response 200**: Binary stream with `Content-Disposition: attachment; filename="<basename>"` and `Content-Type: application/octet-stream`

**Errors**: 404 FILE_NOT_FOUND, 502 DAEMON_UNREACHABLE

---

## Daemon Endpoints (internal, HMAC-authenticated)

The API proxies to these daemon endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/servers/{serverId}/files/list?path=` | List directory (extended to return entries with metadata) |
| GET | `/servers/{serverId}/files/read?path=` | Read file content |
| POST | `/servers/{serverId}/files/write` | Write file content |
| DELETE | `/servers/{serverId}/files/delete?path=` | Delete file/directory |
| POST | `/servers/{serverId}/files/mkdir` | Create directory |
| POST | `/servers/{serverId}/files/rename` | Rename file/directory |
| POST | `/servers/{serverId}/files/upload?path=` | Upload file (binary body) |
| GET | `/servers/{serverId}/files/download?path=` | Download file (binary stream) |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| SERVER_NOT_FOUND | 404 | Server does not exist |
| SERVER_NOT_RUNNING | 409 | Server is not running |
| FILE_NOT_FOUND | 404 | File or directory does not exist |
| FILE_EXISTS | 409 | File or directory already exists |
| FILE_TOO_LARGE | 413 | File exceeds size limit |
| INVALID_PATH | 400 | Path validation failed |
| DAEMON_UNREACHABLE | 502 | Daemon is not reachable |
