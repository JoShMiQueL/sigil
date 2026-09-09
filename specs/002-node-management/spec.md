# Feature Specification: Node Management

**Feature Branch**: `002-node-management`

**Created**: 2026-09-09

**Status**: Draft

**Input**: Parent roadmap: `ROADMAP.md` → entry **R4**. Node management — register daemons, pairing tokens, regions, health check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Creates a Region (Priority: P1)

An administrator creates a region to group nodes geographically or logically (e.g., "EU-West", "US-East", "Gaming-LAN"). A region has a name and an optional description. Nodes must belong to a region before they can be registered.

**Why this priority**: Regions are the container for nodes. Without a region, no node can be registered. This is the first step in the node management hierarchy.

**Independent Test**: Can be fully tested by logging in as admin, navigating to Nodes, creating a region, and verifying it appears in the region list.

**Acceptance Scenarios**:

1. **Given** the admin is logged in, **When** they navigate to Nodes and click "Create Region", **Then** they see a form with name and description fields.
2. **Given** the create region form is displayed, **When** the admin fills it with a unique name and submits, **Then** the region is created and appears in the region list.
3. **Given** a region with that name already exists, **When** the admin tries to create another with the same name, **Then** they see an error "A region with this name already exists".
4. **Given** a region exists, **When** the admin views the region list, **Then** they see each region with its node count and total server count.
5. **Given** a region exists with no nodes, **When** the admin deletes it, **Then** the region is removed.
6. **Given** a region has nodes assigned, **When** the admin tries to delete it, **Then** they see an error "Cannot delete a region with active nodes".

---

### User Story 2 - Admin Pairs a Node (Priority: P2)

An administrator generates a pairing token from the panel and uses it to register a new daemon node. The daemon sends the token to the panel's API, which validates it and creates the node record. The node is assigned to a region and receives its configuration. Once paired, the node appears in the panel with its metadata (hostname, IP, capabilities).

**Why this priority**: Without registered nodes, no game servers can be deployed. Pairing is the mechanism that connects a daemon to the panel securely.

**Independent Test**: Can be tested by generating a pairing token, simulating a daemon registration call with that token, and verifying the node appears in the panel.

**Acceptance Scenarios**:

1. **Given** the admin is logged in and at least one region exists, **When** they click "Generate Pairing Token", **Then** a token is created with an expiration time and is displayed once (cannot be retrieved later).
2. **Given** a valid pairing token exists, **When** a daemon submits its registration (hostname, IP, capabilities, region) with that token, **Then** the node is created and appears in the node list.
3. **Given** a pairing token has expired, **When** a daemon tries to register with it, **Then** the registration is rejected with "Pairing token expired".
4. **Given** a pairing token has already been used, **When** another daemon tries to register with the same token, **Then** the registration is rejected with "Pairing token already used".
5. **Given** the admin is logged in, **When** they view the node list, **Then** they see each node with its hostname, region, status (online/offline), and server count.
6. **Given** a node exists, **When** the admin clicks on it, **Then** they see its details: hostname, IP, region, capabilities, last heartbeat, and server count.

---

### User Story 3 - Node Health Monitoring (Priority: P3)

The panel monitors node health via heartbeats. Each daemon periodically sends a heartbeat to the panel with its current status (CPU usage, memory usage, disk usage, running container count). If a node stops sending heartbeats within a configurable interval, it is marked as offline. The admin can see node health at a glance and receives visual indicators of node status.

**Why this priority**: An admin needs to know which nodes are healthy before deploying servers. Offline nodes should not receive new server assignments.

**Independent Test**: Can be tested by simulating heartbeats from a registered node and verifying the panel shows updated resource usage and online status. Then stop heartbeats and verify the node is marked offline.

**Acceptance Scenarios**:

1. **Given** a node is registered, **When** the daemon sends a heartbeat with resource stats, **Then** the node's status updates to "online" and its resource usage is displayed.
2. **Given** a node is online, **When** no heartbeat is received within the timeout interval, **Then** the node is automatically marked "offline".
3. **Given** the admin views the node list, **When** one or more nodes are offline, **Then** those nodes are visually distinguished (red indicator) and cannot be selected for new server deployments.
4. **Given** an offline node resumes sending heartbeats, **When** the next heartbeat arrives, **Then** the node is marked "online" again.
5. **Given** the admin views a node's detail page, **When** the node is online, **Then** they see current CPU, memory, disk usage, and container count.

---

### User Story 4 - Admin Manages Nodes (Priority: P4)

An administrator can view, edit, and remove nodes. Editing allows changing the node's region, display name, and metadata. Removing a node requires that it has no running servers. The admin can also regenerate a node's authentication credentials if the daemon's credentials are compromised.

**Why this priority**: Node lifecycle management is needed for maintenance, decommissioning, and incident response.

**Independent Test**: Can be tested by registering a node, editing its region, verifying the change, and then removing it when it has no servers.

**Acceptance Scenarios**:

