# Data Model: Real-time Panel Updates

**Date**: 2026-09-09 | **Feature**: R17 Real-time Panel

## Overview

R17 introduces no new database tables. All data already exists in the PostgreSQL schema from R1 (users, sessions) and R4 (regions, nodes, node_credentials, pairing_tokens). R17 adds an SSE transport layer on top of existing data.

The only new "entities" are in-memory/runtime constructs: SSE events, SSE connections, and event subscriptions. These are not persisted in PostgreSQL.

## Runtime Entities

### SSE Event

An event pushed from the API to connected panel clients via SSE.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `SSEEventType` | Event type enum (see below) |
| `payload` | `unknown` (Zod-validated per type) | Event data — node, region, user, or audit object |
| `timestamp` | `string` (ISO 8601) | When the event was emitted |
| `id` | `string` (optional) | SSE event ID for Last-Event-ID resumption |

### SSE Connection

A long-lived HTTP connection between the panel and the API.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique connection identifier |
| `userId` | `string` (UUID) | Authenticated user from session cookie |
| `role` | `"admin" \| "user"` | User role (determines which events they receive) |
| `connectedAt` | `Date` | When the connection was established |
| `lastHeartbeat` | `Date` | Last SSE heartbeat sent to keep the connection alive |

### Event Subscription (client-side)

A panel-side registration mapping an event type to a handler.

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | `SSEEventType` | Event type to listen for |
| `handler` | `(payload: unknown) => void` | Callback invoked when the event arrives |
| `queryKeys` | `string[][]` (optional) | TanStack Query keys to invalidate on this event |

## Event Types

| Event Type | Trigger | Payload | Query Keys Invalidated |
|------------|---------|---------|----------------------|
| `node.update` | Heartbeat processed, status/metrics changed | `Node` (partial — id + changed fields) | `["node", nodeId]`, `["nodes"]` |
| `node.create` | Node registered via pairing | `Node` (full) | `["nodes"]` |
| `node.delete` | Node deleted by admin | `{ id: string }` | `["nodes"]`, `["node", id]` |
| `region.update` | Region created/deleted, node/server count changed | `RegionWithCounts` or `{ id: string }` | `["regions"]` |
| `user.update` | User created/suspended/role changed | `User` (partial) or `{ id: string }` | `["users"]`, `["user", id]` |
| `audit.create` | Audit log entry created (future R5) | `AuditEntry` | `["audit"]` |

## State Transitions

### SSE Connection State

```
connecting → connected → reconnecting → connected (reconnect success)
            ↓                           ↓
            disconnected (session expired → redirect to login)
            disconnected (server shutdown → reconnect with backoff)
```

### Node Status (triggered by existing R4 heartbeat service, now emits SSE)

```
unknown → online (heartbeat received → emit node.update)
online → offline (timeout sweep → emit node.update)
offline → online (heartbeat received → emit node.update)
```

## Integration Points

### Existing services that emit events

| Service | File | Events Emitted |
|---------|------|----------------|
| `processHeartbeat` | `apps/api/src/services/heartbeat.service.ts` | `node.update` |
| `sweepOfflineNodes` | `apps/api/src/services/heartbeat.service.ts` | `node.update` (per node marked offline) |
| `consumePairingToken` | `apps/api/src/services/pairing.service.ts` | `node.create` |
| `deleteNode` | `apps/api/src/services/node.service.ts` | `node.delete` |
| `createRegion` | `apps/api/src/services/region.service.ts` | `region.update` |
| `deleteRegion` | `apps/api/src/services/region.service.ts` | `region.update` |
| User CRUD | `apps/api/src/routes/users.ts` | `user.update` |

### Existing hooks that receive events (retrofitted)

| Hook | File | Change |
|------|------|--------|
| `useNodes` | `apps/panel/src/hooks/useNodes.ts` | Remove `refetchInterval: 15000`, subscribe to `node.update`, `node.create`, `node.delete` |
| `useNode` | `apps/panel/src/hooks/useNodes.ts` | Remove `refetchInterval: 15000`, subscribe to `node.update` for specific nodeId |
| `useRegions` | `apps/panel/src/hooks/useRegions.ts` | Subscribe to `region.update` |
| User queries | `apps/panel/src/router.tsx` | Subscribe to `user.update` |
