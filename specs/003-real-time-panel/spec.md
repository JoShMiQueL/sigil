# Feature Specification: Real-time Panel Updates

**Feature Branch**: `003-real-time-panel`

**Created**: 2026-09-09

**Status**: Implemented

**Input**: Parent roadmap: `ROADMAP.md` → entry **R17**. Real-time Panel — SSE infrastructure, replace polling, reactive panel. Constitution Principle VI mandates HTTP for actions, SSE for panel updates, WebSocket for console/SFTP. No polling for state data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Sees Node Status Update in Real Time (Priority: P1)

An admin has the nodes page open. A daemon sends a heartbeat. Without any page reload or manual refresh, the node's status changes from "unknown" to "online" and its CPU, memory, disk, and container metrics appear instantly. When the daemon stops sending heartbeats and the timeout sweep marks it offline, the node's status changes to "offline" with a red indicator — again, no reload.

**Why this priority**: This is the core value of real-time. Node health is the most dynamic data in the panel and the most critical for admin decision-making. It replaces the 15-second polling from R4 with instant push updates. Without this, the rest of the real-time infrastructure has no visible payoff.

**Independent Test**: Register a node, open the nodes page, send a heartbeat via API. Verify the node status changes to "online" and metrics appear without reloading the page. Stop heartbeats, wait for the timeout sweep, verify the node shows "offline" without reloading.

**Acceptance Scenarios**:

1. **Given** a node is registered and the admin has the nodes page open, **When** a heartbeat arrives at the API, **Then** the node's status changes to "online" and its metrics (CPU, memory, disk, containers) update in the table without any page reload or manual refresh.
2. **Given** a node is online and the admin has the nodes page open, **When** the heartbeat timeout sweep marks the node offline, **Then** the node's status changes to "offline" with a visual indicator (red) without any page reload.
3. **Given** the admin has the node detail page open for a specific node, **When** a heartbeat arrives, **Then** the detail page updates the node's metrics and last-heartbeat timestamp in real time without reloading.
4. **Given** the admin has the nodes page open, **When** a new node registers via pairing, **Then** the new node appears in the table automatically without reloading.
5. **Given** the admin has the nodes page open, **When** a node is deleted by another admin in a different session, **Then** the node disappears from the table automatically.

---

### User Story 2 - Panel Survives Network Interruptions (Priority: P2)

The admin's network connection drops for 5 seconds while the nodes page is open. The SSE connection breaks. The panel shows a subtle "reconnecting" indicator. When the network returns, the panel automatically reconnects via SSE, resyncs state from the API (HTTP fetch for current snapshot), and resumes receiving push updates. No page reload, no manual refresh, no data loss. The admin never sees a blank or stale page.

**Why this priority**: Auto-reconnect is what makes real-time feel reliable. Without it, a network blip forces a page reload, breaking the "reactive panel" promise. This must work before retrofitting more features onto SSE.

**Independent Test**: Open the nodes page, disconnect the network (or block the API port), wait 5 seconds, reconnect. Verify the panel shows a "reconnecting" indicator, then automatically resyncs and resumes real-time updates without a page reload.

**Acceptance Scenarios**:

1. **Given** the admin has the nodes page open with an active SSE connection, **When** the network connection drops, **Then** the panel shows a "reconnecting" indicator within 2 seconds.
2. **Given** the SSE connection is broken, **When** the network returns, **Then** the panel automatically reconnects to the SSE endpoint and resyncs the current state via HTTP without requiring a page reload.
3. **Given** the SSE connection drops and reconnects, **When** reconnection succeeds, **Then** the "reconnecting" indicator disappears and the panel resumes receiving real-time updates.
4. **Given** the SSE connection drops repeatedly, **When** reconnection attempts fail, **Then** the panel uses exponential backoff (1s, 2s, 4s, 8s, max 30s) to avoid hammering the server.
5. **Given** the admin's session expires while the SSE connection is active, **When** the SSE endpoint returns 401, **Then** the panel redirects to the login page.

---

### User Story 3 - All Panel Data Is Reactive (Priority: P3)

Every piece of state data displayed in the panel updates in real time. This includes: region list and node/server counts, node table and node detail, user list (new users, suspensions, role changes). No `refetchInterval`, no `setInterval` + fetch, no manual refresh. The panel fetches the initial state via HTTP on page load, then subscribes to SSE for all subsequent updates.

