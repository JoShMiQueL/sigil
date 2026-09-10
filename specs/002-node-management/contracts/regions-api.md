# Contract: Regions API

**Feature**: 002-node-management
**Base path**: `/api/admin/regions`

All requests require admin session auth (from R1). All request/response bodies are JSON, validated against Zod schemas from `@sigil/shared`.

## GET /api/admin/regions

List all regions with node and server counts.

**Response 200**: `RegionListSchema`
```json
[
  {
    "id": "uuid",
    "name": "EU-West",
    "description": "European servers",
    "nodeCount": 3,
    "serverCount": 12,
    "createdAt": "2026-09-09T...",
    "updatedAt": "2026-09-09T..."
  }
]
```

## POST /api/admin/regions

Create a new region.

**Request**: `RegionCreateSchema`
```json
{
  "name": "EU-West",
  "description": "European servers"
}
```

**Response 201**: `RegionSchema`
```json
{
  "id": "uuid",
  "name": "EU-West",
  "description": "European servers",
  "createdAt": "2026-09-09T...",
  "updatedAt": "2026-09-09T..."
}
```

**Response 409**: Region name already exists.
```json
{ "error": { "code": "REGION_NAME_EXISTS", "message": "A region with this name already exists" } }
```

## DELETE /api/admin/regions/:id

Delete a region. Fails if the region has nodes assigned.

**Response 204**: Region deleted.

**Response 409**: Region has nodes.
```json
{ "error": { "code": "REGION_HAS_NODES", "message": "Cannot delete a region with active nodes" } }
```
