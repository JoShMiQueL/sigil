# Research: Server Lifecycle (R9)

## 1. Server record ownership model

**Decision**: The panel owns a `servers` table with id, name, nodeId, templateId, allocationId, status, config (JSONB), createdAt, updatedAt. The panel creates the server record BEFORE dispatching to the daemon. The daemon receives the full `ServerConfiguration` (already defined in R6) and creates the container.

**Rationale**: The current `servers.ts` route is a stateless proxy — it passes requests straight to the daemon with no DB record. This means the panel has no knowledge of which servers exist, cannot list them, cannot track their state, and cannot integrate with allocations. A panel-owned record is required for R7 integration (allocation assignment), R17 (real-time updates), and future features (R10 console, R11 files).

**Alternatives considered**:
- Keep the daemon as the source of truth and query it for the server list. Rejected: the panel needs to join servers with nodes, templates, and allocations (all panel-owned data). The daemon cannot do relational queries.
- Store server metadata in Redis only. Rejected: Redis is a cache, not a persistent store. Server records must survive restarts.

## 2. State machine design

**Decision**: The server status field uses a panel-side state machine that mirrors the daemon's container states but adds panel-specific states:

```
offline → starting → running → stopping → stopped
                                   ↓
                                crashed (terminal)
creating → creation_failed (terminal)
```

- `offline`: server record exists, container not yet created or has been removed
- `starting`: panel sent start command, waiting for daemon confirmation
- `running`: daemon reports container is running
- `stopping`: panel sent stop command, waiting for daemon confirmation
- `stopped`: daemon reports container is stopped
- `crashed`: daemon reports container exited unexpectedly (non-zero exit code)
- `creation_failed`: daemon rejected container creation (invalid config, image pull failure)

Transitions are driven by:
1. Admin actions (start/stop/restart) → panel sets intermediate state, sends command to daemon
2. Daemon state reports → panel updates state based on `StateChangeEvent`
3. Daemon crash detection → daemon reports `crashed` state

**Rationale**: The daemon already has `ContainerStateSchema` (creating, running, stopped, crashed, removing, missing). The panel needs additional states (`offline`, `creation_failed`) that represent panel-side knowledge before/after the container lifecycle.

