# Feature Specification: Server Lifecycle

**Feature Branch**: `007-server-lifecycle`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "R9 Server Lifecycle — Create/start/stop/restart/delete servers. In: server CRUD, power actions, state machine. Deferred: console, files, backups."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin creates a server (Priority: P1)

An admin selects a node, picks a template, names the server, and the panel creates the server record, auto-assigns a primary allocation, and instructs the daemon to create (but not start) the container. The server appears in the servers list with status "creating" then "offline".

**Why this priority**: Without server creation, none of the other lifecycle actions are possible. This is the MVP entry point — the panel must be able to create a server record and have the daemon provision its container.

**Independent Test**: Admin creates a server via the panel, verify it appears in the servers list with status "offline", verify a primary allocation was auto-assigned, verify the daemon created the container.

**Acceptance Scenarios**:

1. **Given** a node with available allocations and an activated template, **When** the admin creates a server with a name and template, **Then** the server appears in the list with status "offline" and a primary allocation is assigned
2. **Given** a node with no available allocations, **When** the admin tries to create a server, **Then** the creation fails with a clear "no available allocations" error
3. **Given** a node that is offline (daemon not responding), **When** the admin tries to create a server, **Then** the creation fails with a "node unreachable" error
4. **Given** an invalid template configuration, **When** the admin creates a server, **Then** the daemon rejects the container creation and the server is marked "creation_failed"

---

### User Story 2 - Admin controls server power state (Priority: P2)

An admin can start, stop, and restart a server. The panel sends the power command to the daemon, the daemon transitions the container state, and reports the new state back to the panel. The servers list and server detail page update in real-time via SSE.

**Why this priority**: Power control is the core lifecycle operation after creation. Users need to start/stop/restart servers to manage their game instances.

**Independent Test**: Admin creates a server, starts it, verifies status changes to "running", stops it, verifies status changes to "stopped", restarts it, verifies it returns to "running".

**Acceptance Scenarios**:

1. **Given** a server in "offline" state, **When** the admin clicks "Start", **Then** the server transitions to "starting" then "running"
2. **Given** a server in "running" state, **When** the admin clicks "Stop", **Then** the server transitions to "stopping" then "stopped"
3. **Given** a server in "running" state, **When** the admin clicks "Restart", **Then** the server transitions to "stopping" then "starting" then "running"
4. **Given** a server in "starting" state, **When** the admin clicks "Stop", **Then** the stop command is queued or rejected with a clear message
5. **Given** a server whose daemon is offline, **When** the admin tries a power action, **Then** the action fails with a "node unreachable" error

---

### User Story 3 - Admin deletes a server (Priority: P3)

An admin can delete a server. The panel instructs the daemon to remove the container and volume, releases all allocations assigned to the server, deletes the server record, and emits an SSE event. The server disappears from the list in real-time.

**Why this priority**: Deletion completes the lifecycle. It must release allocations (R7 integration) and clean up the container/volume on the daemon.

**Independent Test**: Admin creates a server, deletes it, verify the container and volume are removed on the daemon, verify allocations are released, verify the server disappears from the list.

**Acceptance Scenarios**:

1. **Given** a server in any state, **When** the admin confirms deletion, **Then** the daemon removes the container and volume, allocations are released, and the server record is deleted
2. **Given** a server whose daemon is offline, **When** the admin tries to delete it, **Then** the server record is deleted but the daemon cleanup is deferred (or the deletion fails — see Assumptions)
3. **Given** a server with assigned allocations, **When** the server is deleted, **Then** all allocations return to "available" status

---

### User Story 4 - Server list and detail view (Priority: P4)

An admin can view a list of all servers across all nodes, filter by node/status, and click a server to see its detail page with status, node, template, allocation, and power controls. The list and detail page update in real-time via SSE when server states change.

**Why this priority**: Visibility is needed to manage servers. The list and detail page are the primary management interface.

**Independent Test**: Admin navigates to the servers page, sees all servers with their status, clicks one, sees the detail page with power controls and allocation info.

**Acceptance Scenarios**:

1. **Given** multiple servers across multiple nodes, **When** the admin opens the servers page, **Then** all servers are listed with name, node, status, and template
2. **Given** servers in different states, **When** the admin filters by status, **Then** only matching servers are shown
3. **Given** a server whose state changes (e.g., crashes), **When** the daemon reports the new state, **Then** the list and detail page update without a page reload
4. **Given** a server detail page, **When** the admin views it, **Then** they see the server's name, node, template, primary allocation, current state, and power control buttons

---

### Edge Cases

