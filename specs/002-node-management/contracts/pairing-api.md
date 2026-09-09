# Contract: Pairing & Daemon API

**Feature**: 002-node-management
**Base path**: `/api/admin/pairing` (admin) and `/api/node` (daemon)

## Admin endpoints

Require admin session auth (from R1).

### POST /api/admin/pairing/tokens

Generate a pairing token for a specific region.

**Request**: `PairingTokenCreateSchema`
```json
{
  "region_id": "uuid"
}
```

**Response 201**: `PairingTokenDisplaySchema`
```json
{
  "id": "uuid",
  "token": "sigilpair_<base64url>",
  "region_id": "uuid",
  "region_name": "EU-West",
  "expires_at": "2026-09-09T..."
}
```

The `token` is shown only once. The admin must copy it to the daemon configuration immediately.

**Response 404**: Region not found.

### GET /api/admin/pairing/tokens

List pairing tokens (active and used, for audit purposes).

**Response 200**: `PairingTokenListSchema`
```json
[
  {
    "id": "uuid",
    "region_id": "uuid",
    "region_name": "EU-West",
    "created_by": "uuid",
    "expires_at": "2026-09-09T...",
    "used_at": null,
    "used_by_node_id": null,
    "created_at": "2026-09-09T..."
  }
]
```

## Daemon endpoints

These endpoints are authenticated via node credentials (HMAC-SHA256), not admin sessions. They are called by the daemon (R6), not by the panel UI.

### POST /api/node/register

Register a new daemon node using a pairing token. This is the only daemon endpoint that does not require node credentials — it exchanges a pairing token for credentials.

**Headers**: none (pairing token in body)

**Request**: `PairingRequestSchema`
```json
{
  "pairing_token": "sigilpair_<base64url>",
  "hostname": "node-01.example.com",
  "ip_address": "203.0.113.10",
  "capabilities": { "docker": true, "sftp": true }
}
```

**Response 201**: `NodeRegistrationResponseSchema`
```json
{
  "node_id": "uuid",
  "secret_id": "abc123...",
  "secret": "sigilnode_<base64url>"
}
```

The `secret` is shown only here and at credential regeneration. The daemon must store it securely.

**Response 401**: Invalid, expired, or already-used pairing token.
```json
{ "error": { "code": "PAIRING_TOKEN_INVALID", "message": "Pairing token expired" } }
```

### POST /api/node/heartbeat

Send a heartbeat with resource usage data.

**Headers**:
- `X-Node-Id`: the node's `secret_id`
- `X-Node-Signature`: `HMAC-SHA256(secret, timestamp + body)`
- `X-Node-Timestamp`: Unix epoch seconds

**Request**: `HeartbeatPayloadSchema`
```json
{
  "timestamp": 1736380800,
  "cpu_usage": 42.5,
  "memory_usage": 68.0,
  "disk_usage": 35.2,
  "container_count": 5
}
```

**Response 204**: Heartbeat accepted. Node status updated to `online`.

**Response 401**: Invalid signature, unknown node, or revoked credentials.
```json
{ "error": { "code": "NODE_AUTH_FAILED", "message": "Invalid credentials" } }
```

**Response 400**: Timestamp out of window (±60s).
```json
{ "error": { "code": "TIMESTAMP_OUT_OF_WINDOW", "message": "Timestamp must be within 60 seconds of server time" } }
```
