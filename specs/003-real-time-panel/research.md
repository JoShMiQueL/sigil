# Research: Real-time Panel Updates

**Date**: 2026-09-09 | **Feature**: R17 Real-time Panel

## R1: SSE Implementation in Hono

**Decision**: Use Hono's built-in `streamSSE` from `hono/streaming`.

**Rationale**: Hono has first-class SSE support via `streamSSE(async (stream) => { ... })`. It handles the SSE wire format (`event:`, `data:`, `id:`, heartbeat comments), content type (`text/event-stream`), and connection lifecycle. No additional library needed.

**Alternatives considered**:
- Raw `Response` with `ReadableStream` — more control but reinvents SSE framing. Rejected: `streamSSE` already does this correctly.
- `@hono/sse` middleware — doesn't exist as a separate package. `streamSSE` is built into Hono core.

## R2: Client-side SSE — EventSource vs fetch + ReadableStream

**Decision**: Use the native `EventSource` API.

**Rationale**: `EventSource` is universally supported in all modern browsers, handles auto-reconnect natively (though we add our own backoff on top for more control), and provides a clean event-based API (`addEventListener('node.update', handler)`). It automatically sets `Accept: text/event-stream` and manages the connection lifecycle.

**Alternatives considered**:
- `fetch` + `ReadableStream` — more control over headers and retry, but requires manual SSE frame parsing. Rejected: unnecessary complexity for server→client one-way stream.
- `react-sse` / `use-sse` npm packages — add dependencies for something the browser does natively. Rejected: not worth the dependency.

**Note on auto-reconnect**: `EventSource` has built-in reconnection, but it reconnects immediately on drop, which can hammer the server. We close the native `EventSource` on error and manage our own reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s). This gives us control over the retry cadence and lets us show a "reconnecting" indicator.

## R3: Event Multiplexing — Single Connection vs Multiple Connections

**Decision**: Single SSE connection per client, multiplexing all event types.

**Rationale**: One connection per client means one auth check, one Redis pub/sub subscription, one reconnection to manage. Event types are distinguished by the SSE `event:` field (e.g., `event: node.update`, `event: region.update`). The client dispatches events to the correct handler based on the event name.

**Alternatives considered**:
- One connection per event type (node, region, user) — 3x connections, 3x auth, 3x reconnect logic. Rejected: wasteful and complex.
- WebSocket with multiplexing — overkill for one-way server→client. Rejected per Constitution Principle VI.

## R4: Multi-Process Event Fanout — Redis Pub/Sub

**Decision**: Use Redis pub/sub for event fanout across API instances.

**Rationale**: In production, the API may run multiple instances behind a load balancer. An SSE client connected to instance A won't receive events emitted by instance B. Redis pub/sub solves this: when any API instance emits an event, it publishes to a Redis channel. All API instances subscribe and forward to their connected SSE clients.

**Alternatives considered**:
- Sticky sessions at the load balancer — works but doesn't solve the multi-instance problem (instance B still needs to forward to its clients). Rejected: incomplete solution.
- PostgreSQL LISTEN/NOTIFY — works but Redis is already in the stack and pub/sub is its strength. Rejected: adds complexity for no benefit.
- In-memory only (single process) — fine for development, breaks in production. Rejected: not production-ready.

**Development mode**: When Redis is available (dev Docker compose), pub/sub is used. When running tests with Testcontainers, Redis is available. The SSE service falls back to in-memory fanout if Redis is not configured (single-process dev mode without Docker).

## R5: TanStack Query Integration — Event → Query Invalidation

**Decision**: SSE events invalidate TanStack Query keys. The `useSSE` hook accepts a mapping from event type to query keys to invalidate.

**Rationale**: Existing R1/R4 components use TanStack Query for data fetching. Instead of rewriting their data layer, SSE events trigger `queryClient.invalidateQueries({ queryKey: [...] })`. This causes TanStack Query to refetch via HTTP (the initial load mechanism) and update the UI. This is simpler than injecting SSE payloads directly into the query cache, and it ensures the HTTP fetch is always the source of truth.

**Alternatives considered**:
- Direct cache injection (`queryClient.setQueryData`) — faster (no refetch) but risks cache drift if the SSE payload is stale or partial. Rejected for now: invalidation + refetch is simpler and more reliable. Can optimize later with `setQueryData` for specific high-frequency events (node metrics).
- Replace TanStack Query with a custom SSE-based store — massive refactor of R1/R4. Rejected: invalidation keeps existing code working.

**Optimization for node metrics**: For high-frequency events like `node.update` (metrics), we use `queryClient.setQueryData` to update the cache directly without a refetch. This avoids a refetch storm when 100 nodes send heartbeats. For low-frequency events (create, delete, region changes), we use `invalidateQueries` to refetch.

## R6: Debounce Strategy for High-Frequency Events

**Decision**: Debounce node metric pushes to at most 1 event per second per node.

**Rationale**: If 100 nodes send heartbeats within 1 second, the API should not push 100 SSE events to each client. Instead, the SSE service batches per-node updates and flushes at most once per second per node. This is implemented in `sse.service.ts` with a per-node debounce timer.

**Alternatives considered**:
- Throttle at the client — wastes bandwidth sending events the client will drop. Rejected: debounce at the source.
- No debounce — risks flooding the client. Rejected: violates FR-017.

## R7: Session Expiry Detection on SSE

**Decision**: The SSE endpoint checks the session cookie on connection and on each heartbeat. If the session is invalid, it returns 401 (on initial connect) or closes the stream with a 401 event (mid-stream). The client detects this and redirects to login.

**Rationale**: SSE is a long-lived connection. The session may expire while the connection is open. The API sends periodic SSE comments (heartbeat) every 15s. If the session check fails on a heartbeat, the stream is closed. The client's `EventSource` fires an `onerror`, the hook checks a flag, and redirects to login instead of reconnecting.

**Alternatives considered**:
- JWT in the SSE URL query param — works but puts a token in the URL (logged in access logs). Rejected: session cookie is more secure.
- No mid-stream session check — the connection stays open until the server restarts. Rejected: security hole.
