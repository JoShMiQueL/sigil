# Data Model: Node Management

**Feature**: 002-node-management
**Date**: 2026-09-09

## Entities

### Region

A geographic or logical grouping of nodes. Nodes must belong to a region before they can be registered.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| name | text | unique, not null, max 64 | `^[a-zA-Z0-9_.\- ]+$` |
| description | text | nullable, max 256 | Optional |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | Updated on every change |

**Indexes**:
- `regions_name_idx` on `name` (unique)

**Validation rules** (enforced via Zod in `packages/shared`):
- Name: 2-64 chars, alphanumeric + `_.- ` (space)
- Description: max 256 chars

**Deletion rules**:
- Cannot delete a region with nodes assigned (API returns error)
- Admin must reassign or remove all nodes first

### Node

A machine running a Sigil daemon. Registered via pairing token. Reports health via heartbeats.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| region_id | uuid | FK → regions.id, not null, on delete restrict | |
| hostname | text | not null, max 255 | Daemon-reported hostname |
| ip_address | text | not null | Daemon-reported public IP (stored as text for flexibility) |
| display_name | text | not null, max 64 | Admin-editable label, defaults to hostname |
| capabilities | jsonb | not null, default `'{}'` | e.g., `{"docker": true, "sftp": true}` |
| status | enum | not null, default `'unknown'` | Values: `online`, `offline`, `degraded`, `unknown` |
| cpu_usage | real | nullable | 0-100, from last heartbeat |
| memory_usage | real | nullable | 0-100, from last heartbeat |
| disk_usage | real | nullable | 0-100, from last heartbeat |
| container_count | integer | nullable | From last heartbeat |
| last_heartbeat_at | timestamptz | nullable | Null if never received |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | Updated on every change |

**Indexes**:
- `nodes_region_id_idx` on `region_id`
- `nodes_hostname_idx` on `hostname`

**State transitions** (status field):
- `unknown` → `online` (first heartbeat received, `dockerAvailable: true`)
- `unknown` → `degraded` (first heartbeat received, `dockerAvailable: false`)
- `online` → `offline` (heartbeat timeout exceeded)
- `online` → `degraded` (heartbeat received with `dockerAvailable: false`)
- `degraded` → `online` (heartbeat received with `dockerAvailable: true`)
- `degraded` → `offline` (heartbeat timeout exceeded)
- `offline` → `online` (heartbeat received after offline period, `dockerAvailable: true`)
- `offline` → `degraded` (heartbeat received after offline period, `dockerAvailable: false`)
- `unknown` → `offline` (heartbeat timeout exceeded without ever being online)

**Note**: The `degraded` status is introduced in R6. R4 only uses `online`, `offline`, and `unknown`. The `dockerAvailable` field in the heartbeat payload (also introduced in R6) controls the `online` vs `degraded` transition.

**Deletion rules**:
- Cannot delete a node with running servers (enforced in R9, API checks server count)
- Deleting a node revokes its credentials immediately

### PairingToken

A single-use, time-limited token that allows a daemon to register with the panel.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| token_hash | text | unique, not null | SHA-256 of the token |
| region_id | uuid | FK → regions.id, not null, on delete cascade | Pre-assigned region for the node |
| created_by | uuid | FK → users.id, not null | Admin who generated it |
| expires_at | timestamptz | not null | Default: now() + 15 min |
| used_at | timestamptz | nullable | Set when consumed |
| used_by_node_id | uuid | FK → nodes.id, nullable | Set to the node created on consumption |
| created_at | timestamptz | not null, default `now()` | |

**Indexes**:
- `pairing_tokens_token_hash_idx` on `token_hash` (unique)
- `pairing_tokens_region_id_idx` on `region_id`

**Lifecycle**:
- Created by admin with a pre-assigned region
- Valid if `used_at IS NULL` AND `expires_at > now()`
- Consumed on successful daemon registration (used_at set, used_by_node_id set)
- Invalid after use or expiration
- Expired/used tokens cleaned up periodically

**Token format**: `sigilpair_<base64url(32 bytes)>`. Full token shown once at generation. Only SHA-256 hash stored.

### NodeCredential

Authentication credentials for a daemon to communicate with the panel.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| node_id | uuid | FK → nodes.id, not null, on delete cascade | |
| secret_encrypted | text | not null | AES-256 encrypted secret (reversible — API decrypts to verify HMAC signatures) |
| secret_id | text | not null, max 32 | Public identifier sent in `X-Node-Id` header |
| created_at | timestamptz | not null, default `now()` | |
| revoked_at | timestamptz | nullable | Set when credentials are regenerated |

**Indexes**:
- `node_credentials_node_id_idx` on `node_id`
- `node_credentials_secret_id_idx` on `secret_id`

**Lifecycle**:
- Created on node registration (one credential per node)
- Verified on every daemon request (HMAC-SHA256 signature)
- Revoked when admin regenerates credentials (revoked_at set, new credential created)
- A node has at most one active credential (revoked_at IS NULL)

**Secret format**: `secret_id` is a random 16-char base64url string. The full secret is `sigilnode_<base64url(32 bytes)>`, shown once at registration or regeneration. The secret is stored AES-256 encrypted (reversible) — the API decrypts it to verify HMAC-SHA256 signatures on incoming daemon requests. Authentication uses HMAC-SHA256 with the secret as key.

### Heartbeat

Not a persisted entity — heartbeats are processed in real-time and update the Node record. A heartbeat payload contains:

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| timestamp | integer | not null | Unix epoch seconds, must be within ±60s of server time |
| cpu_usage | real | not null, 0-100 | |
| memory_usage | real | not null, 0-100 | |
| disk_usage | real | not null, 0-100 | |
| container_count | integer | not null, >= 0 | |
| docker_available | boolean | not null, default true | Introduced in R6. When false, node status is set to `degraded` instead of `online`. |

**Processing**:
- On receipt: validate HMAC signature, validate timestamp window, update node's `status` to `online` (or `degraded` if `docker_available` is false), `last_heartbeat_at` to `now()`, and resource fields.
- On timeout: periodic sweep marks nodes as `offline` when `last_heartbeat_at < now() - 90s`.

## Entity Relationships

```text
Region 1───* Node
Node   1───1 NodeCredential (active, at most one)
Region 1───* PairingToken
User   1───* PairingToken (created_by)
PairingToken 1───0..1 Node (used_by_node_id, set on consumption)
```

A region has many nodes. A node has one active credential. A region has many pairing tokens (each pre-assigned to that region). A pairing token, when consumed, creates one node in its pre-assigned region.

## Validation Schemas Location

All Zod schemas for these entities live in `packages/shared/src/node/`:

- `region.ts` — `RegionSchema`, `RegionCreateSchema`, `RegionUpdateSchema`
- `node.ts` — `NodeSchema`, `NodeUpdateSchema`, `NodeStatusSchema`, `NodeCapabilitiesSchema`
- `pairing.ts` — `PairingTokenSchema`, `PairingRequestSchema`, `PairingTokenDisplaySchema`
- `heartbeat.ts` — `HeartbeatPayloadSchema`
- `credentials.ts` — `NodeCredentialSchema`, `NodeAuthHeadersSchema`
