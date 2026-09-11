# API Contracts: Server Lifecycle (R9)

All endpoints under `/api/admin/servers` (admin-only guard). The existing daemon-proxy endpoints are refactored to be panel-owned.

## POST /api/admin/servers — Create a server

Creates a server record, auto-assigns a primary allocation, and instructs the daemon to create the container.

**Request body** (`ServerCreateInputSchema`):
```json
{
  "name": "My Minecraft Server",
  "nodeId": "uuid",
  "templateId": "uuid",
  "variables": { "SERVER_NAME": "Survival" }
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "name": "My Minecraft Server",
  "nodeId": "uuid",
  "templateId": "uuid",
  "allocationId": "uuid",
  "status": "offline",
  "config": { ... },
  "createdAt": "2026-09-11T...",
  "updatedAt": "2026-09-11T..."
}
```

**Errors**:
- 409 `NO_AVAILABLE_ALLOCATIONS` — node has no available allocations
- 502 `NODE_UNREACHABLE` — daemon is offline
- 409 `TEMPLATE_INACTIVE` — template is not activated
- 409 `DUPLICATE_NAME` — server name already exists on this node
- 502 `DAEMON_ERROR` — daemon rejected container creation (sets status to `creation_failed`)

## GET /api/admin/servers — List servers

**Query params**:
- `nodeId` (optional) — filter by node
- `status` (optional) — filter by status
- `limit` (optional, default 50) — pagination
- `offset` (optional, default 0) — pagination

**Response** (200):
```json
{
  "servers": [ ServerRecord, ... ],
  "total": 42
}
```

## GET /api/admin/servers/:serverId — Get server detail

**Response** (200):
```json
{
  "id": "uuid",
  "name": "My Minecraft Server",
  "nodeId": "uuid",
  "templateId": "uuid",
  "allocationId": "uuid",
  "status": "running",
  "config": { ... },
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Errors**:
- 404 `SERVER_NOT_FOUND`

## POST /api/admin/servers/:serverId/power — Power action

**Request body** (`ServerPowerActionSchema`):
```json
{ "action": "start" }
```

Actions: `start`, `stop`, `restart`

**Response** (200):
```json
{
  "serverId": "uuid",
  "status": "starting"
}
```

**Errors**:
- 409 `INVALID_STATE_TRANSITION` — action not valid for current state
- 502 `NODE_UNREACHABLE` — daemon is offline
- 502 `DAEMON_ERROR` — daemon rejected the command

## DELETE /api/admin/servers/:serverId — Delete a server

Removes the container + volume on the daemon, releases allocations, deletes the record.

**Response** (204): no body

**Errors**:
- 502 `NODE_UNREACHABLE` — daemon is offline (deletion fails to prevent orphaned containers)
- 502 `DAEMON_ERROR` — daemon failed to remove the container

## POST /api/node/server-state — Daemon state report (existing, updated)

This endpoint already exists (R6). R9 updates it to persist the state change to the server record and emit `server.update` SSE event.

**Request body** (`StateChangeEventSchema` — existing):
```json
{
  "serverId": "uuid",
  "nodeId": "uuid",
  "previousState": "running",
  "newState": "stopped",
  "reason": "intentional stop",
  "exitCode": 0,
  "timestamp": 1694352000
}
```

**Response** (204): no body

**Behavior**:
- Look up server by `serverId`
- If not found, ignore (FR-017)
- Map daemon state to panel status
- Update server record
- Emit `server.update` SSE event

## SSE Events

### `server.create`
Emitted when a server is created.
```json
{ "serverId": "uuid", "nodeId": "uuid", "name": "My Server", "status": "offline" }
```

### `server.update`
Emitted when a server's status changes (power action, daemon report).
```json
{ "serverId": "uuid", "nodeId": "uuid", "status": "running", "previousStatus": "starting" }
```

### `server.delete`
Emitted when a server is deleted.
```json
{ "serverId": "uuid", "nodeId": "uuid", "deleted": true }
```
