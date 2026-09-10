# Tasks: Daemon Core

**Input**: Design documents from `/specs/004-daemon-core/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included — the spec mandates security regression tests (Constitution Principle: "A security fix ships with a regression test") and the plan specifies unit + integration tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Verification methodology**: MCP-first, Playwright-last (per AGENTS.md). Each user story is verified with unit/integration tests first, then chrome-devtools MCP (acting as a real user against the running panel + daemon), then bug fixes, and only at the very end — Playwright E2E regression tests codifying the already-verified behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Daemon (Go)**: `apps/daemon/` — `cmd/`, `internal/`
- **Shared schemas (TypeScript)**: `packages/shared/src/server/`
- **Panel API (TypeScript)**: `apps/api/src/routes/`, `apps/api/src/services/`
- **Panel UI (TypeScript)**: `apps/panel/src/`
- **E2E tests**: `apps/panel/tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the Go daemon module, shared schemas, and panel-side scaffolding.

- [X] T001 Create Go module structure at `apps/daemon/go.mod` with Go 1.27, add `github.com/docker/docker/client` and `gopkg.in/yaml.v3` dependencies
- [X] T002 [P] Create shared Zod schemas for server config in `packages/shared/src/server/config.ts` (PortMappingSchema, ResourceLimitsSchema, ServerConfigurationSchema)
- [X] T003 [P] Create shared Zod schemas for container state in `packages/shared/src/server/state.ts` (ContainerStateSchema, StateChangeEventSchema)
- [X] T004 [P] Create shared Zod schemas for lifecycle in `packages/shared/src/server/lifecycle.ts` (CreateServerRequestSchema, LifecycleResponseSchema, ServerStatusSchema)
- [X] T005 [P] Re-export server schemas from `packages/shared/src/index.ts`
- [X] T006 [P] Add `server.state` to SSEEventTypeSchema in `packages/shared/src/sse/events.ts` and define ServerStatePayloadSchema
- [X] T007 [P] Create daemon logger setup in `apps/daemon/internal/logger/logger.go` with slog and secret redaction (redact credentials, tokens, passwords from log output)

**Checkpoint**: Go module initialized, shared schemas defined, logger ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core daemon infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Create daemon config struct and YAML parsing in `apps/daemon/internal/config/config.go` (panel_url, pairing_token, credentials_path, volume_base_path, docker_socket, listen_address, heartbeat_interval_sec, stop_timeout_sec, disk_full_threshold_pct, uid_range_start, uid_range_end, default_pids_limit, default_memory_limit_mb, default_cpu_limit, log_level)
- [X] T009 Create config validation in `apps/daemon/internal/config/config.go` — reject missing or malformed config, validate ranges (heartbeat > 0, uid range valid, disk threshold 0-100), exit on invalid config
- [X] T010 [P] Write config tests in `apps/daemon/internal/config/config_test.go` — valid config parses, invalid config returns error, missing required fields rejected
- [X] T011 Create credential storage in `apps/daemon/internal/auth/credentials.go` — load/save credentials from JSON file with 0600 permissions, handle missing file (first run)
- [X] T012 [P] Write credential storage tests in `apps/daemon/internal/auth/credentials_test.go` — save and load round-trip, file permissions are 0600, missing file returns error
- [X] T013 Create HMAC-SHA256 sign/verify in `apps/daemon/internal/auth/hmac.go` — sign(timestamp + body) with secret, verify with ±60s timestamp window (matches R4 scheme)
- [X] T014 [P] Write HMAC tests in `apps/daemon/internal/auth/hmac_test.go` — valid signature verifies, invalid signature rejected, expired timestamp rejected, missing headers rejected
- [X] T015 Create HTTP auth middleware in `apps/daemon/internal/auth/middleware.go` — verify X-Node-Id, X-Node-Signature, X-Node-Timestamp headers on incoming panel requests, return 401 on failure
- [X] T016 [P] Write auth middleware tests in `apps/daemon/internal/auth/middleware_test.go` — valid auth passes, invalid auth returns 401, missing headers return 401, expired timestamp returns 400
- [X] T017 Create Docker Engine client wrapper in `apps/daemon/internal/docker/client.go` — connect via Unix socket or TCP, handle connection failure with retry, expose client to other packages
- [X] T018 Create Go struct types matching Zod schemas in `apps/daemon/internal/server/types.go` (ServerConfiguration, PortMapping, ResourceLimits, ContainerState, StateChangeEvent, LifecycleResponse, ServerStatus with correct json tags)

