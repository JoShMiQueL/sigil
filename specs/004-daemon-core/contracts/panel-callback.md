# Contract: Panel Callback API (Daemon → Panel)

**Feature**: 004-daemon-core
**Base path**: `/api/node` (existing daemon endpoint namespace from R4)

All requests are authenticated with node credentials (HMAC-SHA256), same scheme as R4 heartbeat. The daemon signs requests with its stored secret.

**Authentication headers** (on every request):
- `X-Node-Id`: the node's `secret_id`
- `X-Node-Signature`: `HMAC-SHA256(secret, timestamp + body)`
- `X-Node-Timestamp`: Unix epoch seconds (must be within ±60s of server time)

## POST /api/node/heartbeat

Already implemented in R4. Sends resource usage data. The daemon is the client.

**Request**: `HeartbeatPayloadSchema`
```json
{
  "timestamp": 1736380800,
  "cpuUsage": 42.5,
  "memoryUsage": 68.0,
  "diskUsage": 35.2,
  "containerCount": 5,
  "dockerAvailable": true
}
```

**Response 204**: Heartbeat accepted. Node status updated to `online` (or `degraded` if `dockerAvailable` is false).

**Response 401**: Credentials invalid or revoked.

## POST /api/node/server-state

New endpoint in R6. Receives a state-change callback from the daemon when a container changes state.

**Request**: `StateChangeEventSchema`
```json
{
  "serverId": "550e8400-e29b-41d4-a716-446655440000",
  "nodeId": "660e8400-e29b-41d4-a716-446655440000",
  "previousState": "running",
  "newState": "crashed",
  "reason": "oom",
  "exitCode": 137,
  "timestamp": 1736380800
}
```

**Response 204**: State change accepted. The panel emits a `server.state` SSE event to connected admin browsers.

**Response 401**: Invalid node credentials.
```json
{ "error": { "code": "NODE_AUTH_FAILED", "message": "Invalid credentials" } }
```

**Response 400**: Invalid payload (malformed state change event).
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid state transition" } }
```

**R9 dependency**: The panel does not yet persist server state (no servers table). In R6, the callback is received, logged, and emitted as an SSE event. Persistence is added in R9.

### Retry behavior (daemon-side)

If the panel is unreachable or returns 5xx, the daemon queues the event and retries with exponential backoff:
- 1st retry: 2s
- 2nd retry: 4s
- 3rd retry: 8s
- 4th retry: 16s
- 5th retry: 30s
- Subsequent: 30s (capped)

Events are kept in an in-memory queue. On daemon shutdown, pending events are logged but not persisted (state reconciliation on next startup covers this gap). If the panel returns 4xx (auth failure, validation error), the event is dropped — retrying won't help.

### Reconciliation on startup

When the daemon starts, it lists all containers with the `sigilpanel.server-id` label and reports their current state to the panel via `POST /api/node/server-state` with `previousState: "missing"` (or the last known state if the daemon kept it) and `newState: <actual state>`. This ensures the panel's view converges after a daemon restart.
