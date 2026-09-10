# Contract: Nodes API

**Feature**: 002-node-management
**Base path**: `/api/admin/nodes`

All requests require admin session auth (from R1). All request/response bodies are JSON, validated against Zod schemas from `@sigil/shared`.

## GET /api/admin/nodes

List all nodes with status and resource usage.

**Query params** (optional):
- `region_id` — filter by region

**Response 200**: `NodeListSchema`
```json
[
  {
    "id": "uuid",
    "regionId": "uuid",
    "regionName": "EU-West",
    "hostname": "node-01.example.com",
    "displayName": "Node 01",
    "ipAddress": "203.0.113.10",
    "status": "online",
    "cpuUsage": 42.5,
    "memoryUsage": 68.0,
    "diskUsage": 35.2,
    "containerCount": 5,
    "lastHeartbeatAt": "2026-09-09T...",
    "createdAt": "2026-09-09T...",
    "updatedAt": "2026-09-09T..."
  }
]
```

## GET /api/admin/nodes/:id

Get a single node's details.

**Response 200**: `NodeSchema` (same as list item, plus `capabilities`)
```json
{
  "id": "uuid",
  "regionId": "uuid",
  "regionName": "EU-West",
  "hostname": "node-01.example.com",
  "displayName": "Node 01",
  "ipAddress": "203.0.113.10",
  "capabilities": { "docker": true, "sftp": true },
  "status": "online",
  "cpuUsage": 42.5,
  "memoryUsage": 68.0,
  "diskUsage": 35.2,
  "containerCount": 5,
  "lastHeartbeatAt": "2026-09-09T...",
  "createdAt": "2026-09-09T...",
  "updatedAt": "2026-09-09T..."
}
```

**Response 404**: Node not found.

## PATCH /api/admin/nodes/:id

Update a node's editable fields.

**Request**: `NodeUpdateSchema`
```json
{
  "displayName": "New Name",
  "regionId": "uuid"
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

## POST /api/admin/nodes/:id/credentials/regenerate

Regenerate a node's authentication credentials. Old credentials are immediately revoked.

**Response 201**: `NodeCredentialDisplaySchema`
```json
{
  "nodeId": "uuid",
  "secretId": "abc123...",
  "secret": "sigilnode_<base64url>",
  "createdAt": "2026-09-09T..."
}
```

The `secret` is shown only once. The admin must copy it to the daemon configuration immediately.

## POST /api/admin/nodes/:id/credentials/revoke

Revoke a node's authentication credentials. The daemon will no longer be able to authenticate.

**Response 204**: Credentials revoked.

**Response 404**: Node not found.
