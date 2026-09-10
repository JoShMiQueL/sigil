# Data Model: Daemon Core

**Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

The daemon is stateless from a database perspective — it has no database (Constitution Principle I). All persistent data is on the local filesystem (config, credentials) or managed by Docker (container state). The daemon maintains an in-memory map of managed servers for locking and state tracking, but this is ephemeral and rebuilt on startup by querying Docker.

This spec adds new shared Zod schemas to `packages/shared` (source of truth, Principle II) and new API endpoints on the panel for receiving state-change callbacks from the daemon.

## Local Files (Daemon)

### daemon.yaml

The daemon's configuration file at `/etc/sigil/daemon.yaml`.

```yaml
panel_url: http://panel.example.com:3000
pairing_token: sigilpair_<base64url>  # only on first run, removed after registration
credentials_path: /var/lib/sigil/daemon/credentials.json
volume_base_path: /var/lib/sigil/volumes
docker_socket: /var/run/docker.sock
listen_address: 0.0.0.0:8080
heartbeat_interval_sec: 30
stop_timeout_sec: 10
disk_full_threshold_pct: 95
uid_range_start: 1000
uid_range_end: 65535
default_pids_limit: 512
default_memory_limit_mb: 512
default_cpu_limit: 1.0
log_level: info
```

### credentials.json

Stored at `/var/lib/sigil/daemon/credentials.json` with `0600` permissions.

```json
{
  "node_id": "uuid",
  "secret_id": "abc123...",
  "secret": "sigilnode_<base64url>"
}
```

## Shared Schemas (packages/shared/src/server/)

### ServerConfiguration

The JSON payload the panel sends to the daemon to create or update a server container. This is the complete server definition — template expansion happens in the panel (R8), not the daemon.

```typescript
// packages/shared/src/server/config.ts
export const PortMappingSchema = z.object({
  hostIp: z.string().optional(),
  hostPort: z.number().int().min(1).max(65535),
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});
export type PortMapping = z.infer<typeof PortMappingSchema>;

export const ResourceLimitsSchema = z.object({
  memoryMb: z.number().int().min(1).max(16384),
  cpuLimit: z.number().min(0.1).max(16),
  pidsLimit: z.number().int().min(16).max(4096).optional(),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const ServerConfigurationSchema = z.object({
  serverId: z.string().uuid(),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z.array(PortMappingSchema).default([]),
  resourceLimits: ResourceLimitsSchema,
  volumePath: z.string().min(1),
});
export type ServerConfiguration = z.infer<typeof ServerConfigurationSchema>;
```

### ContainerState

The lifecycle state of a server container, as tracked by the daemon and reported to the panel.

```typescript
// packages/shared/src/server/state.ts
export const ContainerStateSchema = z.enum([
  "creating",   // container is being created
  "running",    // container is running
  "stopped",    // container stopped gracefully (exit 0)
  "crashed",    // container exited unexpectedly (non-zero exit, OOM, etc.)
  "removing",   // container is being removed
  "missing",    // container not found (deleted externally)
]);
export type ContainerState = z.infer<typeof ContainerStateSchema>;
```

### HeartbeatPayload (updated from R4)

R4's `HeartbeatPayloadSchema` is extended with a `dockerAvailable` field. When `false`, the panel marks the node as `"degraded"` instead of `"online"`. This allows the daemon to signal that it is alive but cannot manage containers (e.g., Docker daemon is down).

```typescript
// packages/shared/src/node/heartbeat.ts (updated)
export const HeartbeatPayloadSchema = z.object({
  timestamp: z.number().int(),
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().min(0).max(100),
  diskUsage: z.number().min(0).max(100),
  containerCount: z.number().int().min(0),
  dockerAvailable: z.boolean().default(true),  // NEW in R6
});
```

### NodeStatus (updated from R4)

R4's `NodeStatusSchema` is extended with `"degraded"` to support the new heartbeat field.

```typescript
// packages/shared/src/node/node.ts (updated)
export const NodeStatusSchema = z.enum(["online", "offline", "degraded", "unknown"]);
// "degraded" = daemon is alive (heartbeats arriving) but Docker is unavailable
```

### StateChangeEvent

The payload the daemon sends to the panel when a container changes state.