**Checkpoint**: Foundation ready — config, credentials, auth, Docker client, and shared types are in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Daemon Starts Up and Registers with the Panel (Priority: P1) 🎯 MVP

**Goal**: The daemon reads its config, registers with the panel via pairing token (or uses stored credentials), and sends periodic heartbeats with resource usage. The node appears "online" in the panel.

**Independent Test**: Start the daemon with a valid pairing token against a running panel, verify the node appears online, and confirm heartbeats arrive periodically.

### Step 1: Unit/Integration Tests (write first, must FAIL)

- [X] T019 [P] [US1] Write panel client tests in `apps/daemon/internal/panel/client_test.go` — registration sends correct payload, heartbeat sends correct payload, 401 on revoked credentials stops heartbeat loop, retry with backoff on 5xx
- [X] T020 [P] [US1] Write resource collector tests in `apps/daemon/internal/heartbeat/collector_test.go` — CPU usage returns 0-100, memory usage returns 0-100, disk usage returns 0-100, container count matches Docker

### Step 2: Implementation

- [X] T021 [US1] Implement panel client in `apps/daemon/internal/panel/client.go` — register(pairingToken) → credentials, sendHeartbeat(payload) → 204/401, sendStateChange(event) → 204/401
- [X] T022 [US1] Implement exponential backoff retry in `apps/daemon/internal/panel/retry.go` — retry with 2s, 4s, 8s, 16s, 30s cap, stop on 401 (revoked), retry on 5xx and network errors
- [X] T023 [US1] Implement system resource collector in `apps/daemon/internal/heartbeat/collector.go` — CPU usage (load average or cgroup), memory usage, disk usage (volume base path), container count (Docker API)
- [X] T024 [US1] Implement heartbeat loop in `apps/daemon/internal/heartbeat/loop.go` — tick at configured interval, collect resources, send heartbeat, set dockerAvailable=false if Docker unreachable, stop on 401 or shutdown signal
- [X] T025 [US1] Implement daemon entry point in `apps/daemon/cmd/daemon/main.go` — load config, register or load stored credentials, start heartbeat loop, start HTTP server, handle SIGTERM/SIGINT graceful shutdown
- [X] T026 [US1] Implement graceful shutdown in `apps/daemon/cmd/daemon/main.go` — on SIGTERM/SIGINT: stop heartbeat loop, stop HTTP server, stop managed containers (unless configured to keep running), exit cleanly
- [X] T027 [US1] Update HeartbeatPayloadSchema with `dockerAvailable` field in `packages/shared/src/node/heartbeat.ts` (if not already done in R4 reconciliation)
- [X] T028 [US1] Update NodeStatusSchema with `"degraded"` status in `packages/shared/src/node/node.ts` (if not already done in R4 reconciliation)

### Step 3: Verify with unit/integration tests

- [X] T029 [US1] Run `cd apps/daemon && go test ./internal/panel/ ./internal/heartbeat/ -v` — all tests must pass

### Step 4: MCP verification (chrome-devtools, acting as real user)

- [X] T030 [US1] Start dev services: `bun dev:services` + `bun --filter @sigil/db db:migrate` + `bun --filter @sigil/api db:seed` + API on :3000
- [X] T031 [US1] Generate a pairing token via the panel UI using chrome-devtools MCP — login as admin, navigate to nodes page, generate pairing token, copy token value
- [X] T032 [US1] Start the daemon with the pairing token against the running panel, verify via MCP that the node appears "online" in the panel UI (navigate to nodes page, check status indicator)
- [X] T033 [US1] Verify via MCP that heartbeats arrive — observe node detail page updating CPU/memory/disk/container count in real-time via SSE
- [X] T034 [US1] Verify via MCP the restart flow — stop daemon, restart it, confirm node goes offline then back online, confirm "using stored credentials" log in daemon output
- [X] T035 [US1] Verify via MCP the panel-unreachable flow — stop the panel, confirm daemon retries with backoff (check daemon logs), restart panel, confirm daemon recovers and heartbeats resume
- [X] T036 [US1] Fix any bugs found during MCP verification

**Checkpoint**: Daemon registers, heartbeats, and appears online in the panel. MCP-verified. MVP is functional.

---

