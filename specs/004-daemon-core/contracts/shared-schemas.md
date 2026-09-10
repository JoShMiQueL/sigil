# Contract: Shared Schemas (Zod → Go Mapping)

**Feature**: 004-daemon-core

This document maps the new Zod schemas in `packages/shared/src/server/` to their Go equivalents in the daemon. The Zod schemas are the source of truth (Constitution Principle II). The Go structs must match the JSON field names exactly.

## Schema Mapping

### ServerConfiguration

**Zod** (`packages/shared/src/server/config.ts`):
```typescript
export const ServerConfigurationSchema = z.object({
  serverId: z.string().uuid(),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z.array(PortMappingSchema).default([]),
  resourceLimits: ResourceLimitsSchema,
  volumePath: z.string().min(1),
});
```

**Go** (`apps/daemon/internal/server/types.go`):
```go
type ServerConfiguration struct {
    ServerID       string            `json:"serverId"`
    Image          string            `json:"image"`
    StartupCommand string            `json:"startupCommand"`
    Environment    map[string]string `json:"environment"`
    PortMappings   []PortMapping     `json:"portMappings"`
    ResourceLimits ResourceLimits    `json:"resourceLimits"`
    VolumePath     string            `json:"volumePath"`
}

type PortMapping struct {
    HostIP        string `json:"hostIp,omitempty"`
    HostPort      int    `json:"hostPort"`
    ContainerPort int    `json:"containerPort"`
    Protocol      string `json:"protocol"` // "tcp" or "udp"
}

type ResourceLimits struct {
    MemoryMB  int     `json:"memoryMb"`
    CPULimit  float64 `json:"cpuLimit"`
    PidsLimit *int    `json:"pidsLimit,omitempty"`
}
```

### ContainerState

**Zod** (`packages/shared/src/server/state.ts`):
```typescript
export const ContainerStateSchema = z.enum([
  "creating", "running", "stopped", "crashed", "removing", "missing"
]);
```

**Go**:
```go
type ContainerState string

const (
    StateCreating ContainerState = "creating"
    StateRunning  ContainerState = "running"
    StateStopped  ContainerState = "stopped"
    StateCrashed  ContainerState = "crashed"
    StateRemoving ContainerState = "removing"
    StateMissing  ContainerState = "missing"
)
```

### StateChangeEvent

**Zod** (`packages/shared/src/server/state.ts`):
```typescript
export const StateChangeEventSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  previousState: ContainerStateSchema,
  newState: ContainerStateSchema,
  reason: z.string().optional(),
  exitCode: z.number().int().nullable().optional(),
  timestamp: z.number().int(),
});
```

**Go**:
```go
type StateChangeEvent struct {
    ServerID      string         `json:"serverId"`
    NodeID        string         `json:"nodeId"`
    PreviousState ContainerState `json:"previousState"`
    NewState      ContainerState `json:"newState"`
    Reason        string         `json:"reason,omitempty"`
    ExitCode      *int           `json:"exitCode,omitempty"`
    Timestamp     int64          `json:"timestamp"`
}
```

### Lifecycle Response

**Zod** (`packages/shared/src/server/lifecycle.ts`):
```typescript
export const LifecycleResponseSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  message: z.string().optional(),
});
```

**Go**:
```go
type LifecycleResponse struct {
    ServerID string         `json:"serverId"`
    State    ContainerState `json:"state"`
    Message  string         `json:"message,omitempty"`
}
```

### ServerStatus

**Zod** (`packages/shared/src/server/lifecycle.ts`):
```typescript
export const ServerStatusSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  containerId: z.string().nullable(),
  exitCode: z.number().int().nullable().optional(),
  uptime: z.number().int().optional(),
});
```

**Go**:
```go
type ServerStatus struct {
    ServerID    string         `json:"serverId"`
    State       ContainerState `json:"state"`
    ContainerID *string       `json:"containerId"`
    ExitCode    *int           `json:"exitCode,omitempty"`
    Uptime      *int64         `json:"uptime,omitempty"`
}
```

## Verification

A CI test verifies that Go structs match Zod schemas:

1. A Go test serializes each struct to JSON
2. A Node script loads the Zod schemas and validates the JSON
3. If validation fails, the test fails

This catches drift between the Go and TypeScript sides without code generation.

```bash
# In CI (Makefile target)
go test ./internal/server/ -run TestSchemaCompatibility
# The test shells out to: node scripts/validate-go-json.js
```
