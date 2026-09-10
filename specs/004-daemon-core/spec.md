# Feature Specification: Daemon Core

**Feature Branch**: `004-daemon-core`

**Created**: 2026-09-10

**Status**: Draft

**Input**: Parent roadmap: `ROADMAP.md` -> entry **R6**. Daemon core -- Docker lifecycle, filesystem jail, container isolation. Depends on R4 (Node Management).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Daemon Starts Up and Registers with the Panel (Priority: P1)

When an operator installs and starts the daemon on a node, it reads its configuration (panel URL, pairing token), calls the panel's registration endpoint, receives its credentials, and begins sending periodic heartbeats with resource usage. The node appears as "online" in the panel. If the daemon is already registered (credentials exist locally), it skips registration and uses stored credentials. If the panel is unreachable at startup, the daemon retries with exponential backoff and logs the failure -- it does not crash.

**Why this priority**: Without a running, registered daemon, the node cannot accept any server deployments. This is the foundation of the execution plane.

**Independent Test**: Can be tested by starting the daemon with a valid pairing token against a running panel, verifying the node appears online in the panel, and confirming heartbeats arrive periodically.

**Acceptance Scenarios**:

1. **Given** the daemon has a valid pairing token and the panel is reachable, **When** the daemon starts, **Then** it registers with the panel, stores its credentials securely, and begins sending heartbeats.
2. **Given** the daemon has stored credentials from a previous registration, **When** it starts, **Then** it skips registration and uses the stored credentials to send heartbeats.
3. **Given** the panel is unreachable at startup, **When** the daemon tries to register, **Then** it retries with exponential backoff and logs the failure without crashing.
4. **Given** the daemon is running and registered, **When** a heartbeat is sent, **Then** the panel updates the node's status to "online" and displays current CPU, memory, disk usage, and container count.
5. **Given** the daemon's credentials have been revoked by the admin, **When** the daemon sends a heartbeat, **Then** the panel rejects it and the daemon logs the authentication failure and stops sending heartbeats.
6. **Given** the daemon is running, **When** it receives SIGTERM or SIGINT, **Then** it gracefully shuts down: stops the heartbeat loop, stops any managed containers (unless configured to keep them running), and exits cleanly.

---

### User Story 2 - Panel Manages Server Container Lifecycle (Priority: P2)

The panel sends server configuration (image, startup command, environment variables, resource limits, port allocations, volume path) to the daemon. The daemon creates a Docker container from that configuration and manages its lifecycle: start, stop, restart, and remove. Each operation is idempotent -- starting an already-running server is a no-op, stopping an already-stopped server is a no-op. The daemon validates the configuration before creating the container and rejects invalid or unsafe configurations.

**Why this priority**: This is the core function of the daemon. Without container lifecycle management, no game servers can run.

**Independent Test**: Can be tested by sending a create-server request to the daemon with a minimal configuration (e.g., `alpine` image with `sleep infinity`), verifying the container is created and started, then sending stop and remove requests and verifying the container is gone.

**Acceptance Scenarios**:

1. **Given** the daemon is running and registered, **When** the panel sends a create-server request with valid configuration, **Then** the daemon creates a Docker container with the specified image, startup command, environment, ports, and volume, and starts it.
2. **Given** a server container exists and is running, **When** the panel sends a stop request, **Then** the daemon stops the container gracefully (SIGTERM, then SIGKILL after a timeout).
3. **Given** a server container exists and is stopped, **When** the panel sends a start request, **Then** the daemon starts the container.
4. **Given** a server container exists, **When** the panel sends a restart request, **Then** the daemon stops and then starts the container.
5. **Given** a server container exists, **When** the panel sends a remove request, **Then** the daemon stops the container (if running), removes it, and cleans up associated resources (networks, anonymous volumes).
6. **Given** a server container is already running, **When** the panel sends a start request, **Then** the daemon responds with success (idempotent, no duplicate container).
7. **Given** a server container is already stopped, **When** the panel sends a stop request, **Then** the daemon responds with success (idempotent).
8. **Given** the panel sends a create-server request with an invalid configuration (missing image, invalid port, unsafe startup command), **When** the daemon validates it, **Then** the request is rejected with a descriptive error and no container is created.

