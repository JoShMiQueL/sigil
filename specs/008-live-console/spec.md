# Feature Specification: Live Console

**Feature Branch**: `008-live-console`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "R10 Live Console — WebSocket browser→daemon, console streaming, stats"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin views live server console (Priority: P1)

An admin navigates to a running server's detail page and opens the console tab. The console displays the server's stdout/stderr output in real time as it streams from the container. The admin can see startup logs, game output, and error messages as they happen without refreshing the page.

**Why this priority**: The live console is the primary way admins interact with running game servers. Without it, the panel is just CRUD — you can create and start servers but can't see what they're doing. This is the core differentiator between a management panel and a simple orchestrator.

**Independent Test**: Can be fully tested by starting a server, opening its console, and verifying that log output appears in real time as the container produces it.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the admin opens the console view, **Then** the console displays recent output from the container and begins streaming new output in real time
2. **Given** a stopped server, **When** the admin opens the console view, **Then** the console shows a "server is not running" indicator and does not attempt to connect
3. **Given** a running server with active console streaming, **When** the server stops, **Then** the console shows the final output and displays a "disconnected" indicator
4. **Given** a console connection that drops due to network issues, **When** the connection is restored, **Then** the console reconnects automatically and resumes streaming without a page reload

---

### User Story 2 - Admin sends commands to the console (Priority: P2)

An admin types a command into the console input box and presses Enter. The command is sent to the server's container stdin and the server processes it. The admin sees the command echoed in the console output followed by any response the server produces.

**Why this priority**: Sending commands (like `say`, `stop`, `op`, `kick`) to a running game server is the second most common console interaction after viewing output. This makes the console bidirectional, not just a read-only log viewer.

**Independent Test**: Can be tested by opening a running server's console, typing a command, and verifying the server receives and processes it.

**Acceptance Scenarios**:

1. **Given** a running server with an active console connection, **When** the admin types a command and presses Enter, **Then** the command is sent to the container stdin and appears in the console output
2. **Given** a stopped server, **When** the admin tries to type a command, **Then** the input box is disabled and shows a hint that the server must be running
3. **Given** a command that the server processes, **When** the server produces output in response, **Then** the response appears in the console output in real time

---

### User Story 3 - Admin views server resource stats (Priority: P3)

An admin viewing a server's detail page sees real-time resource usage: CPU percentage, memory usage, and disk usage. These stats update live without page reloads, giving the admin a dashboard view of the server's health.

**Why this priority**: Resource stats help admins diagnose performance issues and decide when to upgrade or restart a server. This is valuable but secondary to the console itself.

**Independent Test**: Can be tested by starting a server, viewing its stats, and verifying that CPU/memory/disk values update over time as the server runs.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the admin views the server detail page, **Then** CPU, memory, and disk usage are displayed and update in real time
2. **Given** a stopped server, **When** the admin views the server detail page, **Then** stats show zero or "not available" with an appropriate indicator
3. **Given** a server under load, **When** resource usage increases, **Then** the stats reflect the change within a few seconds

---

### Edge Cases

- What happens when the daemon is offline? The console shows "daemon unreachable" and the stats show "not available". The rest of the panel continues to work.
- What happens when the WebSocket JWT expires? The panel requests a new token from the API and reconnects automatically.
- What happens when the admin navigates away from the console and back? The console reconnects and shows recent output (buffered by the daemon), not the full history from container start.
- What happens when multiple admins view the same console? Both see the same output stream. Commands from one admin are visible to the other.
- What happens when the container produces output very rapidly? The console buffers and batches output to avoid overwhelming the browser. Very old output is truncated to prevent memory issues.
- What happens when the admin sends a command while a previous command is still being processed? Commands are queued and sent in order. There is no command-level locking.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a live console view on the server detail page that streams container stdout/stderr in real time
- **FR-002**: System MUST establish a direct WebSocket connection from the browser to the daemon for console streaming (browser→daemon, not browser→panel→daemon)
- **FR-003**: System MUST authenticate the WebSocket connection using a short-lived JWT signed by the panel API
- **FR-004**: System MUST allow admins to send commands to the container stdin via the same WebSocket connection
- **FR-005**: System MUST disable command input when the server is not running
- **FR-006**: System MUST display real-time resource stats (CPU, memory, disk) on the server detail page
- **FR-007**: System MUST auto-reconnect the WebSocket with exponential backoff on connection loss
- **FR-008**: System MUST show a "reconnecting" indicator when the WebSocket is disconnected and attempting to reconnect
- **FR-009**: System MUST show a "disconnected" indicator when the server stops or the daemon is unreachable
- **FR-010**: System MUST provide a console output buffer that retains recent output (last N lines) so reconnecting admins see context
- **FR-011**: System MUST truncate very old console output to prevent browser memory issues
- **FR-012**: System MUST generate a short-lived JWT (max 5 minutes) scoped to a specific server ID when an admin requests console access
- **FR-013**: System MUST validate the JWT on the daemon side before accepting WebSocket connections
- **FR-014**: System MUST reject WebSocket connections for non-admin users (deferred: per-server member permissions in R13)
- **FR-015**: System MUST update resource stats via SSE or WebSocket, not polling

### Key Entities *(include if feature involves data)*

- **ConsoleToken**: A short-lived JWT scoped to a single server ID, issued by the panel API, validated by the daemon. Contains: serverId, userId, expiry, scope ("console").
- **ConsoleMessage**: A single line or chunk of output from the container. Contains: text, stream type (stdout/stderr), timestamp.
- **ConsoleCommand**: A command sent from the browser to the container stdin. Contains: text, timestamp.
- **ServerStats**: Real-time resource usage for a server. Contains: cpuPct, memoryMb, memoryLimitMb, diskMb, diskLimitMb, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can view live console output from a running server with less than 1 second of latency between container output and browser display
- **SC-002**: Admins can send commands to a running server and see the server's response within 2 seconds
- **SC-003**: Resource stats (CPU, memory, disk) update at least every 5 seconds without page reloads
- **SC-004**: Console reconnects automatically within 5 seconds of a network interruption without losing more than the last few lines of output
- **SC-005**: The panel remains fully functional (navigation, other pages) when the console WebSocket is disconnected

## Assumptions

- The daemon already has Docker Engine API access and can attach to container stdout/stderr (Docker ContainerAttach or ContainerLogs with follow)
- The panel API already has authentication infrastructure (better-auth sessions) that can be extended to issue short-lived JWTs
- The daemon already has an HMAC-authenticated HTTP API that can be extended with a WebSocket endpoint
- Only admin users need console access in this feature; per-server member permissions are deferred to R13
- Console history is not persisted — only the live stream and a small in-memory buffer are provided. Full log persistence is deferred to a future feature
- SFTP and file manager are out of scope for this feature (deferred to R11)
- The existing SSE infrastructure handles panel state updates; WebSocket is only for console + stats
