# Tasks: Server Lifecycle

**Input**: Design documents from `/specs/007-server-lifecycle/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included following the project's TDD workflow (Vitest integration + Playwright E2E + MCP verification).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **API**: `apps/api/src/`
- **Panel**: `apps/panel/src/`
- **Shared**: `packages/shared/src/`
- **DB**: `packages/db/src/`
- **E2E**: `apps/panel/tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared contracts, database schema, and SSE event types needed by all user stories.

- [ ] T001 Add server record schemas to `packages/shared/src/server/record.ts` — ServerStatusEnum, ServerRecordSchema, ServerCreateInputSchema, ServerListResponseSchema, ServerPowerActionSchema (per data-model.md)
- [ ] T002 [P] Add server SSE event types and payloads to `packages/shared/src/sse/events.ts` — server.create, server.update, server.delete (per data-model.md)
- [ ] T003 [P] Re-export server record schemas from `packages/shared/src/index.ts` — add `export * from "./server/record"`
- [ ] T004 Create servers table in `packages/db/src/schema/servers.ts` — id, name, nodeId, templateId, allocationId, status, config JSONB, createdAt, updatedAt, unique(nodeId, name), indexes (per data-model.md)
- [ ] T005 Export servers table from `packages/db/src/schema/index.ts` — add `export * from "./servers"`
- [ ] T006 Generate Drizzle migration for servers table — `bun --filter @sigilpanel/db db:generate`
- [ ] T007 [P] Update test-cleanup endpoint in `apps/api/src/routes/test-cleanup.ts` — delete servers before allocations/nodes cleanup
- [ ] T008 [P] Update test-cleanup helper in `apps/api/src/test/helpers.ts` — add cleanupServers() helper

**Checkpoint**: Shared contracts, DB schema, and test infrastructure ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server service layer that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T009 Implement server.service.ts in `apps/api/src/services/server.service.ts` — createServer (validate node/template/allocations, auto-assign allocation via R7, build ServerConfiguration from template, create record, dispatch to daemon), getServer, listServers (with filters: nodeId, status, pagination), deleteServer (daemon cleanup + release allocations + delete record), powerAction (validate state transition, send to daemon, update status), updateServerState (from daemon reports, map ContainerState → panel status)
- [ ] T010 Write server.service.spec.ts in `apps/api/src/services/server.service.spec.ts` — integration tests for create, list, get, delete, power actions, state transitions, allocation integration, error cases

**Checkpoint**: Server service ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Admin creates a server (Priority: P1) 🎯 MVP

**Goal**: Admin can create a server via the panel — panel creates the record, auto-assigns an allocation, and instructs the daemon to create the container.

**Independent Test**: Admin creates a server via the panel UI, verify it appears in the servers list with status "offline", verify a primary allocation was assigned, verify the daemon created the container.

### Implementation for User Story 1

- [ ] T011 [US1] Refactor POST /api/admin/servers route in `apps/api/src/routes/servers.ts` — use ServerCreateInputSchema (name, nodeId, templateId, variables), call server.service.createServer, return ServerRecord, emit server.create SSE event
- [ ] T012 [US1] Refactor GET /api/admin/servers route in `apps/api/src/routes/servers.ts` — use server.service.listServers with nodeId/status/limit/offset query params, return ServerListResponse
- [ ] T013 [US1] Refactor GET /api/admin/servers/:serverId route in `apps/api/src/routes/servers.ts` — use server.service.getServer, return ServerRecord or 404
- [ ] T014 [US1] Write route tests in `apps/api/src/routes/servers.spec.ts` — create success, create no allocations (409), create node unreachable (502), create duplicate name (409), create inactive template (409), list with filters, get by id, get not found (404)
- [ ] T015 [US1] Mount servers routes in `apps/api/src/index.ts` — ensure /api/admin/servers is mounted (may already be mounted, verify)
- [ ] T016 [P] [US1] Add useServers, useServer, useCreateServer hooks to `apps/panel/src/hooks/useServers.ts` — useServers(nodeId?, status?) with query keys, useCreateServer mutation with invalidation
- [ ] T017 [US1] Add server SSE invalidation to panel SSE hook in `apps/panel/src/hooks/useSSE.ts` — invalidate ["servers"] and ["server", serverId] on server.create/update/delete events
- [ ] T018 [P] [US1] Create server-create-dialog component in `apps/panel/src/components/servers/server-create-dialog.tsx` — name input, node dropdown, template dropdown (active only), variable inputs, submit button
- [ ] T019 [US1] Create server-list component in `apps/panel/src/components/servers/server-list.tsx` — table with name, node, status, template, filter by status, link to detail
- [ ] T020 [US1] Create servers list page in `apps/panel/src/routes/servers.tsx` — Layout, server-list, create button with server-create-dialog
- [ ] T021 [US1] Add servers route to TanStack Router in `apps/panel/src/router.ts` (or wherever routes are registered) — /servers path
- [ ] T022 [US1] Add "Servers" navigation link to Layout in `apps/panel/src/components/Layout.tsx`
- [ ] T023 [US1] MCP verification — start dev services, create a server via panel UI, verify it appears in the list with status "offline", verify allocation assigned on node detail page, verify daemon created the container
- [ ] T024 [US1] Add E2E test for server creation in `apps/panel/tests/e2e/server-lifecycle.spec.ts` — create server via panel, verify in list, verify allocation assigned