## Phase 4: User Story 2 — Panel Manages Server Container Lifecycle (Priority: P2)

**Goal**: The panel sends server configuration to the daemon, which creates, starts, stops, restarts, and removes Docker containers. All operations are idempotent and validated.

**Independent Test**: Send a create-server request to the daemon with `alpine:latest` + `sleep infinity`, verify the container is created and started, then send stop and remove requests and verify the container is gone.

### Step 1: Unit/Integration Tests (write first, must FAIL)

- [X] T037 [P] [US2] Write server config validation tests in `apps/daemon/internal/server/validate_test.go` — missing image rejected, empty startup command rejected, invalid port range rejected, unsafe startup command rejected, valid config accepted
- [X] T038 [P] [US2] Write lifecycle integration tests in `apps/daemon/internal/docker/lifecycle_test.go` (build tag: integration) — create+start container, stop container, start stopped container, restart container, remove container, idempotent start (running → no-op), idempotent stop (stopped → no-op), cleanup removes anonymous volumes

### Step 2: Implementation

- [X] T039 [US2] Implement server config validation in `apps/daemon/internal/server/validate.go` — validate image non-empty, startup command non-empty, port ranges valid (1-65535), resource limits within bounds, reject unsafe startup commands (no shell injection patterns)
- [X] T040 [US2] Implement Docker lifecycle operations in `apps/daemon/internal/docker/lifecycle.go` — CreateContainer (with labels, volume bind, port mappings, resource limits, hardening), StartContainer, StopContainer (SIGTERM + timeout → SIGKILL), RestartContainer, RemoveContainer (stop + remove + cleanup)
- [X] T041 [US2] Implement image pull in `apps/daemon/internal/docker/lifecycle.go` — check if image exists locally (ImageList), pull if missing (ImagePull), return IMAGE_PULL_FAILED error on failure
- [X] T042 [US2] Implement server manager in `apps/daemon/internal/server/manager.go` — in-memory map of ServerEntry, per-server mutex (serialize ops on same server, parallel on different), add/remove/lookup by UUID, reconcile from Docker on startup (list containers with sigil.server-id label)
- [X] T043 [US2] Implement HTTP handlers in `apps/daemon/internal/api/handlers.go` — POST /servers (create), POST /servers/:id/start, POST /servers/:id/stop, POST /servers/:id/restart, DELETE /servers/:id, GET /servers/:id, GET /servers, GET /health
- [X] T044 [US2] Implement HTTP router in `apps/daemon/internal/api/router.go` — net/http with Go 1.22+ pattern routing, apply auth middleware to all routes except /health, JSON response helpers in `apps/daemon/internal/api/response.go`
- [X] T045 [US2] Implement disk full check in `apps/daemon/internal/server/manager.go` — refuse new server creation when disk usage exceeds configured threshold, return DISK_FULL error
- [X] T046 [US2] Write server manager tests in `apps/daemon/internal/server/manager_test.go` — per-server locking serializes ops, different servers run in parallel, missing server returns 404, reconcile from Docker labels
- [X] T047 [US2] Implement panel-side daemon client in `apps/api/src/services/daemon-client.service.ts` — sign and send lifecycle commands to daemon (create, start, stop, restart, remove), decrypt node secret, use computeSignature for HMAC

### Step 3: Verify with unit/integration tests

- [X] T048 [US2] Run `cd apps/daemon && go test ./internal/server/ ./internal/docker/ -v` — all unit + integration tests must pass (integration tests need Docker running)
- [X] T049 [US2] Run `bun run test` — panel-side daemon client tests must pass

### Step 4: MCP verification (chrome-devtools, acting as real user)

- [X] T050 [US2] Start panel + daemon, create a server via the daemon API using `evaluate_script` in chrome-devtools MCP (curl from browser console with HMAC-signed request)
- [X] T051 [US2] Verify via MCP that the container is running — use `evaluate_script` to call `GET /servers/:id` on the daemon and check state is "running"
- [X] T052 [US2] Verify via MCP the full lifecycle — stop, start, restart, remove the server through the daemon API, checking state after each operation
- [X] T053 [US2] Verify via MCP idempotency — start an already-running server (no-op), stop an already-stopped server (no-op)
- [X] T054 [US2] Verify via MCP error cases — create with invalid config (missing image), create with unsafe startup command, verify error responses
- [X] T055 [US2] Verify via MCP that `docker ps --filter label=sigil.server-id=<uuid>` shows the container and `docker ps -a` shows it gone after remove
- [X] T056 [US2] Fix any bugs found during MCP verification