---

### User Story 3 - Server Files Are Isolated in a Secure Filesystem Jail (Priority: P3)

Each server has a dedicated directory on the host under a managed volume path. The daemon resolves all file paths through a jail that canonicalizes the path, rejects symlinks that escape the jail root, and blocks path traversal attempts (`../`). No operation -- read, write, list, delete, archive extraction -- can access files outside the server's directory. The jail is enforced for all file operations the daemon performs on behalf of the server.

**Why this priority**: Game servers run arbitrary code. Filesystem isolation is a non-negotiable security requirement (Constitution Principle III). Without it, a compromised game server could read or modify host files.

**Independent Test**: Can be tested by creating a server, then attempting path traversal attacks (`../../etc/passwd`, symlinks to `/`, archives containing `../` paths) through the daemon's file operations and verifying they are all rejected.

**Acceptance Scenarios**:

1. **Given** a server exists with a volume directory, **When** the daemon resolves a path within the server's directory, **Then** the resolved real path is within the jail root.
2. **Given** a server exists, **When** the daemon receives a file path containing `../` sequences that would escape the jail, **Then** the path is rejected and no file operation occurs.
3. **Given** a server exists and a symlink inside its directory points to `/etc/passwd`, **When** the daemon tries to resolve the symlink, **Then** the resolution is rejected because the target is outside the jail.
4. **Given** a server exists, **When** an archive (zip, tar) is extracted within the server's directory and contains entries with `../` paths, **Then** those entries are skipped or the extraction is rejected, and no files are written outside the jail.
5. **Given** a server is removed, **When** the daemon cleans up, **Then** the server's volume directory and all its contents are deleted, and no other server's files are affected.

---

### User Story 4 - Daemon Reports Server State Changes to the Panel (Priority: P4)

The daemon continuously monitors the state of all managed containers. When a container changes state (started, stopped, crashed, OOM-killed, died), the daemon reports the new state to the panel via an authenticated HTTP callback. This ensures the panel always reflects the true state of each server without polling. If the panel is unreachable when a state change occurs, the daemon queues the event and retries.

