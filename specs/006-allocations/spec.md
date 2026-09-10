# Feature Specification: Allocations

**Feature Branch**: `006-allocations`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "R7 Allocations — IP/port management per node, assignment to servers"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin manages IP allocations per node (Priority: P1)

An admin configures which IP addresses a node can bind game servers to, and which port ranges are available on each IP. The admin can add individual IPs or ranges of ports to a node's allocation pool, view all available and assigned allocations, and remove unused allocations. This is the foundation — without allocations configured on a node, no server can be created on that node.

**Why this priority**: Allocations are a prerequisite for server creation (R9). Without a pool of IP:port pairs on a node, the panel cannot assign network endpoints to game servers. This is the first thing an admin must do after registering a node.

**Independent Test**: Can be tested by adding an IP with a port range to a node via the panel, verifying the allocations appear in the list, then removing an unused allocation and verifying it disappears.

**Acceptance Scenarios**:

1. **Given** a registered node exists, **When** the admin adds an IP address (e.g., `203.0.113.10`) with a port range (e.g., `25565-25575`), **Then** the node's allocation pool now contains 11 allocations (one per port in the range), each marked as "available".
2. **Given** a node has allocations, **When** the admin views the allocations page for that node, **Then** they see a list of all allocations with their IP, port, status (available/assigned), and the server ID if assigned.
3. **Given** a node has an available allocation, **When** the admin removes it, **Then** the allocation is deleted from the pool and no longer appears in the list.
4. **Given** a node has an assigned allocation, **When** the admin tries to remove it, **Then** the removal is rejected with a clear error message explaining the allocation is in use by a server.
5. **Given** the admin adds an IP that already exists on the node, **When** they provide a port range that overlaps with existing allocations, **Then** only the non-overlapping ports are created, and the overlapping ones are silently skipped (idempotent add).
6. **Given** the admin adds a single port instead of a range, **When** they submit the form, **Then** exactly one allocation is created for that port.

---

### User Story 2 - Admin assigns allocations to a server (Priority: P2)

When creating or editing a server, the admin selects one or more allocations from the node's available pool. The primary allocation is the main port the game server listens on; additional allocations are for secondary services (RCON, query, voice). Assigned allocations are marked as "assigned" and cannot be assigned to another server. When a server is deleted, its allocations return to the available pool.

**Why this priority**: This is the consumer of the allocation pool. It connects R7 to R9 (server lifecycle). Without assignment, allocations are just a list of numbers with no purpose.

**Independent Test**: Can be tested by creating a server with a primary allocation, verifying the allocation is marked as "assigned", then deleting the server and verifying the allocation returns to "available".

**Acceptance Scenarios**:

1. **Given** a node has available allocations and a server is being created, **When** the admin selects a primary allocation, **Then** that allocation is marked as "assigned" to the new server and removed from the available pool.
2. **Given** a server exists with a primary allocation, **When** the admin adds a secondary allocation to the server, **Then** the secondary allocation is also marked as "assigned" to that server.
3. **Given** a server has allocations, **When** the server is deleted, **Then** all allocations assigned to that server return to "available" status.
4. **Given** an allocation is already assigned to server A, **When** the admin tries to assign it to server B, **Then** the assignment is rejected with a clear error.
5. **Given** a server is being created on a node with no available allocations, **When** the admin tries to select an allocation, **Then** the UI shows "no allocations available" and prevents server creation until allocations are added.

---

### User Story 3 - Admin filters and searches allocations (Priority: P3)

The admin can filter the allocations list by status (available/assigned), by IP address, and search by port number. This helps manage large allocation pools efficiently. The panel shows a summary of total, available, and assigned allocations per node.

**Why this priority**: Nodes can have hundreds or thousands of allocations. Without filtering, finding a specific allocation or assessing pool health is impractical.

**Independent Test**: Can be tested by adding allocations with different IPs and ports, then filtering by status and searching by port, and verifying the correct subset is displayed.

**Acceptance Scenarios**:

1. **Given** a node has both available and assigned allocations, **When** the admin filters by "available", **Then** only available allocations are shown.
2. **Given** a node has allocations on multiple IPs, **When** the admin filters by a specific IP, **Then** only allocations on that IP are shown.
3. **Given** a node has many allocations, **When** the admin searches for a specific port number, **Then** only allocations matching that port are shown.
4. **Given** a node has allocations, **When** the admin views the node's allocation summary, **Then** they see the total count, available count, and assigned count.

---

### User Story 4 - Server creation auto-assigns a primary allocation (Priority: P4)

When creating a server, the admin can optionally let the panel auto-assign a primary allocation from the node's available pool. The panel picks the first available allocation on the node's primary IP (or any available IP if no primary is set). This reduces friction for quick server deploys.

**Why this priority**: Manual allocation selection is tedious when deploying many servers. Auto-assignment is a convenience layer on top of the manual flow (US2).

**Independent Test**: Can be tested by creating a server with auto-assign enabled, verifying an available allocation was selected and marked as assigned, and verifying the server's port mapping reflects the assigned allocation.

**Acceptance Scenarios**:

1. **Given** a node has available allocations, **When** the admin creates a server with "auto-assign primary" enabled, **Then** the panel selects an available allocation and assigns it as the server's primary.
2. **Given** a node has no available allocations, **When** the admin tries to create a server with auto-assign, **Then** the creation is rejected with a clear error explaining no allocations are available.
3. **Given** auto-assign selected allocation A, **When** the server is created, **Then** the server's configuration includes a port mapping from the allocation's port to the game server's default container port.

---

### Edge Cases

- What happens when an admin adds a port range that exceeds the valid port bounds (e.g., 70000)? The range is rejected with a validation error.
- What happens when two admins add allocations to the same node simultaneously? The second request for overlapping ports is silently skipped (idempotent), non-overlapping ports are created.
- What happens when a node is deleted? All allocations on that node are deleted. Assigned allocations block node deletion until the servers are removed or migrated.
- What happens when the admin adds a very large port range (e.g., 1-65535)? The range is accepted but the UI shows a confirmation warning about the number of allocations that will be created.
- What happens when a server's primary allocation is unassigned while the server is running? The allocation remains assigned until the server is stopped and deleted; unassigning a running server's allocation is rejected.
- What happens when the panel restarts? All allocation states are persisted in the database and restored on startup. No in-memory state is lost.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The panel MUST allow an admin to add an IP address to a node's allocation pool with either a single port or a port range (start-end inclusive).
- **FR-002**: The panel MUST validate that ports are in the range 1-65535 and that the start of a range is less than or equal to the end.
- **FR-003**: The panel MUST prevent duplicate allocations (same IP + port + protocol) on the same node. Adding an existing allocation is a silent no-op (idempotent).
- **FR-004**: The panel MUST track the status of each allocation: "available" or "assigned".
- **FR-005**: The panel MUST record which server an allocation is assigned to (nullable server ID reference).
- **FR-006**: The panel MUST prevent removal of an allocation that is currently assigned to a server.
- **FR-007**: The panel MUST return all allocations to "available" when a server is deleted.
- **FR-008**: The panel MUST prevent assigning an already-assigned allocation to a second server.
- **FR-009**: The panel MUST allow the admin to filter allocations by status (available/assigned) and by IP address.
- **FR-010**: The panel MUST allow the admin to search allocations by port number.
- **FR-011**: The panel MUST display a per-node allocation summary: total, available, and assigned counts.
- **FR-012**: The panel MUST support auto-assignment of a primary allocation from the available pool during server creation.
- **FR-013**: The panel MUST reject server creation if no allocations are available on the node and auto-assign is requested.
- **FR-014**: The panel MUST support a "primary IP" designation per node — the IP preferred for auto-assignment.
- **FR-015**: The panel MUST enforce that allocation operations are scoped to a specific node (no cross-node allocations).
- **FR-016**: The panel MUST support both TCP and UDP protocols per allocation (default: TCP).
- **FR-017**: The panel MUST prevent node deletion if the node has servers with assigned allocations.
- **FR-018**: All allocation changes (add, remove, assign, unassign) MUST be reflected in real-time via SSE (no polling).
- **FR-019**: The panel MUST validate that the IP address is a valid IPv4 or IPv6 address.
- **FR-020**: The panel MUST log allocation changes (add, remove, assign, unassign) to the audit log (R5, when implemented).

### Key Entities *(include if feature involves data)*

- **Allocation**: An IP:port:protocol triple on a specific node, with a status (available/assigned) and an optional reference to the server it is assigned to. Each allocation belongs to exactly one node. The combination of (node, IP, port, protocol) is unique.
- **Node Primary IP**: A designated IP address on a node that is preferred for auto-assignment. Each node has at most one primary IP. If no primary IP is set, auto-assignment uses any available allocation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can add a range of 100 ports to a node's allocation pool in under 5 seconds.
- **SC-002**: An admin can find a specific allocation by port number search in under 2 seconds.
- **SC-003**: The panel correctly shows available vs assigned counts for a node with 1000+ allocations without perceptible lag.
- **SC-004**: Server creation with auto-assign completes in under 3 seconds, including allocation assignment.
- **SC-005**: Deleting a server returns all its allocations to the available pool within 1 second.
- **SC-006**: Allocation changes appear in the panel UI via SSE within 2 seconds of the API call.

## Assumptions

- Nodes are already registered via R4 (Node Management). R7 does not implement node registration.
- Server creation (R9) is not yet implemented. R7 provides the allocation pool and assignment API; R9 will consume it. For R7 testing, assignments can be tested via API calls directly.
- The panel is the sole owner of allocation data. The daemon does not manage allocations — it receives port mappings as part of server configuration (R6).
- Allocations are IP:port:protocol triples. The panel does not verify whether the IP is actually bound to the node's network interface (that is the operator's responsibility).
- IPv4 and IPv6 are both supported. The panel stores the IP as a string and validates format only.
- A node can have multiple IPs. The operator is responsible for ensuring the IPs are valid for the node.
- The "primary IP" is a convenience for auto-assignment. It does not affect manual assignment.
- Audit logging (R5) is not yet implemented. R7 logs allocation changes to the console and will integrate with R5 when available.
- Real-time updates use the existing SSE infrastructure (R17). No new SSE endpoints are needed beyond the allocation-specific event stream.
