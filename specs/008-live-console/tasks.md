# Tasks: Live Console

**Input**: Design documents from `/specs/008-live-console/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per AGENTS.md verification workflow (unit/integration + E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared contracts, new dependencies, and daemon infrastructure needed by all user stories.

- [X] T001 [P] Add console message schemas to `packages/shared/src/console/message.ts` — ConsoleOutputMessageSchema, ConsoleCommandMessageSchema, ServerStatsMessageSchema, ConsoleErrorMessageSchema, DaemonToBrowserMessageSchema (discriminated union), BrowserToDaemonMessageSchema (per data-model.md)
- [X] T002 [P] Add console token payload schema to `packages/shared/src/console/token.ts` — ConsoleTokenPayloadSchema, ConsoleTokenResponseSchema (per data-model.md)
- [X] T003 Re-export console schemas from `packages/shared/src/index.ts` — add `export * from "./console/message"` and `export * from "./console/token"`
- [X] T004 [P] Add `jose` dependency to `apps/api/package.json` — JWT signing library (per research.md decision 2)
- [X] T005 [P] Add `gorilla/websocket` and `golang-jwt/jwt/v5` to `apps/daemon/go.mod` — WebSocket server + JWT validation (per research.md decisions 1, 3)
- [X] T006 [P] Add `app_secret` field to daemon config in `apps/daemon/cmd/daemon/config.go` and `apps/daemon/internal/config/` — shared secret for JWT verification (per research.md decision 6)
- [X] T007 [P] Add `APP_SECRET` env var to E2E daemon config in `scripts/run-e2e.ts` — pass app_secret to daemon config YAML

**Checkpoint**: Shared contracts and dependencies ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: JWT issuance and daemon WebSocket infrastructure that MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 Implement console token signing in `apps/api/src/lib/console-token.ts` — signConsoleToken(serverId, userId) using jose HS256 with APP_SECRET, 5 min expiry, scope "console"
- [X] T009 Implement console token route in `apps/api/src/routes/console-token.ts` — POST /api/admin/servers/:serverId/console-token, validate admin session, check server exists and is running (409 if not), return { token, daemonUrl, serverId, expiresIn }
- [X] T010 Mount console-token route in `apps/api/src/index.ts` — add to admin routes under /api/admin/servers/:serverId/console-token
- [X] T011 Write console token route tests in `apps/api/src/routes/console-token.spec.ts` — token issued for running server (200), 404 for non-existent server, 409 for stopped server, 401 for unauthenticated, 403 for non-admin
- [X] T012 Implement JWT validation in daemon `apps/daemon/internal/auth/jwt.go` — ValidateConsoleToken(token, serverId, appSecret) verifies HS256 signature, checks exp, scope, serverId match
- [X] T013 Implement WebSocket upgrade handler in `apps/daemon/internal/console/handler.go` — HTTP handler that upgrades to WebSocket, validates JWT from query param, rejects invalid tokens with 401
- [X] T014 Implement console session manager in `apps/daemon/internal/console/manager.go` — per-server session: attach to container stdout/stderr via Docker API, maintain in-memory ring buffer (1000 lines), stream output to connected clients, write stdin commands to container
- [X] T015 Implement per-container stats collector in `apps/daemon/internal/console/stats.go` — collect CPU/memory/disk via Docker ContainerStats API every 5 seconds, send as ServerStats messages
- [X] T016 Register WebSocket route in `apps/daemon/internal/api/router.go` — add GET /ws/servers/{serverId}/console route (no HMAC auth, JWT-based instead)
- [X] T017 Write daemon console unit tests in `apps/daemon/internal/console/manager_test.go` — buffer management, message serialization, session lifecycle

**Checkpoint**: JWT issuance + daemon WebSocket infrastructure ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Admin views live server console (Priority: P1) 🎯 MVP

**Goal**: Admin opens a running server's console and sees real-time stdout/stderr streaming from the container.

**Independent Test**: Start a server, open its console in the panel, verify output appears in real time.

### Implementation for User Story 1

- [X] T018 [P] [US1] Create useConsoleToken hook in `apps/panel/src/hooks/useConsoleToken.ts` — fetch JWT from POST /api/admin/servers/:serverId/console-token, return { token, daemonUrl, isLoading, error }
- [X] T019 [P] [US1] Create useConsole hook in `apps/panel/src/hooks/useConsole.ts` — WebSocket connection to daemonUrl with token, auto-reconnect with exponential backoff (1s,2s,4s,8s,16s,max 30s), parse DaemonToBrowserMessage, expose { messages, connectionState, sendMessage }
- [X] T020 [US1] Create console-view component in `apps/panel/src/components/servers/console-view.tsx` — scrollable <pre> output area, auto-scroll to bottom on new output (unless user scrolled up), color-code stdout (white) and stderr (red), connection state indicator, truncate at 10000 lines
- [X] T021 [US1] Add console tab to server detail page in `apps/panel/src/routes/server-detail.tsx` — tab or section showing console-view when server is running, "server is not running" indicator when stopped
- [X] T022 [US1] MCP verification — start dev services, create + start a server, open console in panel, verify real-time output streaming, verify "not running" indicator for stopped server, verify auto-reconnect on daemon restart
- [X] T023 [US1] Add E2E test for console viewing in `apps/panel/tests/e2e/console.spec.ts` — create + start server, open console, verify output appears, verify "not running" indicator for stopped server

**Checkpoint**: Admin can view live console output. MVP delivered.

---

## Phase 4: User Story 2 - Admin sends commands to the console (Priority: P2)

**Goal**: Admin types commands into the console input and they are sent to the container stdin.

**Independent Test**: Open a running server's console, type a command, verify the server receives it.

### Implementation for User Story 2

- [X] T024 [US2] Add command input to console-view component in `apps/panel/src/components/servers/console-view.tsx` — text input below output area, disabled when server not running or disconnected, Enter sends command via useConsole.sendMessage, max 4096 chars
- [X] T025 [US2] Add command echo to console output in `apps/panel/src/components/servers/console-view.tsx` — display sent commands in the output with a distinct style (e.g., prefix "> ")
- [X] T026 [US2] MCP verification — type a command in the console, verify it appears in output, verify input is disabled when server is stopped
- [X] T027 [US2] Add E2E test for command sending in `apps/panel/tests/e2e/console.spec.ts` — open console for running server, type a command, verify it appears in output, verify input disabled for stopped server

**Checkpoint**: Admin can send commands to the server via console.

---

## Phase 5: User Story 3 - Admin views server resource stats (Priority: P3)

**Goal**: Admin sees real-time CPU, memory, and disk usage on the server detail page.

**Independent Test**: Start a server, view its detail page, verify stats update every 5 seconds.

### Implementation for User Story 3

- [X] T028 [P] [US3] Create server-stats component in `apps/panel/src/components/servers/server-stats.tsx` — display CPU %, memory (used/limit), disk (used/limit), update from WebSocket stats messages, show "not available" when disconnected
- [X] T029 [US3] Add stats panel to server detail page in `apps/panel/src/routes/server-detail.tsx` — render server-stats component alongside console, pass stats from useConsole hook
- [X] T030 [US3] MCP verification — view server detail page, verify stats display and update every 5 seconds, verify "not available" when server stopped
- [X] T031 [US3] Add E2E test for stats display in `apps/panel/tests/e2e/console.spec.ts` — open server detail, verify stats panel is visible, verify values are numeric or "not available"

**Checkpoint**: Admin can view real-time resource stats.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T032 [P] Add `APP_SECRET` to CI workflow env in `.github/workflows/ci.yml` — ensure daemon has app_secret in E2E job
- [X] T033 [P] Update test-cleanup in `apps/api/src/routes/test-cleanup.ts` — no new tables to clean, but verify console tokens don't leave state
- [X] T034 Run `bun run check` (lint + format) and fix any issues
- [X] T035 Run `bun run typecheck` and fix any type errors
- [X] T036 Run `bun run test` and ensure all unit/integration tests pass
- [X] T037 Run `go test ./internal/... -short` in `apps/daemon` and ensure all daemon unit tests pass
- [X] T038 Run `bun run test:e2e` and ensure all E2E tests pass (including new console tests)
- [X] T039 Run quickstart.md validation scenarios end-to-end
- [X] T040 Update ROADMAP.md to mark R10 as `done`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (console viewing) is the MVP — implement first
  - US2 (commands) builds on US1 (same console-view component)
  - US3 (stats) is independent but uses the same WebSocket connection
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational only — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (extends console-view component with input)
- **User Story 3 (P3)**: Depends on Foundational only — can run in parallel with US1/US2

### Within Each User Story

- Hooks before components
- Components before page integration
- MCP verification before E2E tests
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T001/T002 (different files), T004/T005/T006/T007 (different packages)
- Foundational: T008 (API) in parallel with T012-T015 (daemon), T011 (API tests) after T009
- US1: T018/T019 (different hook files)
- US3: T028 (stats component) in parallel with US1/US2 work

---

## Parallel Example: Setup Phase

```bash
# Launch all setup tasks together (different files):
Task: "Add console message schemas to packages/shared/src/console/message.ts"
Task: "Add console token payload schema to packages/shared/src/console/token.ts"
Task: "Add jose dependency to apps/api/package.json"
Task: "Add gorilla/websocket to apps/daemon/go.mod"
```

## Parallel Example: Foundational Phase

```bash
# API-side and daemon-side can proceed in parallel:
Task: "Implement console token signing in apps/api/src/lib/console-token.ts"
Task: "Implement JWT validation in apps/daemon/internal/auth/jwt.go"
Task: "Implement console session manager in apps/daemon/internal/console/manager.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared schemas + dependencies)
2. Complete Phase 2: Foundational (JWT issuance + daemon WebSocket)
3. Complete Phase 3: User Story 1 (console viewing)
4. **STOP and VALIDATE**: Test console viewing independently via MCP + E2E
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 → Test independently → MVP! (admin can view console)
3. Add US2 → Test independently → Admin can send commands
4. Add US3 → Test independently → Admin can view stats
5. Polish → All checks pass, ROADMAP updated

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 depends on US1 (extends console-view with input)
- US3 is independent but shares the WebSocket connection from useConsole
- Daemon tasks (Go) and API/panel tasks (TS) can proceed in parallel during Foundational
- No database changes needed — all console data is in-memory
- New dependencies: `jose` (API), `gorilla/websocket` + `golang-jwt/jwt/v5` (daemon)