1. **Given** a node exists, **When** the admin edits its display name or region, **Then** the changes are saved and reflected in the node list.
2. **Given** a node exists with no servers, **When** the admin removes it, **Then** the node is deleted and its credentials are revoked.
3. **Given** a node has running servers, **When** the admin tries to remove it, **Then** they see an error "Cannot remove a node with active servers".
4. **Given** a node exists, **When** the admin regenerates its credentials, **Then** new credentials are issued and the old ones are immediately invalid.
5. **Given** a node is removed, **When** the daemon tries to communicate with the panel using its old credentials, **Then** the request is rejected.

---

### Edge Cases

- What happens when a node sends a heartbeat with malformed resource data? The panel rejects the heartbeat and logs a warning, but does not mark the node offline (a malformed heartbeat is not the same as no heartbeat).
- What happens when two daemons try to register with the same pairing token simultaneously? Only the first succeeds; the second is rejected.
- What happens when a node's region is deleted while the node is offline? The node is not orphaned — it retains its region reference until an admin reassigns it.
- What happens when the panel restarts? All node statuses are reset to "unknown" until the next heartbeat arrives. No data is lost.
- What happens when a pairing token is generated but never used? It expires after the configured timeout and is automatically cleaned up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admins to create, list, and delete regions with a unique name and optional description.
- **FR-002**: System MUST prevent deletion of a region that has nodes assigned to it.
- **FR-003**: System MUST allow admins to generate single-use pairing tokens with an expiration time.
- **FR-004**: System MUST display each pairing token only once at generation time and prevent retrieval afterward.
- **FR-005**: System MUST accept daemon registration requests that include a valid pairing token, hostname, IP, capabilities, and region ID.
- **FR-006**: System MUST reject registration with an expired, already-used, or invalid pairing token.
- **FR-007**: System MUST create a node record upon successful registration and issue unique credentials for the daemon.
- **FR-008**: System MUST accept authenticated heartbeats from registered daemons containing resource usage data.
- **FR-009**: System MUST mark a node as offline when no heartbeat is received within the configured timeout interval.
- **FR-010**: System MUST mark a node as online when a valid heartbeat is received after an offline period.
- **FR-011**: System MUST display node status (online/offline/unknown) and resource usage in the admin panel.
- **FR-012**: System MUST allow admins to edit a node's display name and region.
- **FR-013**: System MUST allow admins to remove a node that has no running servers.
- **FR-014**: System MUST prevent removal of a node that has running servers.
- **FR-015**: System MUST allow admins to regenerate a node's credentials, immediately invalidating the previous ones.
- **FR-016**: System MUST reject all daemon requests that use invalid or revoked credentials.
- **FR-017**: System MUST log all node management actions (create, edit, remove, pair, regenerate credentials) to the audit log.

### Key Entities *(include if feature involves data)*

- **Region**: A geographic or logical grouping of nodes. Has a unique name, optional description, and contains zero or more nodes.
- **Node**: A machine running a SigilPanel daemon. Has a hostname, IP, region, capabilities, credentials, status, and resource usage. Belongs to exactly one region.
- **Pairing Token**: A single-use, time-limited token that allows a daemon to register itself with the panel. Has an expiration time and a "used" flag.
- **Node Credentials**: Unique authentication secrets issued to a daemon upon registration. Used to authenticate heartbeats and state callbacks. Can be regenerated.
- **Heartbeat**: A periodic report from a daemon containing CPU, memory, disk usage, and container count. Used to determine node health.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can create a region and pair a new node in under 2 minutes.
- **SC-002**: Node status reflects real health within 60 seconds of a heartbeat or its absence.
- **SC-003**: The admin panel displays all nodes with their status and resource usage in a single view.
- **SC-004**: A compromised node's credentials can be revoked and regenerated in under 30 seconds.
- **SC-005**: The panel correctly handles 100+ registered nodes without performance degradation in the node list view.

## Assumptions

- The daemon (R6) is not yet implemented. This spec covers the panel-side node management and the API contract that the daemon will use. Daemon implementation is deferred to R6.
- Heartbeats are sent by the daemon over HTTP to the panel's API. The exact heartbeat interval and timeout are configurable but default to 30 seconds and 90 seconds respectively.
- Pairing tokens are short-lived (default 15 minutes) and single-use to prevent token reuse attacks.
- Node credentials are HMAC-based shared secrets, not JWTs, because the daemon is a long-lived service client, not a user session.
- Existing authentication from R1 (admin sessions, API keys) is reused for admin actions. Daemon-to-panel authentication is a new credential type specific to nodes.
- The admin panel already has a layout with navigation (from R1). Node management adds a new section to the existing navigation.
- Audit logging infrastructure from R1 is reused for node management actions.
- **Resolved (R17):** The panel now uses SSE (Server-Sent Events) for real-time node status and metrics. HTTP polling (15s interval) has been replaced by SSE subscriptions via `useSSE` in `NodesPage` and `NodeDetailPage`. See R17 (Real-time Panel) for details.
