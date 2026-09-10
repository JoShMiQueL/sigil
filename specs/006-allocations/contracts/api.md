# API Contracts: Allocations

All endpoints are mounted under `/api/admin/nodes/:nodeId/allocations`. Admin auth required.

## Add Allocations (IP + port range)

```
POST /api/admin/nodes/:nodeId/allocations
```

**Request**:
```json
{
  "ip": "203.0.113.10",
  "portStart": 25565,
  "portEnd": 25575,
  "protocol": "tcp"
}
```

- `ip`: valid IPv4 or IPv6 address (required)
- `portStart`: integer 1-65535 (required)
- `portEnd`: integer 1-65535 (optional — if omitted, single port)
- `protocol`: `tcp` or `udp` (optional, default `tcp`)
- If `portEnd < portStart`, returns 400.

**Response** (201):
```json
{
  "created": 11,
  "skipped": 0,
  "ip": "203.0.113.10",
  "portRange": "25565-25575"
}
```

- `created`: number of new allocations created
- `skipped`: number of allocations that already existed (idempotent)

**Response** (400): invalid IP, port out of range, or portEnd < portStart.

## List Allocations

```
GET /api/admin/nodes/:nodeId/allocations
```

**Query params** (all optional):
- `status`: `available` or `assigned` — filter by status
- `ip`: string — filter by IP address
- `port`: integer — search by port number
- `limit`: integer (default 100, max 1000)
- `offset`: integer (default 0)

**Response** (200):
```json
{
  "allocations": [
    {
      "id": "uuid",
      "nodeId": "uuid",
      "ip": "203.0.113.10",
      "port": 25565,
      "protocol": "tcp",
      "status": "available",
      "serverId": null,
      "isPrimary": false,
      "createdAt": "2026-09-10T...",
      "updatedAt": "2026-09-10T..."
    }
  ],
  "total": 11,
  "available": 11,
  "assigned": 0
}
```

- `total`, `available`, `assigned`: counts for this node (ignoring filters)

## Get Allocation Summary

```
GET /api/admin/nodes/:nodeId/allocations/summary
```

**Response** (200):
```json
{
  "total": 100,
  "available": 95,
  "assigned": 5,
  "primaryIp": "203.0.113.10"
}
```

## Delete Allocation

```
DELETE /api/admin/nodes/:nodeId/allocations/:allocationId
```

**Response** (204): allocation deleted.

**Response** (409): allocation is assigned to a server and cannot be deleted.

## Assign Allocation to Server

```
POST /api/admin/nodes/:nodeId/allocations/:allocationId/assign
```

**Request**:
```json
{
  "serverId": "uuid",
  "isPrimary": true
}
```

- `serverId`: UUID of the server to assign to (required)
- `isPrimary`: boolean (optional, default `false`)

**Response** (200):
```json
{
  "id": "uuid",
  "status": "assigned",
  "serverId": "uuid",
  "isPrimary": true
}
```

**Response** (409): allocation is already assigned to another server.

## Unassign Allocation

```
POST /api/admin/nodes/:nodeId/allocations/:allocationId/unassign
```

**Response** (200):
```json
{
  "id": "uuid",
  "status": "available",
  "serverId": null,
  "isPrimary": false
}
```

**Response** (409): allocation is not assigned.

## Auto-Assign Primary Allocation

```
POST /api/admin/nodes/:nodeId/allocations/auto-assign
```

**Request**:
```json
{
  "serverId": "uuid"
}
```

**Response** (200):
```json
{
  "allocation": {
    "id": "uuid",
    "ip": "203.0.113.10",
    "port": 25565,
    "protocol": "tcp",
    "status": "assigned",
    "serverId": "uuid",
    "isPrimary": true
  }
}
```

**Response** (409): no available allocations on this node.

## Set Node Primary IP

```
PATCH /api/admin/nodes/:nodeId
```

**Request**:
```json
{
  "primaryIp": "203.0.113.10"
}
```

- Set to `null` to clear the primary IP.

**Response** (200): updated node with `primaryIp` field.

## Release Server Allocations (internal, called by R9)

```
POST /api/admin/allocations/release
```

**Request**:
```json
{
  "serverId": "uuid"
}
```

**Response** (200):
```json
{
  "released": 3
}
```

- Releases all allocations assigned to the server (sets `server_id = NULL`, `status = 'available'`, `is_primary = false`).

## SSE Events

New event types added to `SSEEventTypeSchema`:

| Event | Payload | When |
|-------|---------|------|
| `allocation.create` | `{ nodeId, ip, count, portRange }` | Allocations added (bulk) |
| `allocation.update` | `AllocationSchema` | Allocation assigned/unassigned |
| `allocation.delete` | `{ id, nodeId, deleted: true }` | Allocation removed |

The panel listens for these events and refetches the allocation list + summary.