- What happens when the daemon is unreachable during a power action? The panel marks the action as failed and the server state remains as last known. The admin can retry when the daemon comes back online.
- What happens when a container crashes unexpectedly? The daemon detects the crash via Docker events, reports "crashed" state to the panel, and the panel updates the UI via SSE. The admin can then restart the server.
- What happens when two admins try to start the same server simultaneously? The first request succeeds, the second receives a "server already starting" or 409 conflict.
- What happens when the daemon reports a state change for a server that was just deleted? The panel ignores state reports for non-existent servers.
- What happens when the panel restarts while a server is "starting"? The panel reconciles state on startup by querying the daemon for actual container states.
- What happens when a server's template is deactivated after creation? The server continues to run; the template is only needed at creation time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an admin to create a server by selecting a node, an activated template, a name, and optionally specifying variables
- **FR-002**: System MUST auto-assign a primary allocation from the node's available pool when creating a server (preferring the node's primary IP)
- **FR-003**: System MUST send the server configuration (template, variables, allocation, startup command) to the daemon for container creation
- **FR-004**: System MUST reject server creation if the node has no available allocations
- **FR-005**: System MUST reject server creation if the node's daemon is unreachable
- **FR-006**: System MUST allow an admin to start, stop, and restart a server via power action commands
- **FR-007**: System MUST transition server state through the state machine: offline → starting → running → stopping → stopped, with crashed as a terminal state requiring manual restart
- **FR-008**: System MUST send power commands to the daemon and update the server state based on the daemon's response
- **FR-009**: System MUST reject power actions that are invalid for the current state (e.g., starting a "running" server)
- **FR-010**: System MUST allow an admin to delete a server, which removes the container, releases allocations, and deletes the record
- **FR-011**: System MUST release all allocations assigned to a server when the server is deleted
- **FR-012**: System MUST display a list of all servers with name, node, status, and template
- **FR-013**: System MUST allow filtering the server list by node and status
- **FR-014**: System MUST display a server detail page with status, node, template, allocation, and power controls
- **FR-015**: System MUST update the server list and detail page in real-time via SSE when server states change
- **FR-016**: System MUST handle daemon-reported state changes (running, stopped, crashed) and update the server record accordingly
- **FR-017**: System MUST ignore state reports for servers that no longer exist (deleted)
- **FR-018**: System MUST log all server lifecycle actions (create, start, stop, restart, delete) to the audit log
- **FR-019**: System MUST reject server creation with a deactivated template
- **FR-020**: System MUST validate server names for uniqueness within a node (or globally — see Assumptions)

### Key Entities *(include if feature involves data)*

- **Server**: A game server instance. Key attributes: id, name, nodeId, templateId, allocationId, status (offline/starting/running/stopping/stopped/crashed/creation_failed), createdAt, updatedAt. Relationships: belongs to a node, uses a template, has a primary allocation.
- **Server State**: The lifecycle state of a server, tracked in the server record and updated by both panel actions and daemon reports. States: offline, starting, running, stopping, stopped, crashed, creation_failed.
- **Server Configuration**: The JSON configuration sent to the daemon at creation time, including template variables, startup command, allocation (IP:port:protocol), and resource limits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can create a server in under 30 seconds from the panel UI
- **SC-002**: Server state transitions (start/stop/restart) complete within 10 seconds for a healthy node
- **SC-003**: Server list updates in real-time without page reload when a server's state changes
- **SC-004**: All allocations assigned to a deleted server are released and available for reassignment
- **SC-005**: Server creation fails gracefully with a clear error message when the node is unreachable or has no allocations
- **SC-006**: A crashed server is detected and reported to the panel within 5 seconds of the container exiting

## Assumptions

- The daemon (R6) is already implemented and provides container lifecycle APIs (create, start, stop, restart, remove) and state reporting
- The allocation system (R7) is already implemented and provides auto-assignment and release APIs
- The template system (R8) is already implemented and provides template configuration with variables
- Server names must be unique per node (not globally) — two nodes can have a server named "My Server"
- Server deletion when the daemon is offline will fail (the panel cannot guarantee container/volume cleanup); the admin can retry when the daemon is back online. This is the safe default — we do not want orphaned containers.
- The panel does NOT directly access Docker — all container operations go through the daemon via authenticated HTTP
- Console streaming, file management, and backups are deferred to R10/R11/R12
- Resource limits (CPU/RAM/disk) are passed from the template configuration; the panel does not enforce them — the daemon does via Docker
- The server state machine is: offline → starting → running, running → stopping → stopped, stopped → starting → running, running → crashed (terminal), creating → creation_failed (terminal). A crashed or creation_failed server can be deleted or restarted (which transitions to starting).
