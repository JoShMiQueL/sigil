# Data Model: Live Console

## Entities

### ConsoleToken (JWT, not persisted)

A short-lived JWT signed by the panel API, validated by the daemon.

| Field | Type | Description |
|-------|------|-------------|
| serverId | string (UUID) | The server the token grants console access to |
| userId | string (UUID) | The admin user requesting access |
| scope | "console" | Token scope (always "console" for R10) |
| iat | number | Issued-at timestamp (Unix seconds) |
| exp | number | Expiry timestamp (Unix seconds, max 5 min from iat) |

**Validation**: `exp - iat <= 300` (5 minutes). `serverId` must match the server in the WebSocket URL path. `scope` must be `"console"`.

### ConsoleMessage (in-memory, not persisted)

A chunk of output from the container.

| Field | Type | Description |
|-------|------|-------------|
| type | "output" | Message type discriminator |
| stream | "stdout" \| "stderr" | Which stream the output came from |
| text | string | The output text (may contain multiple lines) |
| timestamp | number | Unix milliseconds when the daemon received the output |

### ConsoleCommand (in-memory, not persisted)

A command sent from the browser to the container stdin.

| Field | Type | Description |
|-------|------|-------------|
| type | "command" | Message type discriminator |
| text | string | The command text (without trailing newline) |

### ServerStats (in-memory, not persisted)

Real-time resource usage for a server.

| Field | Type | Description |
|-------|------|-------------|
| type | "stats" | Message type discriminator |
| cpuPct | number | CPU usage percentage (0-100) |
| memoryMb | number | Memory usage in MB |
| memoryLimitMb | number | Memory limit in MB |
| diskMb | number | Disk usage in MB |
| diskLimitMb | number | Disk limit in MB |
| timestamp | number | Unix milliseconds |

### ConsoleConnectionState (client-side only)

The state of the WebSocket connection, tracked by the panel hook.

| State | Description |
|-------|-------------|
| connecting | WebSocket is being opened |
| connected | WebSocket is open and streaming |
| reconnecting | Connection lost, waiting to retry with backoff |
| disconnected | Server stopped or daemon unreachable |
| error | WebSocket error (e.g., invalid token) |

## State Transitions

### Console connection state machine

```text
connecting ──ok──> connected ──close──> reconnecting ──ok──> connected
    │                  │                    │
    │                  └──server stopped──> disconnected
    │                  └──error──>         error
    └──fail──>         error
    reconnecting ──max retries──> disconnected
    disconnected ──server starts──> connecting (if user reopens)
```

### Daemon console session lifecycle

```text
idle ──client connects──> attaching ──attach ok──> streaming
    attaching ──attach fail──> idle (send error to client)
    streaming ──client disconnects──> idle (release buffer)
    streaming ──container stops──> streaming (send final output) ──> idle
```

## Shared Schemas

### packages/shared/src/console/message.ts

```typescript
// WebSocket message types (browser ↔ daemon)
export const ConsoleOutputMessageSchema = z.object({
  type: z.literal("output"),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
  timestamp: z.number().int(),
});

export const ConsoleCommandMessageSchema = z.object({
  type: z.literal("command"),
  text: z.string(),
});

export const ServerStatsMessageSchema = z.object({
  type: z.literal("stats"),
  cpuPct: z.number().min(0).max(100),
  memoryMb: z.number().min(0),
  memoryLimitMb: z.number().min(0),
  diskMb: z.number().min(0),
  diskLimitMb: z.number().min(0),
  timestamp: z.number().int(),
});

export const ConsoleErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

// Union for daemon → browser messages
export const DaemonToBrowserMessageSchema = z.discriminatedUnion("type", [
  ConsoleOutputMessageSchema,
  ServerStatsMessageSchema,
  ConsoleErrorMessageSchema,
]);

// Browser → daemon: only commands
export const BrowserToDaemonMessageSchema = ConsoleCommandMessageSchema;
```

### packages/shared/src/console/token.ts

```typescript
export const ConsoleTokenPayloadSchema = z.object({
  serverId: z.string().uuid(),
  userId: z.string().uuid(),
  scope: z.literal("console"),
  iat: z.number().int(),
  exp: z.number().int(),
});

export const ConsoleTokenResponseSchema = z.object({
  token: z.string(),
  daemonUrl: z.string().url(),
  serverId: z.string().uuid(),
  expiresIn: z.number().int(),
});
```

## Validation Rules

- **JWT lifetime**: max 300 seconds (5 minutes)
- **JWT scope**: must be `"console"`
- **JWT serverId**: must match the server in the WebSocket URL path
- **Console command**: max 4096 characters (prevent abuse)
- **Console output buffer**: last 1000 lines per session, ~64KB max
- **Browser output truncation**: 10,000 lines max in DOM
- **Stats frequency**: every 5 seconds
- **Reconnect backoff**: 1s, 2s, 4s, 8s, 16s, max 30s

## No Database Changes

R10 does not add any database tables. Console output and stats are in-memory only. The `servers` table (from R9) is used to validate server existence and status before issuing a console token.