**Alternatives considered**:
- Use the daemon's states directly. Rejected: the daemon doesn't know about `offline` (container doesn't exist yet) or `creation_failed` (creation is a panel-initiated flow).
- Store state in Redis only. Rejected: state must be persistent and queryable.

## 3. Server creation flow

**Decision**: The creation flow is:
1. Admin submits create request (name, nodeId, templateId, variables)
2. Panel validates: node exists, daemon is reachable, template is active, node has available allocations
3. Panel auto-assigns a primary allocation (R7 `autoAssignAllocation`)
4. Panel builds `ServerConfiguration` from the template (image, startup command, environment, port mappings, resource limits, volume path)
5. Panel creates a server record with status `offline`
6. Panel sends `ServerConfiguration` to the daemon's `createServer` endpoint
7. Daemon creates the container (does not start it)
8. Panel updates server status to `offline` (container created, not running)
9. Panel emits `server.create` SSE event

**Rationale**: The panel must own the record before the daemon creates the container, so that if the daemon is slow or fails, the panel still has a record of the intent. The `creation_failed` state is set if the daemon rejects the creation.

**Alternatives considered**:
- Create the record only after the daemon succeeds. Rejected: if the daemon is slow, the admin has no feedback. If the daemon fails, the allocation was assigned but no record exists to track it.
- Start the container immediately on creation. Rejected: the spec says "creates (but not start)". Starting is a separate power action.

## 4. Server deletion flow

**Decision**: The deletion flow is:
1. Admin confirms deletion
2. Panel checks if the daemon is reachable
3. Panel sends `removeServer` to the daemon (removes container + volume)
4. Panel releases all allocations assigned to the server (R7 `releaseAllocations`)
5. Panel deletes the server record
6. Panel emits `server.delete` SSE event

If the daemon is unreachable, the deletion fails with a `NODE_UNREACHABLE` error. The admin can retry when the daemon is back. This is the safe default — we do not want orphaned containers.

**Rationale**: The daemon must clean up the container and volume before the record is deleted, otherwise we have orphaned containers. If the daemon is offline, we cannot guarantee cleanup.

**Alternatives considered**:
- Delete the record and mark the daemon for deferred cleanup. Rejected: complex reconciliation logic, risk of orphaned containers, and the spec says "deletion fails when daemon is offline".
- Force-delete the record and let the admin manually clean up. Rejected: violates the "no orphaned containers" principle.

## 5. Power action flow

**Decision**: Power actions (start/stop/restart) follow this pattern:
1. Panel validates the server exists and the current state allows the action
2. Panel sets the intermediate state (`starting`/`stopping`)
3. Panel sends the command to the daemon
4. Daemon executes and returns the new container state
5. Panel updates the server status based on the daemon's response
6. Panel emits `server.update` SSE event

State transition validation:
- `start`: allowed from `offline`, `stopped`, `crashed`, `creation_failed`
- `stop`: allowed from `running`, `starting` (queue or reject — see below)
- `restart`: allowed from `running`, `stopped`, `crashed`

For `stop` during `starting`: the panel rejects with a 409 "server is starting, wait for it to finish". This is simpler than queueing and avoids race conditions.

**Rationale**: The panel must validate state transitions before sending to the daemon to prevent invalid operations (e.g., starting a running server). The daemon also validates, but the panel should fail fast.

**Alternatives considered**:
- Queue stop during start. Rejected: adds complexity, the daemon may not support it, and the admin can just wait and retry.
- Send all actions to the daemon and let it decide. Rejected: the panel needs to update its own state machine, and the daemon's error messages may not be user-friendly.

## 6. Daemon state report handling

**Decision**: The existing `server-state.ts` route receives `StateChangeEvent` from the daemon. R9 updates it to:
1. Look up the server by `serverId`
2. If the server doesn't exist (deleted), ignore the report (FR-017)
3. Update the server's status field based on `newState`
4. Emit `server.state` SSE event to connected browsers

The daemon's container states map to panel states:
- `creating` → `starting` (panel initiated a start)
- `running` → `running`
- `stopped` → `stopped`
- `crashed` → `crashed`
- `removing` → `offline` (after deletion, the record is gone)
- `missing` → `crashed` (container disappeared unexpectedly)

**Rationale**: The daemon reports container state changes asynchronously. The panel must persist these and notify the UI. Ignoring reports for non-existent servers prevents errors when a server was deleted while a state report was in flight.

**Alternatives considered**:
- Store state reports in a separate table. Rejected: the server record's `status` field is sufficient.
- Reconcile state on every report by querying the daemon. Rejected: the daemon already tells us the state; no need to round-trip.

## 7. SSE events

**Decision**: Three new SSE event types:
- `server.create`: payload `{ serverId, nodeId, name, status }` — emitted on server creation
- `server.update`: payload `{ serverId, nodeId, status, previousStatus }` — emitted on state changes (power actions, daemon reports)
- `server.delete`: payload `{ serverId, nodeId, deleted: true }` — emitted on deletion

These are added to `packages/shared/src/sse/events.ts` alongside the existing `server.state` event (which is the raw daemon report, used internally).

**Rationale**: The panel needs to notify browsers of server lifecycle changes in real-time. The existing `server.state` event is the raw daemon report; the new events are panel-level lifecycle events that browsers should listen to.

**Alternatives considered**:
- Reuse `server.state` for everything. Rejected: `server.state` is the raw daemon event; browsers need panel-level events (create/delete are not daemon events).
- Use a single `server.change` event. Rejected: different event types allow targeted invalidation (create → add to list, delete → remove from list, update → refresh detail).

## 8. Server name uniqueness

**Decision**: Server names must be unique per node (not globally). Two nodes can have a server named "My Server".

**Rationale**: Server names are user-facing identifiers. Globally unique names would be restrictive (e.g., two Minecraft servers on different nodes can't both be "Survival"). Per-node uniqueness is enforced by a unique constraint on `(nodeId, name)`.

**Alternatives considered**:
- Globally unique names. Rejected: too restrictive for multi-node deployments.
- No uniqueness constraint. Rejected: confusing for users to have two servers with the same name on the same node.

## 9. Integration with existing R6 E2E tests

**Decision**: The existing `server-lifecycle.spec.ts` E2E test (R6) tests the daemon proxy directly. R9 refactors the API to be panel-owned, so the E2E test must be updated to verify the panel-owned flow (create via panel UI, verify server record in DB, verify allocation assigned, verify state transitions via SSE).

The existing R6 test creates servers via API calls with `node_id` query param. R9 changes the API to use the server record's `nodeId` field, so the `node_id` query param is no longer needed for most endpoints.

**Rationale**: The R6 test was a placeholder for the daemon proxy. R9 replaces it with the real panel-owned flow. The test must verify the full lifecycle: create → start → stop → restart → delete, with allocation assignment/release and SSE updates.

**Alternatives considered**:
- Keep the R6 test and add a separate R9 test. Rejected: the R6 test would break when the API changes. Better to update it.
- Remove the R6 test entirely. Rejected: the test covers important lifecycle behavior that R9 builds on.