**Checkpoint**: Panel can create, start, stop, restart, and remove game server containers through the daemon. MCP-verified.

---

## Phase 5: User Story 3 — Server Files Are Isolated in a Secure Filesystem Jail (Priority: P3)

**Goal**: Each server has a dedicated directory under a managed volume path. All file operations are resolved through a jail that rejects path traversal and symlink escapes. Archive extraction is protected against zip-slip.

**Independent Test**: Create a server, attempt path traversal attacks (`../../etc/passwd`, symlinks to `/`, archives with `../` paths) through the daemon's file operations, and verify they are all rejected.

### Step 1: Unit/Integration Tests (write first, must FAIL)

- [X] T057 [P] [US3] Write jail tests in `apps/daemon/internal/jail/jail_test.go` — valid path within jail resolves, `../` traversal rejected, symlink to `/etc/passwd` rejected, symlink within jail allowed, cross-server isolation (server A cannot access server B's directory), root path resolves to jail root
- [X] T058 [P] [US3] Write archive extraction tests in `apps/daemon/internal/jail/archive_test.go` — zip with `../` entries rejected (zip-slip), tar with symlink to `/etc` rejected, valid archive extracts within jail, extraction through os.Root for defense in depth

### Step 2: Implementation

- [X] T059 [US3] Implement filesystem jail in `apps/daemon/internal/jail/jail.go` — use Go 1.24+ `os.OpenRoot` for kernel-level path containment (openat2 + RESOLVE_BENEATH), reject paths escaping root, reject symlinks targeting outside jail, provide SafeOpen/SafeRead/SafeWrite/SafeList/SafeDelete helpers
- [X] T060 [US3] Implement safe archive extraction in `apps/daemon/internal/jail/archive.go` — pre-validate each entry path with filepath.IsLocal + EvalSymlinks, reject entries escaping jail, extract through os.Root for defense in depth, support zip and tar formats
- [X] T061 [US3] Integrate jail into server lifecycle in `apps/daemon/internal/server/manager.go` — create volume directory on server create, resolve all file ops through jail, delete volume directory on server remove (recursive, only affects that server's directory)

### Step 3: Verify with unit/integration tests

- [X] T062 [US3] Run `cd apps/daemon && go test ./internal/jail/ -v` — all jail + archive tests must pass including traversal, symlink, and zip-slip attack vectors

### Step 4: MCP verification (chrome-devtools, acting as real user)

- [X] T063 [US3] Start panel + daemon, create a server, then use `evaluate_script` in chrome-devtools MCP to attempt path traversal attacks against the daemon's file API (`../../etc/passwd`, symlink to `/etc/passwd`)
- [X] T064 [US3] Verify via MCP that all traversal attempts are rejected — check daemon response is an error, verify `/etc/passwd` was NOT read (response does not contain file contents)
- [X] T065 [US3] Verify via MCP that valid file operations within the jail work — write a file, read it back, list the directory
- [X] T066 [US3] Verify via MCP that cross-server isolation works — server A cannot read server B's files
- [X] T067 [US3] Verify via MCP that server remove deletes only the target server's volume directory — create two servers, remove one, verify the other's files are intact
- [X] T068 [US3] Fix any bugs found during MCP verification

**Checkpoint**: Server files are isolated. Path traversal, symlink escapes, and zip-slip attacks are blocked. MCP-verified.

---

## Phase 6: User Story 4 — Daemon Reports Server State Changes to the Panel (Priority: P4)

**Goal**: The daemon monitors container state changes via the Docker Events API and reports them to the panel via HMAC-signed HTTP callbacks. If the panel is unreachable, events are queued and retried. On startup, the daemon reconciles actual container states with the panel.

**Independent Test**: Create and start a server, manually kill the container, and verify the panel receives a state change callback marking the server as "crashed" within 5 seconds.

### Step 1: Unit/Integration Tests (write first, must FAIL)

- [X] T069 [P] [US4] Write Docker event monitor tests in `apps/daemon/internal/docker/monitor_test.go` (build tag: integration) — start event detected, die with exit 0 → stopped, die with non-zero → crashed, oom → crashed (reason: oom), destroy → missing, event filter by sigil.server-id label
- [X] T070 [P] [US4] Write state change queue tests in `apps/daemon/internal/server/queue_test.go` — events queued on panel unreachable, events retried with backoff, events dropped on 4xx, events delivered after panel recovery

### Step 2: Implementation

- [X] T071 [US4] Implement Docker event monitor in `apps/daemon/internal/docker/monitor.go` — subscribe to Docker Events API with filter `type=container` + `label=sigil.server-id`, map events to ContainerState (start→running, die exit 0→stopped, die non-zero→crashed, oom→crashed, destroy→missing), emit state changes to a channel
- [X] T072 [US4] Implement state change event queue in `apps/daemon/internal/server/queue.go` — in-memory queue, retry with exponential backoff (2s, 4s, 8s, 16s, 30s cap), drop on 4xx (auth failure, validation error), retry on 5xx and network errors, log dropped events on shutdown
- [X] T073 [US4] Implement state change reporting loop in `apps/daemon/internal/server/manager.go` — consume event channel, enqueue to queue, queue worker sends HMAC-signed POST /api/node/server-state to panel
- [X] T074 [US4] Implement startup reconciliation in `apps/daemon/internal/server/manager.go` — on daemon start, list all containers with sigil.server-id label, inspect each, report current state to panel (previousState: "missing", newState: actual state)
- [X] T075 [US4] Implement panel callback endpoint for state changes in `apps/api/src/routes/server-state.ts` — POST /api/node/server-state, authenticate with nodeAuthMiddleware, validate StateChangeEventSchema, emit `server.state` SSE event, return 204 (no persistence — servers table is R9)
- [X] T076 [US4] Implement server state SSE payload in `apps/api/src/services/server-state.service.ts` — receive state change, emit SSE event with ServerStatePayload to connected admin browsers, log state change
- [X] T077 [US4] Register server-state route in `apps/api/src/index.ts` alongside existing node routes

### Step 3: Verify with unit/integration tests

- [X] T078 [US4] Run `cd apps/daemon && go test ./internal/docker/ ./internal/server/ -v -tags integration` — monitor + queue tests must pass
- [X] T079 [US4] Run `bun run test` — panel-side server-state callback tests must pass

### Step 4: MCP verification (chrome-devtools, acting as real user)

- [X] T080 [US4] Start panel + daemon, create and start a server, then use `evaluate_script` in chrome-devtools MCP to kill the container directly (`docker kill <id>` via daemon API or a test endpoint)
- [X] T081 [US4] Verify via MCP that the panel receives the state change — check the panel UI (node detail or server list) updates to show "crashed" within 5 seconds, verify SSE event was emitted
- [X] T082 [US4] Verify via MCP the panel outage flow — stop the panel, kill a container, restart the panel, verify the daemon delivered queued events and the panel shows the correct state
- [X] T083 [US4] Verify via MCP the startup reconciliation — with a server running, restart the daemon, verify the panel receives reconciliation callbacks and state converges
- [X] T084 [US4] Verify via MCP the "running" and "stopped" state transitions — start a server (verify "running" reported), stop it (verify "stopped" reported)
- [X] T085 [US4] Fix any bugs found during MCP verification

**Checkpoint**: Panel reflects the true state of each server within 5 seconds of the actual state change. MCP-verified.

---

## Phase 7: User Story 5 — All Containers Run with Security Hardening (Priority: P5)

**Goal**: Every container the daemon creates runs with minimal privileges: all Linux capabilities dropped, no-new-privileges set, non-root user, PID limits, resource limits, no Docker socket mount, no privileged mode. These constraints are automatic and cannot be overridden.

**Independent Test**: Create a server and inspect the container's security settings via the Docker API, verifying they match the hardening policy.

### Step 1: Unit/Integration Tests (write first, must FAIL)

- [X] T086 [P] [US5] Write security hardening tests in `apps/daemon/internal/docker/hardening_test.go` (build tag: integration) — CapDrop contains ALL, no-new-privileges set, User is non-root (UID from configured range), PidsLimit set, Memory limit set, NanoCPUs set, Privileged is false, Docker socket not mounted, ReadonlyRootfs true

### Step 2: Implementation

- [X] T087 [US5] Implement security hardening policy in `apps/daemon/internal/docker/hardening.go` — apply to all containers: CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"], User: "<uid>:<gid>" (allocated from configured range), PidsLimit (default 512), Memory (from config), NanoCPUs (from config), ReadonlyRootfs: true (with tmpfs /tmp), Privileged: false (hardcoded), Docker socket: never mounted (hardcoded)
- [X] T088 [US5] Implement UID/GID allocation in `apps/daemon/internal/docker/hardening.go` — allocate unique UID/GID per server from configurable range (default 1000-65535), track allocated UIDs in memory, release on server remove
- [X] T089 [US5] Integrate hardening into container creation in `apps/daemon/internal/docker/lifecycle.go` — apply hardening policy automatically in CreateContainer, make non-overridable (ignore any user-supplied security settings that conflict)

### Step 3: Verify with unit/integration tests

- [X] T090 [US5] Run `cd apps/daemon && go test ./internal/docker/ -v -tags integration -run TestHardening` — all hardening tests must pass

### Step 4: MCP verification (chrome-devtools, acting as real user)

- [X] T091 [US5] Start panel + daemon, create a server, then use `evaluate_script` in chrome-devtools MCP to inspect the container's security settings via `docker inspect`
- [X] T092 [US5] Verify via MCP that CapDrop is [ALL], SecurityOpt includes no-new-privileges, User is non-root (UID from configured range), PidsLimit is set, Memory is set, Privileged is false, Docker socket is NOT mounted, ReadonlyRootfs is true
- [X] T093 [US5] Verify via MCP that memory limit is enforced — create a container that exceeds its memory limit, verify it is OOM-killed and the panel is notified
- [X] T094 [US5] Fix any bugs found during MCP verification

**Checkpoint**: All containers run with security hardening. No privilege escalation, no Docker socket access, non-root users, resource limits enforced. MCP-verified.

---

## Phase 8: Playwright E2E Regression Tests

**Purpose**: Codify all MCP-verified behavior as permanent regression tests. These are NOT the primary discovery mechanism — bugs were already found and fixed via MCP. These tests ensure behavior doesn't regress in CI.

- [X] T095 [P] Write E2E test for US1 in `apps/panel/tests/e2e/daemon-registration.spec.ts` — daemon registers with pairing token, node appears online, heartbeats update resource stats, daemon restart uses stored credentials
- [X] T096 [P] Write E2E test for US2 in `apps/panel/tests/e2e/server-lifecycle.spec.ts` — create server, verify running, stop, start, restart, remove, verify idempotency, verify invalid config rejected
- [X] T097 [P] Write E2E test for US4 in `apps/panel/tests/e2e/server-state-reporting.spec.ts` — kill container, verify panel shows "crashed" via SSE, verify startup reconciliation, verify panel outage queue delivery
- [X] T098 Run `bun run test:e2e` — all E2E tests must pass

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: CI, docs, and final validation across all user stories.

- [X] T099 [P] Create daemon Makefile in `apps/daemon/Makefile` — targets: build, test (unit), test-integration (with Docker), lint (golangci-lint or go vet)
- [X] T100 [P] Create daemon Dockerfile in `apps/daemon/Dockerfile` — multi-stage build for development
- [X] T101 [P] Add schema compatibility test in `apps/daemon/internal/server/types_test.go` — serialize Go structs to JSON, validate against Zod schemas via a Node script, fail on drift
- [X] T102 Update CI workflow in `.github/workflows/ci.yml` — add Go build + test job, run daemon unit tests, run integration tests with Docker available in CI runner
- [X] T103 Update AGENTS.md with daemon build/test commands and Go project structure
- [X] T104 Update ROADMAP.md — mark R6 as `in-progress` when implementation starts, `done` when tests pass and quickstart scenarios validated
- [X] T105 Run quickstart.md validation scenarios 1-6 end-to-end against a running panel + daemon
- [X] T106 Verify all security regression tests pass — path traversal, symlink escape, zip-slip, cap_drop, no Docker socket, non-root user, no privileged mode

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - Each US follows: tests first (FAIL) → implementation → unit tests pass → MCP verification → bug fixes
  - US1 (P1): No dependencies on other stories — MVP
  - US2 (P2): Depends on US1 (daemon must be running and registered to accept commands)
  - US3 (P3): Depends on US2 (jail protects files of servers created by US2)
  - US4 (P4): Depends on US2 (monitors containers created by US2) and panel callback endpoint
  - US5 (P5): Depends on US2 (hardening applied to containers created by US2)
- **Playwright E2E (Phase 8)**: Depends on ALL user stories being MCP-verified — codifies verified behavior
- **Polish (Phase 9)**: Depends on all user stories + E2E tests being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational — Integrates with US1 (daemon must be registered)
- **User Story 3 (P3)**: Can start after US2 (needs server lifecycle to create volume directories)
- **User Story 4 (P4)**: Can start after US2 (needs containers to monitor) — panel callback can be built in parallel
- **User Story 5 (P5)**: Can start after US2 (hardening applied during container creation)

### Within Each User Story

1. **Tests first** — write tests, ensure they FAIL before implementation
2. **Implementation** — types → services → handlers/endpoints → integration
3. **Unit/integration tests pass** — `go test` for daemon, `bun run test` for panel
4. **MCP verification** — start dev services, use chrome-devtools MCP to act as a real user, verify happy paths + error paths + security-sensitive flows
5. **Fix bugs** — fix anything broken found during MCP verification
6. **Checkpoint** — story is MCP-verified before moving to next

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002-T007)
- All Foundational tests marked [P] can run in parallel (T010, T012, T014, T016)
- US1 tests (T019, T020) can run in parallel
- US2 tests (T037, T038) can run in parallel
- US3 tests (T057, T058) can run in parallel
- US4 tests (T069, T070) can run in parallel
- US5 tests (T086) can run in parallel
- Panel callback endpoint (T075-T077) can be built in parallel with daemon-side US4 work
- Playwright E2E tests (T095-T097) can run in parallel
- Polish tasks marked [P] can run in parallel (T099-T101)

---

## Parallel Example: User Story 1

```bash
# Step 1: Launch all tests for US1 together (write first, must FAIL):
Task: "Write panel client tests in apps/daemon/internal/panel/client_test.go"
Task: "Write resource collector tests in apps/daemon/internal/heartbeat/collector_test.go"

# Step 2: Implementation (sequential — main.go depends on client + heartbeat):
Task: "Implement panel client in apps/daemon/internal/panel/client.go"
Task: "Implement retry in apps/daemon/internal/panel/retry.go"
Task: "Implement resource collector in apps/daemon/internal/heartbeat/collector.go"
Task: "Implement heartbeat loop in apps/daemon/internal/heartbeat/loop.go"
Task: "Implement entry point in apps/daemon/cmd/daemon/main.go"

# Step 3: Run unit tests — must pass
# Step 4: MCP verification — start dev services, use chrome-devtools MCP to verify
# Step 5: Fix bugs found during MCP
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (tests → implementation → unit pass → MCP verify → fix)
4. **STOP and VALIDATE**: MCP-verify daemon registers + heartbeats + node online
5. Demo: operator installs daemon, node shows online in panel

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Daemon registers + heartbeats → MCP-verified MVP demo
3. US2 → Container lifecycle → MCP-verified core demo
4. US3 → Filesystem jail → MCP-verified security demo
5. US4 → State reporting → MCP-verified real-time demo
6. US5 → Security hardening → MCP-verified security audit demo
7. Playwright E2E → Regression tests codifying all MCP-verified behavior
8. Polish → CI, docs, quickstart validation → Production-ready

### Verification Flow Per User Story (MCP-first, Playwright-last)

```
1. Write unit/integration tests (must FAIL)
2. Implement code
3. Run unit/integration tests — must pass
4. Start dev services (bun dev:services + db:migrate + db:seed + API + daemon)
5. Open chrome-devtools MCP → navigate to panel
6. Exercise the full user flow as a real user:
   - Happy path: create/start/stop/remove, verify state in UI
   - Error paths: invalid config, missing server, auth failure
   - Security flows: path traversal, symlink escape, hardening inspection
   - State transitions: crash detection, SSE updates, reconciliation
7. Fix any bugs found
8. Re-verify with MCP
9. Move to next user story
10. After ALL stories MCP-verified → write Playwright E2E regression tests
11. Run bun run test:e2e — must pass
12. Commit
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story follows: tests → implementation → unit pass → MCP verify → fix
- Playwright E2E tests are written LAST, after all MCP verification is done
- Integration tests require Docker running (Constitution Principle IV — no Docker mocks)
- The daemon is Go — no TypeScript in `apps/daemon/` except schema compatibility test scripts
- Shared schemas in `packages/shared` are the source of truth (Constitution Principle II)
- Security hardening is non-negotiable and automatic (Constitution Principle III)
- MCP verification is the primary bug discovery mechanism — Playwright is regression only