**Checkpoint**: Admin can create a server and see it in the list. MVP delivered.

---

## Phase 4: User Story 2 - Admin controls server power state (Priority: P2)

**Goal**: Admin can start, stop, and restart a server. State transitions update in real-time via SSE.

**Independent Test**: Admin creates a server, starts it, verifies status changes to "running", stops it, verifies "stopped", restarts it, verifies "running".

### Implementation for User Story 2

- [ ] T025 [US2] Refactor POST /api/admin/servers/:serverId/power route in `apps/api/src/routes/servers.ts` — accept ServerPowerActionSchema (start/stop/restart), call server.service.powerAction, return { serverId, status }, emit server.update SSE
- [ ] T026 [US2] Update server-state.ts route in `apps/api/src/routes/server-state.ts` — call server.service.updateServerState to persist state, emit server.update SSE event (currently only emits raw server.state)
- [ ] T027 [US2] Add power action tests to `apps/api/src/routes/servers.spec.ts` — start from offline, stop from running, restart from running, invalid transition (409), node unreachable (502)
- [ ] T028 [P] [US2] Add usePowerAction hook to `apps/panel/src/hooks/useServers.ts` — mutation for POST /:serverId/power, invalidate server + servers queries on success
- [ ] T029 [US2] Create server-detail component in `apps/panel/src/components/servers/server-detail.tsx` — server info (name, node, template, allocation, status), power buttons (Start/Stop/Restart) with state-aware disabled logic
- [ ] T030 [US2] Create server detail page in `apps/panel/src/routes/server-detail.tsx` — Layout, server-detail component, SSE-driven refresh
- [ ] T031 [US2] Add server detail route to TanStack Router — /servers/:serverId path
- [ ] T032 [US2] MCP verification — start a server via panel, verify status transitions to "running" via SSE (no reload), stop it, verify "stopped", restart, verify "running"
- [ ] T033 [US2] Add E2E test for power actions in `apps/panel/tests/e2e/server-lifecycle.spec.ts` — start, verify running, stop, verify stopped, restart, verify running

**Checkpoint**: Admin can control server power state with real-time SSE updates.

---

## Phase 5: User Story 3 - Admin deletes a server (Priority: P3)

**Goal**: Admin can delete a server — daemon removes container+volume, allocations released, record deleted, SSE update.

**Independent Test**: Admin creates a server, deletes it, verify container removed on daemon, verify allocations released, verify server disappears from list.

### Implementation for User Story 3

- [ ] T034 [US3] Refactor DELETE /api/admin/servers/:serverId route in `apps/api/src/routes/servers.ts` — call server.service.deleteServer (daemon cleanup + release allocations + delete record), emit server.delete SSE, return 204
- [ ] T035 [US3] Add deletion tests to `apps/api/src/routes/servers.spec.ts` — delete success (204), delete releases allocations, delete node unreachable (502), delete not found (404)
- [ ] T036 [P] [US3] Add useDeleteServer hook to `apps/panel/src/hooks/useServers.ts` — mutation for DELETE /:serverId, invalidate servers query on success
- [ ] T037 [US3] Add delete button with confirmation to server-detail component in `apps/panel/src/components/servers/server-detail.tsx` — confirm dialog, call useDeleteServer, navigate to /servers on success
- [ ] T038 [US3] MCP verification — delete a server via panel, verify it disappears from list (SSE), verify allocations released on node detail page, verify container removed on daemon
- [ ] T039 [US3] Add E2E test for server deletion in `apps/panel/tests/e2e/server-lifecycle.spec.ts` — create server, delete via panel, verify removed from list, verify allocations released

