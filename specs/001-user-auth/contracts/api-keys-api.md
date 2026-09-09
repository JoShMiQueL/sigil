# Contract: API Keys API

**Feature**: 001-user-auth
**Base path**: `/api/api-keys`

All endpoints require authentication (session cookie). Users manage their own API keys only.

## GET /api/api-keys

List the current user's API keys. Does not return the full key (only the prefix).

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "CI automation",
      "keyPrefix": "sigil_abc1...",
      "scopes": ["read", "control"],
      "lastUsedAt": "2026-09-09T12:00:00Z",
      "createdAt": "2026-09-01T00:00:00Z"
    }
  ]
}
```

## POST /api/api-keys

Create a new API key. The full key is returned only once.

**Request**: `ApiKeyCreateSchema`
```json
{
  "name": "CI automation",
  "scopes": ["read", "control"]
}
```

**Response 201**:
```json
{
  "id": "uuid",
  "name": "CI automation",
  "key": "sigil_abc123def456...",
  "keyPrefix": "sigil_abc1...",
  "scopes": ["read", "control"],
  "createdAt": "2026-09-09T00:00:00Z"
}
```

**Response 400**: validation error

## DELETE /api/api-keys/:id

Revoke an API key. The key immediately stops working.

**Response 200**: `{"status": "ok"}`
**Response 404`: key not found or does not belong to user

## API Key Authentication

API keys authenticate via the `Authorization` header:

```
Authorization: Bearer sigil_abc123def456...
```

The middleware:
1. Extracts the key from the header
2. Hashes it with SHA-256
3. Looks up the hash in `api_keys`
4. If found and not revoked, sets `ctx.user` and `ctx.apiKeyScopes`
5. Updates `last_used_at`
6. Enforces scope checks on the requested resource

**Scope enforcement**: each route declares required scopes. If the request is authenticated via API key, the middleware checks that the key's scopes include all required scopes. Session-authenticated requests (cookie) bypass scope checks (they have full user permissions).