**Why this priority**: The panel must know the real state of each server to make correct decisions (e.g., don't assign new servers to a full node, alert the user if their server crashed). Without state reporting, the panel's view would be stale.

**Independent Test**: Can be tested by creating and starting a server, then manually killing the container, and verifying the panel receives a state change callback marking the server as "crashed" or "stopped".

**Acceptance Scenarios**:

1. **Given** a server container is running, **When** the container exits unexpectedly (crash, OOM-kill), **Then** the daemon detects the state change and reports it to the panel via an HMAC-signed HTTP callback.
2. **Given** a server container is started by the daemon, **When** the container reaches a running state, **Then** the daemon reports the "running" state to the panel.
3. **Given** a server container is stopped by the daemon, **When** the container reaches a stopped state, **Then** the daemon reports the "stopped" state to the panel.
4. **Given** the panel is unreachable when a state change occurs, **When** the daemon tries to report, **Then** it queues the event and retries with exponential backoff.
5. **Given** the daemon restarts after a crash, **When** it starts up, **Then** it reconciles the actual state of all containers with the panel (reports current state for each managed server).

---

### User Story 5 - All Containers Run with Security Hardening (Priority: P5)

Every container the daemon creates runs with minimal privileges and security constraints. This includes: all Linux capabilities dropped (`cap_drop: ALL`), `no-new-privileges` flag set, PID limits, memory and CPU limits, no access to the Docker socket, read-only root filesystem where possible, and a non-root user. These constraints are applied automatically by the daemon and cannot be overridden by server configuration.

**Why this priority**: Game servers run arbitrary code. Container escape or resource exhaustion could compromise the host or other servers. Security hardening is a non-negotiable constitutional requirement (Principle III).

**Independent Test**: Can be tested by creating a server and inspecting the container's security settings (capabilities, user, resource limits) via the Docker API, verifying they match the hardening policy.

**Acceptance Scenarios**:

1. **Given** the daemon creates a container, **When** the container is inspected, **Then** all Linux capabilities are dropped except those explicitly required (e.g., `CHOWN` if the game requires it, documented and justified).
2. **Given** the daemon creates a container, **When** the container is inspected, **Then** the `no-new-privileges` flag is set, preventing privilege escalation.
3. **Given** the daemon creates a container, **When** the container is inspected, **Then** the Docker socket is NOT mounted into the container.
4. **Given** the daemon creates a container with resource limits, **When** the container exceeds its memory limit, **Then** it is OOM-killed by the kernel (not allowed to consume host memory).
5. **Given** the daemon creates a container, **When** the container is inspected, **Then** it runs as a non-root user with a specific UID/GID allocated by the daemon.
6. **Given** the daemon creates a container, **When** the container is inspected, **Then** PID limits are set to prevent fork bombs.

---

### Edge Cases

- What happens when Docker is not running on the node? The daemon detects this at startup, logs the error, and retries connecting to the Docker daemon with backoff. It does not crash. Heartbeats report the node as "degraded" (online but unable to run containers).
- What happens when two panels send conflicting commands for the same server? The daemon processes commands sequentially per server (locking by server ID). The last command wins, but state reporting ensures the panel eventually converges.
- What happens when a container is removed outside the daemon (e.g., `docker rm -f` by an operator)? The daemon detects the missing container on its next reconciliation loop and reports the server as "stopped" or "missing" to the panel.
- What happens when the daemon's disk is full? The daemon reports high disk usage in heartbeats and refuses new server creation requests with a "disk full" error.
- What happens when a server's image is not available on the node? The daemon attempts to pull it. If the pull fails (registry unreachable, authentication required), the server creation is rejected with a descriptive error.
- What happens when the daemon's configuration file is missing or malformed? The daemon logs a clear error message and exits. It does not start with default or guessed configuration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The daemon MUST register with the panel using a pairing token and receive credentials (secret ID + secret) on first startup.
- **FR-002**: The daemon MUST store credentials securely on the local filesystem (restricted permissions) and reuse them on subsequent startups.
- **FR-003**: The daemon MUST send periodic heartbeats to the panel containing CPU, memory, disk usage, and running container count.
- **FR-004**: The daemon MUST retry registration and heartbeat delivery with exponential backoff when the panel is unreachable, without crashing.
- **FR-005**: The daemon MUST stop sending heartbeats and log the error when the panel rejects its credentials (revoked).
- **FR-006**: The daemon MUST shut down gracefully on SIGTERM/SIGINT, stopping the heartbeat loop and cleaning up resources.
- **FR-007**: The daemon MUST accept authenticated server lifecycle commands from the panel: create, start, stop, restart, remove.
- **FR-008**: The daemon MUST validate server configuration before creating a container and reject invalid or unsafe configurations.
- **FR-009**: The daemon MUST manage Docker containers using the Docker Engine API (not the CLI).
- **FR-010**: The daemon MUST make lifecycle operations idempotent (start a running server = no-op, stop a stopped server = no-op).
- **FR-011**: The daemon MUST stop containers gracefully (SIGTERM) with a configurable timeout before force-killing (SIGKILL).
- **FR-012**: The daemon MUST clean up container resources (networks, anonymous volumes) when removing a server.
- **FR-013**: The daemon MUST isolate each server's files in a dedicated directory under a managed volume path.
- **FR-014**: The daemon MUST resolve all file paths through a jail that canonicalizes paths and rejects path traversal (`../`) and symlink escapes.
- **FR-015**: The daemon MUST reject archive extractions that contain entries resolving outside the jail (zip-slip protection).
- **FR-016**: The daemon MUST delete a server's volume directory and all contents when the server is removed, without affecting other servers.
- **FR-017**: The daemon MUST monitor container state changes and report them to the panel via HMAC-signed HTTP callbacks.
- **FR-018**: The daemon MUST queue state-change events and retry when the panel is unreachable.
- **FR-019**: The daemon MUST reconcile actual container states with the panel on startup (after a daemon restart).
- **FR-020**: The daemon MUST apply security hardening to all containers: drop all Linux capabilities, set `no-new-privileges`, run as non-root, set PID limits, set resource limits (CPU/memory).
- **FR-021**: The daemon MUST NEVER mount the Docker socket into a server container.
- **FR-022**: The daemon MUST NEVER create privileged containers.
- **FR-023**: The daemon MUST redact secrets (credentials, tokens, passwords) from all log output.
- **FR-024**: The daemon MUST authenticate all incoming panel requests using HMAC signatures (same credential scheme as R4 node auth).
- **FR-025**: The daemon MUST handle concurrent operations on different servers in parallel, but serialize operations on the same server.
- **FR-026**: The daemon MUST report a "degraded" status in heartbeats when Docker is unavailable on the node.
- **FR-027**: The daemon MUST refuse new server creation when disk usage exceeds a configurable threshold.
- **FR-028**: The daemon MUST pull server images automatically if they are not available locally, and report a clear error if the pull fails.

### Key Entities *(include if feature involves data)*

- **Daemon Configuration**: The daemon's local configuration file containing the panel URL, pairing token (for first registration), credential storage path, heartbeat interval, Docker socket path, volume base path, and security defaults.
- **Server Configuration**: The JSON payload sent by the panel to the daemon describing how to create and run a server container. Includes image, startup command, environment variables, port allocations, volume path, and resource limits.
- **Container State**: The current lifecycle state of a server container (creating, running, stopped, crashed, removing, missing). Monitored by the daemon and reported to the panel.
- **Filesystem Jail**: The security boundary around a server's files. Rooted at the server's volume directory. Enforces path canonicalization, symlink rejection, and traversal blocking.
- **State Change Event**: A record of a container state transition (from state, to state, reason, timestamp). Sent to the panel via HMAC-signed HTTP callback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can install, configure, and start the daemon on a fresh node, and the node appears "online" in the panel within 30 seconds.
- **SC-002**: The panel can create, start, stop, restart, and remove a game server container through the daemon, with each operation completing in under 10 seconds for a standard image.
- **SC-003**: A path traversal or symlink escape attack against the filesystem jail is blocked in 100% of tested cases.
- **SC-004**: The panel reflects the true state of a server (running, stopped, crashed) within 5 seconds of the actual state change.
- **SC-005**: A container that attempts to exceed its memory limit is killed within 1 second, and the panel is notified of the OOM event.
- **SC-006**: The daemon survives a panel outage for 10 minutes without crashing, and delivers all queued state-change events after the panel recovers.
- **SC-007**: The daemon manages 50 concurrent game server containers on a single node without performance degradation in heartbeat delivery or state reporting.

## Assumptions

- The daemon is written in Go 1.27 and uses the Docker Engine API via the official Go SDK (`docker/client`), not the Docker CLI.
- The panel (R4) already has the registration (`POST /api/node/register`) and heartbeat (`POST /api/node/heartbeat`) endpoints implemented. The daemon is the client for these endpoints.
- Node credentials from R4 use HMAC-SHA256 for authentication. The daemon uses the same scheme to authenticate incoming panel requests (panel-to-daemon direction).
- For development and testing, public Docker images (`alpine`, `eclipse-temurin`) are used instead of custom SigilPanel images (R2). Production requires custom images.
- Server lifecycle commands flow from panel to daemon via HTTP. The daemon exposes its own HTTP API on a configurable port (default 8080 on the node's internal interface).
- The daemon does not implement SFTP (R11), backups (R12), file manager UI (R11), or WebSocket console (R10). These are separate specs that build on R6.
- The daemon does not implement server creation from templates (R8). Server configuration is received as a complete JSON payload from the panel. Template expansion happens in the panel.
- Allocations (R7) are managed by the panel. The daemon receives port mappings as part of server configuration and applies them to the container.
- The daemon stores its configuration and credentials in a standard location (e.g., `/etc/sigilpanel/daemon.yaml` and `/var/lib/sigilpanel/daemon/credentials.json` with restricted permissions).
- Docker is installed on the node and the daemon connects via the Unix socket (`/var/run/docker.sock`) or a configurable TCP endpoint.
- Server volumes are stored under `/var/lib/sigilpanel/volumes/<server-uuid>/` on the host, bind-mounted into containers.
- The daemon is tested against a real Docker daemon (Constitution Principle IV: no mocks for Docker). Integration tests use Testcontainers or a real Docker daemon in CI.