**Why this priority**: This is the retrofit phase. US1 proves the infrastructure works for nodes; US3 extends it to everything else. Once complete, the panel has zero polling — fulfilling the Constitution Principle VI mandate.

**Independent Test**: Open the users page, create a new user via API or another session. Verify the new user appears in the list without reloading. Suspend a user, verify the status changes in real time. Open the nodes page, create a region via API, verify it appears without reloading.

**Acceptance Scenarios**:

1. **Given** the admin has the users page open, **When** a new user is created (via API or another admin session), **Then** the new user appears in the user table without a page reload.
2. **Given** the admin has the users page open, **When** a user is suspended or unsuspended, **Then** the user's status updates in the table in real time.
3. **Given** the admin has the nodes page open, **When** a region is created or deleted, **Then** the region list and its node/server counts update without a page reload.
4. **Given** the admin has any panel page open, **When** the page first loads, **Then** the initial data is fetched via HTTP (first paint), and all subsequent updates arrive via SSE.
5. **Given** any panel page with real-time data, **When** inspected, **Then** there is no `refetchInterval`, `setInterval`, or polling mechanism in the code — only SSE subscriptions.

---

### User Story 4 - Reusable SSE Infrastructure for Future Features (Priority: P4)

The SSE infrastructure is designed as a generic, reusable system. A single SSE endpoint multiplexes multiple event types (node updates, region updates, user updates, audit entries). The panel has a reusable `useSSE` hook that any future feature can use to subscribe to event streams. Future features (R5 audit log, R9 server status, R10 console stats) plug into this infrastructure without building their own real-time transport.

**Why this priority**: This ensures the real-time infrastructure is not a one-off for R1/R4 but a foundation for the entire panel. It prevents future features from reinventing SSE connections or falling back to polling.

**Independent Test**: Subscribe to a new event type via the `useSSE` hook, emit an event from the API, verify the panel receives it. Verify that adding a new event type requires only a new event name and handler — no new SSE connection, no new endpoint.

**Acceptance Scenarios**:

1. **Given** the SSE infrastructure is in place, **When** a future feature needs real-time updates, **Then** it can subscribe to a new event type by specifying an event name and handler — no new SSE connection or endpoint needed.
2. **Given** the admin has the panel open, **When** multiple event types are emitted (node update, region update, user update), **Then** all are delivered over a single SSE connection and routed to the correct handlers.
3. **Given** the SSE endpoint receives a new event type, **When** the panel has no handler for it, **Then** the event is silently ignored (no error, no crash).
4. **Given** the `useSSE` hook is used by multiple components, **When** the SSE connection drops, **Then** all subscribed components are notified and resume receiving events on reconnect.

---

### Edge Cases

