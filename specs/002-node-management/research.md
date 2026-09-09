# Research: Node Management

**Feature**: 002-node-management
**Date**: 2026-09-09

## Research Questions

### RQ1: Pairing token format and security model

**Decision**: Pairing tokens are opaque random strings (32 bytes, base64url-encoded), stored as SHA-256 hashes. Single-use, time-limited (15 min default). Displayed once at generation.

**Rationale**: Follows the same pattern as password reset tokens in R1. Opaque tokens prevent leaking information about the token through structure. SHA-256 hashing means a database compromise doesn't expose valid tokens. Single-use prevents replay attacks. Short TTL limits the window for token theft.

**Alternatives considered**:
- JWT-based pairing tokens: rejected because JWTs are self-contained and can't be revoked server-side without a blocklist. Opaque tokens give the server full control.
- Long-lived tokens: rejected because they increase the attack window. 15 minutes is enough for an admin to copy the token to the daemon config.

### RQ2: Node credential format and authentication

**Decision**: HMAC-SHA256 shared secrets. Each node gets a unique `node_id` and `secret` pair. The daemon sends `X-Node-Id` and `X-Node-Signature` headers. The signature is `HMAC-SHA256(secret, timestamp + body)`. A timestamp window of ±60 seconds prevents replay attacks.

**Rationale**: The daemon is a long-lived service client, not a user session. JWTs are designed for stateless user auth with expiration. HMAC shared secrets are the standard for service-to-service auth (used by GitHub webhooks, Stripe, Slack, etc.). The timestamp window prevents replay without needing a nonce store.

**Alternatives considered**:
- JWT with long expiration: rejected because JWTs can't be revoked without a blocklist. We need to revoke credentials immediately when an admin regenerates them.
- mTLS: rejected for now because it requires certificate management infrastructure. Can be added later as a transport-layer enhancement.
- API key (bearer token): rejected because bearer tokens sent over the wire can be intercepted. HMAC signatures are stateless and don't expose the secret.

### RQ3: Heartbeat timeout detection mechanism

**Decision**: The API checks `last_heartbeat_at` on every node read and on a periodic sweep. A node is marked `offline` if `now() - last_heartbeat_at > timeout` (default 90s). The sweep runs every 30s via a setInterval in the API process. No Redis dependency for timeout detection — it's a simple time comparison.

**Rationale**: Redis was initially considered for tracking heartbeat expiration, but a simple time comparison is sufficient and avoids an extra dependency. The sweep ensures nodes are marked offline even if nobody is reading them. The on-read check ensures the UI always shows fresh status.

**Alternatives considered**:
- Redis key expiration with keyspace notifications: rejected because it adds complexity and a Redis dependency for a simple time comparison.
- Daemon-driven status (daemon sends "going offline" message): rejected because a crashed daemon can't send a goodbye message. The server must detect absence independently.

### RQ4: Region deletion and node reassignment

**Decision**: Regions cannot be deleted while they have nodes. The admin must reassign or remove all nodes first. This is a hard constraint enforced at the API level.

**Rationale**: Orphaning nodes (nodes with a deleted region) creates ambiguity in the UI and API. Forcing explicit reassignment is safer than implicit orphaning.

**Alternatives considered**:
- Cascade delete (delete region + all nodes): rejected as destructive and dangerous.
- Soft delete with orphaned nodes: rejected because it creates unclear state.

### RQ5: Node status states

**Decision**: Three states: `online`, `offline`, `unknown`.
- `online`: last heartbeat within timeout window.
- `offline`: heartbeat timeout exceeded.
- `unknown`: node has never sent a heartbeat (freshly registered) or panel restarted and hasn't received a heartbeat yet.

**Rationale**: `unknown` is distinct from `offline` because a freshly registered node that hasn't sent a heartbeat yet is not necessarily broken. The admin should see "unknown" and know the daemon hasn't connected yet, vs "offline" which means it was online and stopped.

**Alternatives considered**:
- Binary online/offline: rejected because it conflates "never connected" with "was connected and lost connection."

### RQ6: Panel UI polling strategy for node status

**Decision**: The panel polls `GET /api/admin/nodes` every 15 seconds when the node list page is active. No WebSocket/SSE for node status in this spec — realtime is R10.

**Rationale**: Node status doesn't change frequently enough to justify WebSocket complexity in this spec. 15-second polling gives near-real-time status for admin monitoring. R10 (WebSocket console/stats) will add realtime infrastructure that node status can later adopt.

**Alternatives considered**:
- WebSocket push for node status: rejected as premature. Adds complexity not justified by the update frequency.
- Manual refresh only: rejected because admins would see stale status without explicit action.
