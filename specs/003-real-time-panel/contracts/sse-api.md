# SSE API Contract: Real-time Panel Updates

**Date**: 2026-09-09 | **Feature**: R17 Real-time Panel

## Endpoint

### `GET /api/sse`

Server-Sent Events stream. Authenticates via session cookie (R1). Pushes real-time events to the panel.

**Auth**: Session cookie (`better-auth` session, same as all admin endpoints). Returns 401 if not authenticated.

**Response**: `text/event-stream` (SSE)

**Connection lifecycle**:
- On connect: server sends a `connected` event with connection metadata
- Every 15s: server sends an SSE comment (heartbeat) to keep the connection alive
- On session expiry mid-stream: server closes the connection (client detects 401 and redirects to login)
- On server shutdown: connection drops, client auto-reconnects with backoff

## SSE Event Format

Each event uses the standard SSE wire format:

```
event: node.update
data: {"id":"...","status":"online","cpuUsage":42.5,...}

event: region.update
data: {"id":"...","name":"EU-West","nodeCount":3,"serverCount":0}

```

### Event Types

| Event | `event:` field | `data:` payload | Trigger |
|-------|---------------|----------------|---------|
| Node updated | `node.update` | `Node` (partial — id + changed fields) | Heartbeat processed, status/metrics changed |
| Node created | `node.create` | `Node` (full object) | Daemon registered via pairing |
| Node deleted | `node.delete` | `{ id: string }` | Admin deletes node |
| Region updated | `region.update` | `RegionWithCounts` or `{ id: string, deleted: true }` | Region created/deleted, counts changed |
| User updated | `user.update` | `User` (partial) or `{ id: string, deleted: true }` | User created/suspended/role changed |
| Connected | `connected` | `{ connectionId: string, userId: string }` | SSE connection established |

### Shared Schemas (packages/shared/src/sse/events.ts)

```typescript
import { z } from "zod";

export const SSEEventTypeSchema = z.enum([
  "node.update",
  "node.create",
  "node.delete",
  "region.update",
  "user.update",
  "connected",
]);
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

export const SSEEventSchema = z.object({
  type: SSEEventTypeSchema,
  payload: z.unknown(),
  timestamp: z.string().datetime(),
});
export type SSEEvent = z.infer<typeof SSEEventSchema>;
```

## Client-Side Hook Contract

### `useSSE(options)`

```typescript
interface UseSSEOptions {
  // Map event type to query keys to invalidate
  invalidations?: Partial<Record<SSEEventType, string[][]>>;
  // Map event type to direct handler
  handlers?: Partial<Record<SSEEventType, (payload: unknown) => void>>;
  // Called when connection state changes
  onConnectionStateChange?: (state: "connected" | "reconnecting" | "disconnected") => void;
}

interface UseSSEReturn {
  connectionState: "connecting" | "connected" | "reconnecting" | "disconnected";
  reconnect: () => void;
}
```

**Behavior**:
- Connects to `/api/sse` on mount using `EventSource`
- On event: dispatches to handler (if registered) and/or invalidates query keys
- On error: closes `EventSource`, sets state to `reconnecting`, retries with backoff
- On 401: sets state to `disconnected`, redirects to `/login`
- On unmount: closes `EventSource`, cleans up

### Reconnection Backoff

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5+ | 30s (max) |

On successful reconnect: fetch current state via HTTP (resync), reset backoff to 0, resume SSE.

## Degraded Mode

If the SSE connection cannot be established after 5 attempts (proxy/firewall blocking):
- Show "degraded mode" indicator
- Fall back to HTTP polling (30s interval) as a temporary measure
- Continue attempting SSE reconnection in the background
- When SSE reconnects, stop polling and hide the indicator
