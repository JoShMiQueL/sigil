# Contracts: Live Console

## REST API (panel → browser)

### POST /api/admin/servers/:serverId/console-token

Issues a short-lived JWT for connecting to the daemon's WebSocket console endpoint.

**Auth**: Admin session cookie (better-auth)

**Request**: No body

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "daemonUrl": "ws://127.0.0.1:8080/ws/servers/550e8400-e29b-41d4-a716-446655440000/console",
  "serverId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresIn": 300
}
```

**Errors**:
- 401 — not authenticated
- 403 — not admin
- 404 — server not found
- 409 — server is not running (cannot attach console to stopped server)

**JWT claims** (HS256, signed with `APP_SECRET`):
```json
{
  "serverId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "admin-uuid",
  "scope": "console",
  "iat": 1789085348,
  "exp": 1789085648
}
```

## WebSocket Protocol (browser ↔ daemon)

### Connection

**URL**: `ws://<node.ip>:<daemonPort>/ws/servers/<serverId>/console?token=<jwt>`

**Auth**: JWT in query param `token`. Daemon validates:
- JWT signature (HS256 with `APP_SECRET`)
- `serverId` in JWT matches URL path
- `exp` not expired
- `scope` is `"console"`

**Upgrade**: Standard HTTP WebSocket upgrade. Daemon responds with 101 Switching Protocols on success, 401/403 on auth failure.

### Daemon → Browser messages

All messages are JSON with a `type` discriminator.

#### Output message
```json
{
  "type": "output",
  "stream": "stdout",
  "text": "Starting server...\n",
  "timestamp": 1789085348123
}
```

#### Stats message (every 5 seconds)
```json
{
  "type": "stats",
  "cpuPct": 12.5,
  "memoryMb": 128,
  "memoryLimitMb": 1024,
  "diskMb": 512,
  "diskLimitMb": 20480,
  "timestamp": 1789085348123
}
```

#### Error message
```json
{
  "type": "error",
  "code": "CONTAINER_NOT_FOUND",
  "message": "Container for server 550e8400 does not exist"
}
```

Error codes:
- `CONTAINER_NOT_FOUND` — server record exists but container is missing
- `ATTACH_FAILED` — Docker attach operation failed
- `SERVER_NOT_RUNNING` — container exists but is not running
- `INVALID_TOKEN` — JWT validation failed (sent before connection is established)

### Browser → Daemon messages

#### Command message
```json
{
  "type": "command",
  "text": "say Hello world"
}
```

**Validation**:
- `text` max 4096 characters
- Only accepted when container is running
- Daemon writes `text + "\n"` to container stdin

### Close codes

| Code | Meaning |
|------|---------|
| 1000 | Normal close (server stopped) |
| 1008 | Policy violation (invalid token, scope mismatch) |
| 1011 | Internal error (Docker failure) |

### Reconnection buffer

On reconnect, the daemon sends the last 1000 lines of buffered output before continuing the live stream. The buffer is per-session (reset when all clients disconnect).

## SSE Events (no changes from R9)

R10 does not add new SSE events. Server state changes (running, stopped, crashed) continue to use the existing `server.update` SSE event from R9. The console connection state (connecting, connected, disconnected) is client-side only and not emitted via SSE.