- What happens when the SSE connection drops mid-event? The client detects the broken connection, resyncs via HTTP, and re-subscribes. Partial events are discarded — the HTTP resync provides the authoritative state.
- What happens when the server restarts? All SSE connections drop. Clients auto-reconnect with backoff, resync via HTTP, and resume. No data is lost — the database is the source of truth.
- What happens when the admin opens 10 tabs? Each tab maintains its own SSE connection. The server handles multiple connections per user. Future optimization: share a single SSE connection across tabs via BroadcastChannel (deferred).
- What happens when the admin's session expires mid-SSE? The SSE endpoint returns 401 on the next event or heartbeat check. The client detects this and redirects to login.
- What happens when event frequency is very high (e.g., 100 nodes sending heartbeats simultaneously)? The server batches/debounces events to avoid flooding the client — node metrics are pushed at most once per second per node, even if heartbeats arrive more frequently.
- What happens when the browser tab is backgrounded? The browser may pause SSE. On tab focus, the client resyncs via HTTP and resumes SSE. No events are expected during background — the HTTP resync on focus catches up.
- What happens when the SSE connection is blocked by a proxy/firewall? The client falls back to HTTP polling (temporary, with a visible "degraded mode" indicator) until SSE is available again. This is the only exception to the no-polling rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an SSE endpoint that pushes real-time updates to authenticated panel clients.
- **FR-002**: System MUST multiplex multiple event types (node, region, user, audit) over a single SSE connection per client.
- **FR-003**: System MUST authenticate SSE connections using the existing session cookie from R1.
- **FR-004**: System MUST reject SSE connections from unauthenticated clients with HTTP 401.
- **FR-005**: System MUST push node status changes (online, offline, unknown) to connected clients in real time.
- **FR-006**: System MUST push node metric updates (CPU, memory, disk, containers) to connected clients in real time.
- **FR-007**: System MUST push node creation and deletion events to connected clients in real time.
- **FR-008**: System MUST push region creation, deletion, and count-update events to connected clients in real time.
- **FR-009**: System MUST push user creation, suspension, and role-change events to connected clients in real time.
- **FR-010**: Panel MUST fetch initial state via HTTP on page load (first paint), then subscribe to SSE for all subsequent updates.
- **FR-011**: Panel MUST NOT use `refetchInterval`, `setInterval` + fetch, or any polling mechanism for state data after R17 is complete.
- **FR-012**: Panel MUST auto-reconnect to the SSE endpoint with exponential backoff (1s, 2s, 4s, 8s, max 30s) when the connection drops.
- **FR-013**: Panel MUST show a "reconnecting" indicator within 2 seconds of an SSE connection drop.
- **FR-014**: Panel MUST resync state via HTTP after reconnecting, then resume SSE subscription, without a page reload.
- **FR-015**: Panel MUST redirect to the login page when the SSE endpoint returns HTTP 401 (session expired).
- **FR-016**: Panel MUST provide a reusable `useSSE` hook that any component can use to subscribe to event types.
- **FR-017**: System MUST debounce node metric pushes to at most once per second per node to prevent flooding.
- **FR-018**: Panel MUST display a "degraded mode" indicator and fall back to HTTP polling if the SSE connection cannot be established after multiple retries (proxy/firewall blocking SSE).
- **FR-019**: System MUST clean up SSE connections when the client disconnects (no leaked connections on the server).
- **FR-020**: System MUST handle multiple SSE connections per user (multiple tabs) without errors.

### Key Entities *(include if feature involves data)*

- **SSE Event**: A server-pushed message containing an event type (node.update, node.create, node.delete, region.update, user.update) and a JSON payload. Delivered over a single SSE connection per client.
- **SSE Connection**: A long-lived HTTP connection between the panel and the API, authenticated via session cookie, used to push events from server to browser.
- **Event Subscription**: A panel-side registration mapping an event type to a handler function. Multiple subscriptions can share a single SSE connection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Node status changes appear in the panel within 1 second of the heartbeat being processed by the API.
- **SC-002**: The panel has zero `refetchInterval` or polling mechanisms for state data after R17 is complete.
- **SC-003**: A network interruption of up to 30 seconds does not require a page reload — the panel auto-reconnects and resyncs.
- **SC-004**: The SSE infrastructure supports 50 concurrent admin connections without performance degradation.
- **SC-005**: Adding a new real-time event type (for future features like R5 audit log) requires only a new event name and handler — no new endpoint, no new connection.

## Assumptions

- Existing authentication from R1 (admin sessions, session cookies) is reused for SSE connection authentication. No new auth mechanism is needed.
- The SSE endpoint lives in the API (Hono), not the daemon. The API is the source of truth for panel state.
- The daemon (R6) reports state to the API via HTTP (heartbeats, state callbacks). The API then pushes updates to connected panel clients via SSE. The daemon never talks to the panel browser directly — only via the API.
- WebSocket (R10) is separate and handles browser→daemon direct communication (console, SFTP). R17 does not implement WebSocket — it only establishes SSE for panel→browser updates.
- Initial page load uses HTTP fetch for first paint (TanStack Query initial fetch). SSE takes over for all subsequent updates. This avoids a blank page while waiting for the first SSE event.
- The `useSSE` hook integrates with TanStack Query — SSE events invalidate/update the relevant query keys, so existing query-based components become reactive without rewriting their data layer.
- Multiple tabs per user each maintain their own SSE connection. Shared-connection optimization (BroadcastChannel) is deferred.
- Proxy/firewall fallback to polling is a temporary degraded mode, not the primary path. The indicator makes it clear to the admin that real-time updates are paused.
