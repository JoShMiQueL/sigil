# Contract: Nodes API

**Feature**: 002-node-management
**Base path**: `/api/admin/nodes`

All requests require admin session auth (from R1). All request/response bodies are JSON, validated against Zod schemas from `@sigilpanel/shared`.

## GET /api/admin/nodes

List all nodes with status and resource usage.

**Query params** (optional):
- `region_id` — filter by region

**Response 200**: `NodeListSchema`
```json
[
  {
    "id": "uuid",
    "region_id": "uuid",
    "region_name": "EU-West",
    "hostname": "node-01.example.com",
    "display_name": "Node 01",
    "ip_address": "203.0.113.10",
    "status": "online",
    "cpu_usage": 42.5,
    "memory_usage": 68.0,
    "disk_usage": 35.2,
    "container_count": 5,
    "last_heartbeat_at": "2026-09-09T...",
    "created_at": "2026-09-09T...",
    "updated_at": "2026-09-09T..."
  }
]
```

## GET /api/admin/nodes/:id

Get a single node's details.

**Response 200**: `NodeSchema` (same as list item, plus `capabilities`)
```json
{
  "id": "uuid",
  "region_id": "uuid",
  "region_name": "EU-West",
  "hostname": "node-01.example.com",
  "display_name": "Node 01",
  "ip_address": "203.0.113.10",
  "capabilities": { "docker": true, "sftp": true },
  "status": "online",
  "cpu_usage": 42.5,
  "memory_usage": 68.0,
  "disk_usage": 35.2,
  "container_count": 5,
  "last_heartbeat_at": "2026-09-09T...",
  "created_at": "2026-09-09T...",
  "updated_at": "2026-09-09T..."
}
```

**Response 404**: Node not found.

## PATCH /api/admin/nodes/:id

Update a node's editable fields.

**Request**: `NodeUpdateSchema`
```json
{
  "display_name": "New Name",
  "region_id": "uuid"
}
```

**Response 200**: `NodeSchema` (updated node)

**Response 404**: Node not found.

## DELETE /api/admin/nodes/:id

Remove a node. Fails if the node has running servers.

**Response 204**: Node deleted, credentials revoked.

**Response 409**: Node has servers.
```json
{ "error": { "code": "NODE_HAS_SERVERS", "message": "Cannot remove a node with active servers" } }
```

## POST /api/admin/nodes/:id/regenerate-credentials

Regenerate a node's authentication credentials. Old credentials are immediately revoked.

**Response 200**: `NodeCredentialDisplaySchema`
```json
{
  "node_id": "uuid",
  "secret_id": "abc123...",
  "secret": "sigilnode_<base64url>",
  "created_at": "2026-09-09T..."
}
```

The `secret` is shown only once. The admin must copy it to the daemon configuration immediately.