**Checkpoint**: Admin can delete servers with full cleanup.

---

## Phase 6: User Story 4 - Server list and detail view (Priority: P4)

**Goal**: Admin can view all servers, filter by node/status, and see server detail with real-time SSE updates.

**Independent Test**: Admin navigates to servers page, sees all servers, filters by status, clicks one, sees detail page with power controls.

### Implementation for User Story 4

- [ ] T040 [US4] Add status filter dropdown to server-list component in `apps/panel/src/components/servers/server-list.tsx` — all/offline/starting/running/stopping/stopped/crashed/creation_failed
- [ ] T041 [US4] Add node filter dropdown to server-list component in `apps/panel/src/components/servers/server-list.tsx` — distinct nodes from server list
- [ ] T042 [US4] Add server summary counts to servers page in `apps/panel/src/routes/servers.tsx` — total, running, stopped, crashed counts
- [ ] T043 [US4] Add filter tests to `apps/api/src/routes/servers.spec.ts` — filter by status, filter by nodeId, combined filters, pagination
- [ ] T044 [US4] MCP verification — create multiple servers on different nodes, filter by status, filter by node, verify correct subset, verify SSE updates list in real-time
- [ ] T045 [US4] Add E2E test for filtering in `apps/panel/tests/e2e/server-lifecycle.spec.ts` — create servers, filter by status, filter by node, verify correct subset displayed

**Checkpoint**: Server list and detail page fully functional with filtering and real-time updates.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] T046 [P] Update test-cleanup to handle server-allocation relationships in `apps/api/src/routes/test-cleanup.ts` — ensure servers are deleted before allocations
- [ ] T047 [P] Add audit log entries for all server lifecycle actions in `apps/api/src/services/server.service.ts` — create, start, stop, restart, delete (verify existing audit calls in routes are updated to service)
- [ ] T048 Run `bun run check` (lint + format) and fix any issues
- [ ] T049 Run `bun run typecheck` and fix any type errors
- [ ] T050 Run `bun run test` and ensure all unit/integration tests pass
- [ ] T051 Run `bun run test:e2e` and ensure all E2E tests pass (including new server lifecycle tests)
- [ ] T052 Run quickstart.md validation scenarios end-to-end
- [ ] T053 Update ROADMAP.md to mark R9 as `done` (in the same commit that completes the last task)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3) is the MVP — must complete first
  - US2 (Phase 4) depends on US1 (needs server to exist to control power)
  - US3 (Phase 5) depends on US1 (needs server to exist to delete)
  - US4 (Phase 6) depends on US1 (needs servers to list/filter)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **US2 (P2)**: Depends on US1 (server must exist to control power)
- **US3 (P3)**: Depends on US1 (server must exist to delete)
- **US4 (P4)**: Depends on US1 (servers must exist to list/filter)

### Within Each User Story

- Routes before hooks (hooks call routes)
- Hooks before components (components use hooks)
- Components before pages (pages compose components)
- MCP verification before E2E tests (verify interactively first, codify second)

### Parallel Opportunities

- Setup: T002/T003/T007/T008 (independent files)
- US1: T016/T018 (hooks + create dialog, different files)
- US2: T028 (hook) parallel with T029 (component)
- US3: T036 (hook) parallel with T037 (component)
- Polish: T046/T047 (different files)

---

## Parallel Example: User Story 1

```bash
# Launch hooks and dialog in parallel (different files):
Task: "Add useServers, useServer, useCreateServer hooks to apps/panel/src/hooks/useServers.ts"
Task: "Create server-create-dialog component in apps/panel/src/components/servers/server-create-dialog.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared contracts, DB schema)
2. Complete Phase 2: Foundational (server service)
3. Complete Phase 3: User Story 1 (create + list servers)
4. **STOP and VALIDATE**: Test server creation independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently → MVP (admin can create and list servers)
3. Add US2 → Test independently → Admin can control power state
4. Add US3 → Test independently → Admin can delete servers
5. Add US4 → Test independently → Admin can filter and view details
6. Polish → All checks pass, ROADMAP updated

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- MCP verification MUST happen before Playwright E2E tests (Constitution Principle IV)
- The existing `servers.ts` route is a daemon proxy — R9 refactors it to be panel-owned
- The existing `server-state.ts` route only emits SSE — R9 adds DB persistence
- The existing R6 E2E test (`server-lifecycle.spec.ts`) tests the daemon proxy — R9 replaces it with the panel-owned flow
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
