# Tasks: Allocations

**Input**: Design documents from `/specs/006-allocations/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per Constitution Principle IV (Test Against Real Infrastructure). Unit/integration tests use Vitest + Testcontainers PostgreSQL, E2E tests use Playwright after MCP verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared schemas**: `packages/shared/src/allocation/`
- **DB schema**: `packages/db/src/schema/`
- **API routes**: `apps/api/src/routes/`
- **API services**: `apps/api/src/services/`
- **Panel components**: `apps/panel/src/components/allocations/`
- **Panel hooks**: `apps/panel/src/hooks/`
- **Panel pages**: `apps/panel/src/routes/`
- **E2E tests**: `apps/panel/tests/e2e/`
- **API tests**: `apps/api/src/routes/*.spec.ts` and `apps/api/src/services/*.spec.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared schemas, DB tables, and SSE event extensions that all user stories depend on.

- [X] T001 [P] Create AllocationSchema, AllocationCreateSchema (ip, portStart, portEnd, protocol), AllocationAssignSchema (serverId, isPrimary), AllocationStatusSchema, ProtocolSchema in `packages/shared/src/allocation/allocation.ts`
- [X] T002 [P] Create AllocationSummarySchema (total, available, assigned, primaryIp) in `packages/shared/src/allocation/allocation.ts`
- [X] T003 Create `packages/shared/src/allocation/index.ts` re-exporting all allocation schemas (depends on T001, T002)
- [X] T004 Update `packages/shared/src/index.ts` to export from `./allocation/index` (depends on T003)
- [X] T005 Update `packages/shared/src/sse/events.ts` to add `allocation.create`, `allocation.update`, `allocation.delete` event types and payload schemas (AllocationCreatePayloadSchema, AllocationDeletePayloadSchema) (depends on T001)
- [X] T006 [P] Create allocations table in `packages/db/src/schema/allocations.ts` — id, nodeId (FK → nodes ON DELETE CASCADE), ip, port (CHECK 1-65535), protocol (default tcp, CHECK tcp/udp), status (default available, CHECK available/assigned), serverId (nullable), isPrimary (default false), createdAt, updatedAt; unique constraint on (nodeId, ip, port, protocol); indexes on (nodeId, status), (nodeId, ip), (nodeId, port), (serverId)
- [X] T007 [P] Add `primaryIp` nullable text column to nodes table in `packages/db/src/schema/nodes.ts`
- [X] T008 Update `packages/db/src/schema/index.ts` to export allocations table (depends on T006)
- [X] T009 Generate Drizzle migration for allocations table + nodes.primaryIp column (depends on T006, T007, T008)

**Checkpoint**: Shared schemas, DB tables, and SSE events are ready. User story implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service that multiple user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T010 Create allocation service in `apps/api/src/services/allocation.service.ts` — addAllocations (expand port range, ON CONFLICT DO NOTHING, return created/skipped counts), listAllocations (filter by status/ip/port, pagination, summary counts), deleteAllocation (reject if assigned), assignAllocation (reject if already assigned, set serverId/isPrimary/status), unassignAllocation (clear serverId/isPrimary, set status=available), autoAssign (find first available on primaryIp or any, assign as primary), releaseAllocations (release all for a serverId), getSummary (total/available/assigned counts + primaryIp) (depends on T009)
- [X] T011 [P] Create allocation integration tests in `apps/api/src/services/allocation.service.spec.ts` — test addAllocations (single port, range, overlapping idempotent, invalid IP, invalid port range), listAllocations (filter by status/ip/port, pagination), deleteAllocation (available ok, assigned rejected), assignAllocation (available ok, already-assigned rejected), unassignAllocation, autoAssign (with primaryIp, without primaryIp, no available), releaseAllocations (depends on T010)

**Checkpoint**: Foundation ready — allocation service is operational with full test coverage. User story implementation can now begin.

---

## Phase 3: User Story 1 - Admin manages IP allocations per node (Priority: P1) 🎯 MVP

**Goal**: Admin can add IP addresses with port ranges to a node's allocation pool, view all allocations with status, and remove unused allocations.

**Independent Test**: Add an IP with a port range to a node via the panel, verify allocations appear in the list, remove an unused allocation, verify it disappears.

### Implementation for User Story 1

- [X] T012 [US1] Create allocations API routes in `apps/api/src/routes/allocations.ts` — POST /:nodeId/allocations (add range), GET /:nodeId/allocations (list with filters), DELETE /:nodeId/allocations/:allocationId (delete, reject if assigned), GET /:nodeId/allocations/summary (counts + primaryIp) (depends on T010)
- [X] T013 [US1] Mount allocations routes in `apps/api/src/index.ts` under `/api/admin/nodes` (depends on T012)
- [X] T014 [US1] Create allocation route tests in `apps/api/src/routes/allocations.spec.ts` — test POST (create range, idempotent overlap, invalid IP, invalid port), GET (list, filter by status/ip/port, summary), DELETE (available ok, assigned 409) (depends on T012)
- [X] T015 [US1] Add SSE emission for allocation.create and allocation.delete in `apps/api/src/services/allocation.service.ts` — emit on bulk create (summary payload: nodeId, ip, count, portRange) and on delete (id, nodeId, deleted: true) (depends on T005, T010)
- [X] T016 [P] [US1] Create use-allocations hook in `apps/panel/src/hooks/use-allocations.ts` — useAllocations (list with filters), useAllocationSummary, useAddAllocations (mutation), useDeleteAllocation (mutation), invalidate on allocation.create/update/delete SSE events (depends on T001, T002)
- [X] T017 [P] [US1] Create AllocationSummary component in `apps/panel/src/components/allocations/allocation-summary.tsx` — display total/available/assigned counts, primary IP badge (depends on T002)
- [X] T018 [US1] Create AllocationForm component in `apps/panel/src/components/allocations/allocation-form.tsx` — form with IP input, portStart, portEnd (optional), protocol select (tcp/udp), submit via useAddAllocations, validation (IP format, port range), confirmation warning for large ranges (>100 ports) (depends on T016)
- [X] T019 [US1] Create AllocationList component in `apps/panel/src/components/allocations/allocation-list.tsx` — table with IP, port, protocol, status (badge), server ID (if assigned), delete button (disabled if assigned), filter by status, filter by IP, search by port, pagination (depends on T016, T017, T018)
- [X] T020 [US1] Integrate allocations section into node detail page in `apps/panel/src/routes/node-detail.tsx` — add "Allocations" tab/section showing AllocationSummary, AllocationForm, AllocationList; SSE-driven refresh on allocation events (depends on T016, T017, T018, T019)
- [X] T021 [US1] MCP verification — start dev services, login, navigate to node detail, add IP + port range, verify allocations appear, filter by status, search by port, delete available allocation, verify SSE updates without page reload, try to delete assigned allocation (should fail) (depends on T020)
- [X] T022 [US1] Create E2E test in `apps/panel/tests/e2e/allocations.spec.ts` — login, navigate to node, add IP + port range, verify allocations in list, filter by status, search by port, delete available allocation, verify deletion, verify assigned allocation cannot be deleted (depends on T021)

**Checkpoint**: User Story 1 is fully functional — admin can manage the allocation pool via the panel UI with real-time updates.

---

## Phase 4: User Story 2 - Admin assigns allocations to a server (Priority: P2)

**Goal**: Allocations can be assigned to a server (primary + secondary), assigned allocations are locked, and deleting a server releases its allocations.

**Independent Test**: Assign an allocation to a server via API, verify it's marked "assigned", try to assign the same allocation to another server (should fail), release it, verify it returns to "available".

### Implementation for User Story 2

- [X] T023 [US2] Add assign/unassign endpoints to allocations API in `apps/api/src/routes/allocations.ts` — POST /:nodeId/allocations/:allocationId/assign (serverId, isPrimary), POST /:nodeId/allocations/:allocationId/unassign (depends on T012)
- [X] T024 [US2] Add release endpoint in `apps/api/src/routes/allocations.ts` — POST /api/admin/allocations/release (serverId) — releases all allocations for a server (for R9 integration) (depends on T010)
- [X] T025 [US2] Add SSE emission for allocation.update in `apps/api/src/services/allocation.service.ts` — emit on assign/unassign/release with full allocation payload (depends on T005, T010)
- [X] T026 [US2] Add assign/unassign tests to `apps/api/src/routes/allocations.spec.ts` — test assign (available ok, already-assigned 409), unassign (assigned ok, available 409), release (releases all for serverId) (depends on T023, T024)
- [X] T027 [P] [US2] Add useAssignAllocation and useUnassignAllocation mutations to `apps/panel/src/hooks/use-allocations.ts` (depends on T016)
- [X] T028 [US2] Add assign/unassign buttons to AllocationList component in `apps/panel/src/components/allocations/allocation-list.tsx` — "Assign to server" button on available allocations (opens dialog to enter serverId + isPrimary), "Unassign" button on assigned allocations (depends on T019, T027)
- [X] T029 [US2] MCP verification — assign an allocation to a server via panel, verify status changes to "assigned", try to assign same allocation to another server (should fail), unassign, verify returns to "available", verify SSE updates (depends on T028)
- [X] T030 [US2] Add assign/unassign E2E tests to `apps/panel/tests/e2e/allocations.spec.ts` — assign allocation, verify assigned status, try duplicate assign (should fail), unassign, verify available (depends on T029)

**Checkpoint**: User Story 2 is fully functional — allocations can be assigned/unassigned via the panel with real-time updates.

---

## Phase 5: User Story 3 - Admin filters and searches allocations (Priority: P3)

**Goal**: Admin can filter allocations by status and IP, search by port number, and see a per-node allocation summary.

**Independent Test**: Add allocations with different IPs and ports, filter by status, filter by IP, search by port, verify correct subset is displayed.

### Implementation for User Story 3

- [X] T031 [US3] Add server-side filtering to listAllocations in `apps/api/src/services/allocation.service.ts` — support status, ip, port query params with indexed queries (already implemented in T010, verify and add tests if gaps) (depends on T010)
- [X] T032 [P] [US3] Add filter UI to AllocationList component in `apps/panel/src/components/allocations/allocation-list.tsx` — status dropdown (all/available/assigned), IP dropdown (distinct IPs for node), port search input, debounced (depends on T019)
- [X] T033 [US3] Add filtering tests to `apps/api/src/routes/allocations.spec.ts` — test GET with status filter, ip filter, port search, combined filters, pagination (depends on T031)
- [X] T034 [US3] MCP verification — add allocations on multiple IPs, filter by status, filter by IP, search by port, verify summary counts update correctly, verify filters work with SSE updates (depends on T032)
- [X] T035 [US3] Add filter E2E tests to `apps/panel/tests/e2e/allocations.spec.ts` — filter by status, filter by IP, search by port, verify correct subset displayed (depends on T034)

**Checkpoint**: User Story 3 is fully functional — admin can efficiently find allocations in large pools.

---

## Phase 6: User Story 4 - Server creation auto-assigns a primary allocation (Priority: P4)

**Goal**: When creating a server, the panel can auto-assign a primary allocation from the node's available pool, preferring the node's primary IP.

**Independent Test**: Set a primary IP on a node, create a server with auto-assign, verify an allocation on the primary IP was selected and marked as assigned.

### Implementation for User Story 4

- [X] T036 [US4] Add auto-assign endpoint to allocations API in `apps/api/src/routes/allocations.ts` — POST /:nodeId/allocations/auto-assign (serverId) — finds first available allocation on primaryIp (or any if no primary), assigns as primary, returns allocation (depends on T010)
- [X] T037 [US4] Add PATCH /:nodeId primaryIp update to nodes API in `apps/api/src/routes/nodes.ts` — allow setting/clearing primaryIp on a node (depends on T007)
- [X] T038 [US4] Add auto-assign tests to `apps/api/src/routes/allocations.spec.ts` — test auto-assign with primaryIp set (picks from primaryIp), without primaryIp (picks any), no available (409), verify isPrimary=true (depends on T036)
- [X] T039 [US4] Add primaryIp update tests to `apps/api/src/routes/nodes.spec.ts` — test PATCH primaryIp (set, clear, invalid IP) (depends on T037)
- [X] T040 [P] [US4] Add useAutoAssignAllocation and useSetPrimaryIp mutations to `apps/panel/src/hooks/use-allocations.ts` (depends on T016)
- [X] T041 [US4] Add primary IP selector to node detail page in `apps/panel/src/routes/node-detail.tsx` — dropdown of distinct IPs on the node, "Set as primary" button, "Clear" button (depends on T040)
- [X] T042 [US4] MCP verification — set primary IP on a node, auto-assign an allocation via API, verify it picked from primary IP, verify isPrimary=true, clear primary IP, auto-assign again (picks any), verify no available allocations returns error (depends on T041)
- [X] T043 [US4] Add auto-assign E2E tests to `apps/panel/tests/e2e/allocations.spec.ts` — set primary IP, auto-assign via API, verify allocation assigned on primary IP, clear primary IP, auto-assign again (depends on T042)

**Checkpoint**: User Story 4 is fully functional — auto-assignment works with primary IP preference.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T044 [P] Add node deletion protection in `apps/api/src/routes/nodes.ts` — check for assigned allocations before deleting a node, return 409 if any exist (depends on T010)
- [X] T045 [P] Add node deletion protection tests to `apps/api/src/routes/nodes.spec.ts` — test delete node with assigned allocations (409), delete node with only available allocations (ok, cascades) (depends on T044)
- [X] T046 [P] Update test-cleanup endpoint in `apps/api/src/routes/test-cleanup.ts` — delete allocations except those assigned to the E2E daemon's server (if any) (depends on T009)
- [X] T047 Run `bun run check` (lint + format) and fix any issues
- [X] T048 Run `bun run typecheck` and fix any type errors
- [X] T049 Run `bun run test` and ensure all unit/integration tests pass
- [X] T050 Run `bun run test:e2e` and ensure all E2E tests pass (including new allocation tests)
- [X] T051 Run quickstart.md validation scenarios end-to-end
- [X] T052 Update ROADMAP.md to mark R7 as `done` (in the same commit that completes the last task)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3) is the MVP — must complete first
  - US2 (Phase 4) depends on US1 (uses the same API routes and UI components)
  - US3 (Phase 5) depends on US1 (extends the list component with filters)
  - US4 (Phase 6) depends on US1 (uses the allocation service) and US2 (assignment logic)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (extends API routes and list component)
- **User Story 3 (P3)**: Depends on US1 (extends list component with filters)
- **User Story 4 (P4)**: Depends on US1 (allocation service) and US2 (assignment)

### Within Each User Story

- Shared schemas before DB tables
- DB tables before services
- Services before routes
- Routes before UI hooks
- UI hooks before components
- Components before page integration
- MCP verification before E2E tests

### Parallel Opportunities

- T001, T002, T006, T007 can run in parallel (different files)
- T011 (service tests) can run in parallel with T012 (routes) after T010
- T016, T017 can run in parallel (different files) after T010
- T027 can run in parallel with T023/T024 (different files)
- T032, T040 can run in parallel (different files)
- T044, T045, T046 can run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Launch independent UI components in parallel:
Task: "Create use-allocations hook in apps/panel/src/hooks/use-allocations.ts"
Task: "Create AllocationSummary component in apps/panel/src/components/allocations/allocation-summary.tsx"

# Then sequential (depend on hooks):
Task: "Create AllocationForm component in apps/panel/src/components/allocations/allocation-form.tsx"
Task: "Create AllocationList component in apps/panel/src/components/allocations/allocation-list.tsx"
Task: "Integrate allocations section into node detail page in apps/panel/src/routes/node-detail.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schemas, DB, SSE events)
2. Complete Phase 2: Foundational (allocation service + tests)
3. Complete Phase 3: User Story 1 (API routes, UI, E2E)
4. **STOP and VALIDATE**: Admin can add/view/delete allocations via the panel
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Polish → Final validation → Mark R7 done

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- MCP verification (chrome-devtools) BEFORE Playwright E2E tests (Constitution Principle IV)
- Commit after each task or logical group, marking tasks as [X] in the same commit
- Update ROADMAP.md status in the same commit that marks R7 as done
- R9 (Server Lifecycle) will consume the allocation API (auto-assign, release) — R7 provides the API, R9 wires it into server creation/deletion