```typescript
// packages/shared/src/server/state.ts
export const StateChangeEventSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  previousState: ContainerStateSchema,
  newState: ContainerStateSchema,
  reason: z.string().optional(),  // "oom", "exit_code:127", "manual_stop", etc.
  exitCode: z.number().int().nullable().optional(),
  timestamp: z.number().int(),
});
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;
```

### Lifecycle Request/Response Schemas

```typescript
// packages/shared/src/server/lifecycle.ts
export const CreateServerRequestSchema = ServerConfigurationSchema;
export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const LifecycleResponseSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  message: z.string().optional(),
});
export type LifecycleResponse = z.infer<typeof LifecycleResponseSchema>;

export const ServerStatusSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  containerId: z.string().nullable(),
  exitCode: z.number().int().nullable().optional(),
  uptime: z.number().int().optional(),
});
export type ServerStatus = z.infer<typeof ServerStatusSchema>;
```

## Panel API: New Endpoint

### POST /api/node/server-state

Receives state-change callbacks from the daemon. Authenticated with node credentials (HMAC-SHA256, same as heartbeat). Uses the same `nodeAuthMiddleware` as the heartbeat endpoint.

**Request**: `StateChangeEventSchema`
```json
{
  "serverId": "uuid",
  "nodeId": "uuid",
  "previousState": "running",
  "newState": "crashed",
  "reason": "oom",
  "exitCode": 137,
  "timestamp": 1736380800
}
```

**Response 204**: State change accepted.

**Response 401**: Invalid node credentials.

This endpoint is registered alongside the existing heartbeat endpoint and uses the same `nodeAuthMiddleware`.

**R9 dependency**: The servers table does not exist yet (R9). In R6, the `server-state.service.ts` receives the callback, emits a `server.state` SSE event to connected browsers, and logs the state change. It does NOT persist the state to a database (no servers table). When R9 lands, the service will be extended to update the servers table. This is documented as an assumption in the spec.

**SSE event**: When the panel receives a state-change callback, it emits a `server.state` SSE event with `ServerStatePayload` to all connected admin browsers. This uses the existing SSE infrastructure from R17. The event type `server.state` is added to `SSEEventTypeSchema` in `packages/shared/src/sse/events.ts`.

## In-Memory State (Daemon)

The daemon maintains an in-memory map for per-server locking and quick state lookup. This is NOT persisted — it is rebuilt on startup by listing Docker containers with the `sigil.server-id` label.

```go
type ServerManager struct {
    mu      sync.Mutex                    // protects the servers map
    servers map[string]*ServerEntry       // keyed by server UUID
}

type ServerEntry struct {
    ID           string    // server UUID
    ContainerID  string    // Docker container ID
    State        ContainerState
    Config       ServerConfiguration
    LastExitCode *int
    lock         *sync.Mutex  // per-server lock, serializes operations on this server
}
```

**Concurrency model** (FR-025):
- Different servers: handled in parallel (each has its own lock)
- Same server: serialized (per-server mutex)

## Docker Container Labels

All containers created by the daemon are labeled for identification and filtering:

```json
{
  "sigil.server-id": "<server-uuid>",
  "sigil.node-id": "<node-uuid>",
  "sigil.managed": "true"
}
```

These labels are used by:
- The Events API filter to only receive events for managed containers
- `ContainerList` with label filter for reconciliation on startup
- `ContainerRemove` to find and clean up containers by server UUID

## State Transitions

```
                  ┌──────────┐
                  │ creating │
                  └────┬─────┘
                       │
              ┌────────▼────────┐
              │    running      │◄──── start
              └────┬────┬───────┘
          stop     │    │ crash/oom
              ┌────▼────┴───────┐
              │   stopped/crashed│
              └────┬───────────┘
          remove   │
              ┌────▼────┐
              │ removing │
              └────┬────┐
                   │    │ container gone
              ┌────▼────┐
              │ missing  │
              └─────────┘
```

Valid transitions:
- `creating → running` (container started)
- `creating → crashed` (container failed to start)
- `running → stopped` (graceful stop, exit 0)
- `running → crashed` (non-zero exit, OOM, killed)
- `stopped → running` (restart)
- `crashed → running` (restart)
- `* → removing` (remove command)
- `removing → missing` (container removed)
- `* → missing` (container not found during reconciliation)
