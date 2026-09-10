# Research: Allocations

## R1: Pterodactyl Allocation Model

**Decision**: Follow Pterodactyl's allocation model with Sigil's naming conventions.

**Rationale**: Pterodactyl's allocation system is proven at scale. An allocation is an IP:port pair on a node. Nodes have a pool of allocations. Servers are assigned one or more allocations (primary + secondary). When a server is deleted, allocations return to the pool.

**Key differences from Pterodactyl**:
- Pterodactyl stores allocations per node with an `ip` and `port` column. We do the same but add `protocol` (tcp/udp) as a first-class field instead of Pterodactyl's separate handling.
- Pterodactyl has a `server_id` nullable foreign key on allocations. We do the same for assignment tracking.
- Pterodactyl uses a separate `allocations` table per node. We use a single `allocations` table with a `node_id` foreign key.
- Pterodactyl's "primary IP" is implicit (the first IP added). We make it explicit with a `primary_ip` field on the node (or a separate flag on allocations).

**Alternatives considered**:
- Port ranges as a single entity (start/end stored as a range, expanded on demand) — rejected because it complicates assignment (you assign individual ports, not ranges) and uniqueness checking.
- Allocations as part of the servers table — rejected because allocations exist before servers and can outlive them.

## R2: IP Address Validation

**Decision**: Validate IP format using a regex for IPv4 and IPv6. Do not verify the IP is actually bound to the node.

**Rationale**: The panel cannot reliably verify whether an IP is bound to a node's interface (the node may have IPs not visible from the panel's network). The operator is responsible for providing valid IPs. Format validation catches typos.

**IPv4 regex**: `^(\d{1,3}\.){3}\d{1,3}$` with each octet 0-255.
**IPv6**: Accept any string that parses as IPv6 (simplified — use a library or `new URL()` trick).

**Alternatives considered**:
- Use `net.isIP()` from Node.js — good for the API side, but we need the same validation in the browser (Zod schema). Use a Zod refinement that checks format.
- Verify IP is bound to node — rejected (network topology, the panel may not have network access to the node's interfaces).

## R3: Port Range Expansion

**Decision**: When an admin adds a port range (e.g., `25565-25575`), the API expands it into individual allocation rows (one per port). Each row is a separate IP:port:protocol triple.

**Rationale**: Individual rows simplify:
- Uniqueness checking (unique constraint on node_id + ip + port + protocol)
- Assignment (assign individual ports, not ranges)
- Status tracking (each port has its own available/assigned status)
- Removal (remove individual ports)

**Performance**: Adding 100 ports creates 100 rows. This is a single bulk insert, well under 5 seconds. Adding 65535 ports (full range) would create 65535 rows — the UI shows a confirmation warning for large ranges.

**Alternatives considered**:
- Store ranges as a single row with start/end — rejected (complicates assignment, uniqueness, and partial removal).

## R4: Primary IP Designation

**Decision**: Add a `primary_ip` nullable text column to the `nodes` table. When set, auto-assignment prefers allocations on that IP. When null, auto-assignment uses any available allocation.

**Rationale**: The primary IP is a node-level setting, not an allocation-level setting. It's the default IP for auto-assignment. The admin can change it without affecting existing allocations.

**Alternatives considered**:
- A `is_primary` boolean on allocations — rejected (only one primary per node, a boolean on allocations would need extra constraints).
- No primary IP (always use first available) — rejected (the admin may want auto-assignment to prefer a specific IP, e.g., the public IP vs internal IP).

## R5: SSE Events for Allocations

**Decision**: Add three new SSE event types:
- `allocation.create` — payload: the created allocation (or a summary if bulk-created)
- `allocation.update` — payload: the updated allocation (status change, assignment)
- `allocation.delete` — payload: `{ id, deleted: true }`

**Rationale**: Follows the existing pattern (`node.create`, `node.update`, `node.delete`, `template.create`, etc.). The panel's `useSSE` hook already handles these event types generically.

**For bulk creation** (adding a port range): emit a single `allocation.create` event with a summary payload `{ nodeId, count, ip }` rather than one event per port. The panel refetches the allocation list on this event. This avoids flooding the SSE channel with 100 events for a 100-port range.

**Alternatives considered**:
- One event per allocation on bulk create — rejected (SSE flood for large ranges).
- No SSE, just refetch after action — rejected (violates Constitution Principle VI: no polling).

## R6: Server Deletion Integration

**Decision**: When a server is deleted (R9), the API releases all allocations assigned to that server by setting `server_id = NULL` and `status = 'available'`. This happens in the same transaction as server deletion.

**Rationale**: Atomicity — if server deletion fails, allocations are not released. If it succeeds, allocations are immediately available.

**For R7 testing**: Since R9 is not yet implemented, we test the release logic via the allocation service's `releaseAllocations(serverId)` method directly. R9 will call this method during server deletion.

**Alternatives considered**:
- Database-level ON DELETE SET NULL on the `server_id` foreign key — rejected because we also need to set `status = 'available'`, not just null the FK. A trigger could do this, but we prefer application-level logic for clarity.
- Separate cleanup job — rejected (delays availability, adds complexity).

## R7: Node Deletion Protection

**Decision**: Node deletion is blocked if the node has servers with assigned allocations. The API checks for assigned allocations before deleting a node and returns a 409 Conflict if any exist.

**Rationale**: Prevents orphaned allocations and ensures servers are properly cleaned up before node removal.

**Note**: R4 (Node Management) already exists. R7 adds this check to the existing node deletion endpoint.

## R8: Allocation Uniqueness

**Decision**: Unique constraint on `(node_id, ip, port, protocol)`. Adding a duplicate is a silent no-op (idempotent) — the API checks for existing allocations and only inserts non-overlapping ones.

**Rationale**: Idempotent adds prevent errors when two admins add overlapping ranges simultaneously. The API returns the count of newly created allocations.

**Implementation**: Use `INSERT ... ON CONFLICT DO NOTHING` for bulk inserts. Count the actual rows inserted vs requested to report how many were new.

## R9: Filtering and Search

**Decision**: API supports query params: `status` (available/assigned), `ip` (filter by IP), `port` (search by port number). The panel applies these client-side for small lists and server-side for large lists.

**Rationale**: For 1000+ allocations, client-side filtering is slow. Server-side filtering with indexed queries is fast. The panel uses TanStack Query with these params.

**Index**: Add an index on `(node_id, status)` for fast status filtering and `(node_id, ip)` for IP filtering.
