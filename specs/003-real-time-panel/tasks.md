# Tasks: Real-time Panel Updates

**Input**: Design documents from `/specs/003-real-time-panel/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/sse-api.md, quickstart.md

**Tests**: Included per Constitution Principle IV (Test Against Real Infrastructure).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **API**: `apps/api/src/`
- **Panel**: `apps/panel/src/`
- **Shared**: `packages/shared/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared SSE event schemas used by both API and panel.

- [X] T001 [P] Create SSE event schemas in `packages/shared/src/sse/events.ts` (SSEEventType enum, SSEEventSchema, event payload schemas per type)
- [X] T002 [P] Create SSE barrel export in `packages/shared/src/sse/index.ts` and re-export from `packages/shared/src/index.ts`
- [X] T003 Build shared package to verify schemas compile (`bun --filter @sigil/shared build`)

**Checkpoint**: Shared SSE contracts available to both API and panel.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: SSE endpoint, event emitter service, and core `useSSE` hook. MUST be complete before any user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create SSE service in `apps/api/src/services/sse.service.ts` (subscriber registry, emit function, in-memory fanout, connection add/remove)
- [X] T005 Add Redis pub/sub to `apps/api/src/services/sse.service.ts` for multi-process event fanout (publish on emit, subscribe on startup, forward to local subscribers)
- [X] T006 Add per-node debounce to `apps/api/src/services/sse.service.ts` (max 1 node.update event/sec per node, batch metric updates)
- [X] T007 Create SSE endpoint route in `apps/api/src/routes/sse.ts` (GET /api/sse, session-cookie auth via existing auth middleware, streamSSE, 15s SSE heartbeat comments, connection cleanup on close)
- [X] T008 Register SSE route in `apps/api/src/index.ts`
- [X] T009 [P] Create unit tests for SSE service in `apps/api/src/services/sse.service.spec.ts` (emit, subscriber add/remove, debounce, in-memory fanout)
- [X] T010 [P] Create integration test for SSE endpoint in `apps/api/src/routes/sse.spec.ts` (authenticated connect receives events, unauthenticated returns 401, connection cleanup)
- [X] T011 Create core `useSSE` hook in `apps/panel/src/hooks/useSSE.ts` (EventSource connection, event dispatch to handlers, TanStack Query invalidation via `queryClient.invalidateQueries`, connection state tracking)
- [X] T012 [P] Create `ReconnectingIndicator` component in `apps/panel/src/components/ReconnectingIndicator.tsx` (banner shown when connection state is "reconnecting" or "disconnected")
- [X] T013 Mount `ReconnectingIndicator` in panel layout in `apps/panel/src/components/Layout.tsx` (reads connection state from `useSSE`, shows banner when not connected)

**Checkpoint**: SSE endpoint serves events, `useSSE` hook connects and dispatches, reconnecting indicator exists. User story implementation can now begin.

---

## Phase 3: User Story 1 - Node Status via SSE (Priority: P1) 🎯 MVP

**Goal**: Node status and metrics update in the panel in real time without polling. Replaces the 15s `refetchInterval` from R4.

**Independent Test**: Register a node, open `/nodes`, send a heartbeat via API. Verify status changes to "online" and metrics appear without page reload. Stop heartbeats, wait for timeout sweep, verify "offline" without reload.

### Implementation for User Story 1

- [X] T014 [P] [US1] Emit `node.update` from `processHeartbeat` in `apps/api/src/services/heartbeat.service.ts` (call `sseService.emit` after processing heartbeat)
- [X] T015 [P] [US1] Emit `node.update` from `sweepOfflineNodes` in `apps/api/src/services/heartbeat.service.ts` (call `sseService.emit` per node marked offline)
- [X] T016 [P] [US1] Emit `node.create` from `consumePairingToken` in `apps/api/src/services/pairing.service.ts` (call `sseService.emit` after node registration)
- [X] T017 [P] [US1] Emit `node.delete` from `deleteNode` in `apps/api/src/services/node.service.ts` (call `sseService.emit` after deletion)
- [X] T018 [US1] Retrofit `useNodes` hook in `apps/panel/src/hooks/useNodes.ts` — remove `refetchInterval: 15000`, add SSE subscription for `node.update`, `node.create`, `node.delete` via `useSSE` (invalidate `["nodes"]` query key)
- [X] T019 [US1] Retrofit `useNode` hook in `apps/panel/src/hooks/useNodes.ts` — remove `refetchInterval: 15000`, add SSE subscription for `node.update` filtered by nodeId (use `queryClient.setQueryData` for direct cache update on metrics, `invalidateQueries` on status change)
- [X] T020 [US1] Add `useSSE` call to `NodesPage` in `apps/panel/src/routes/nodes.tsx` (subscribe to node events, wire invalidations)
- [X] T021 [US1] Add `useSSE` call to `NodeDetailPage` in `apps/panel/src/routes/node-detail.tsx` (subscribe to `node.update` for specific nodeId)
- [X] T022 [P] [US1] Add integration test for node SSE events in `apps/api/src/routes/sse.spec.ts` (heartbeat triggers node.update event on SSE stream, pairing triggers node.create, delete triggers node.delete)

**Checkpoint**: Node status and metrics update in real time. Zero polling for node data. MVP deliverable.

---

## Phase 4: User Story 2 - Auto-Reconnect (Priority: P2)

**Goal**: Panel survives network interruptions without page reloads. Auto-reconnect with exponential backoff, HTTP resync, session expiry detection, degraded mode fallback.

**Independent Test**: Open `/nodes`, stop the API server, verify "reconnecting" indicator appears within 2s. Restart API, verify indicator disappears and updates resume without page reload.

### Implementation for User Story 2

- [X] T023 [US2] Add exponential backoff reconnection to `useSSE` hook in `apps/panel/src/hooks/useSSE.ts` (1s, 2s, 4s, 8s, max 30s, reset on successful connect)
- [X] T024 [US2] Add HTTP resync after reconnect in `apps/panel/src/hooks/useSSE.ts` (on reconnect, invalidate all subscribed query keys to trigger HTTP refetch before resuming SSE)
- [X] T025 [US2] Add 401 detection in `useSSE` hook in `apps/panel/src/hooks/useSSE.ts` (on SSE error, check if session expired via fetch to `/api/auth/me`, redirect to `/login` if 401)
- [X] T026 [US2] Wire `ReconnectingIndicator` to `useSSE` connection state in `apps/panel/src/components/ReconnectingIndicator.tsx` (show "reconnecting" with backoff attempt count, show "disconnected" on 401)
- [X] T027 [US2] Add degraded mode fallback in `apps/panel/src/hooks/useSSE.ts` (after 5 failed reconnect attempts, switch to HTTP polling at 30s interval for subscribed query keys, show "degraded mode" indicator, continue background SSE reconnection attempts)
- [X] T028 [US2] Update `ReconnectingIndicator` in `apps/panel/src/components/ReconnectingIndicator.tsx` to show "degraded mode — real-time paused" when fallback polling is active
- [X] T029 [P] [US2] Add unit test for reconnection backoff logic in `apps/panel/src/hooks/useSSE.spec.ts` (verify backoff sequence, reset on success, max 30s cap)
- [X] T030 [P] [US2] Add integration test for SSE reconnection in `apps/api/src/routes/sse.spec.ts` (client disconnects and reconnects, receives missed events via HTTP resync)

**Checkpoint**: Panel auto-reconnects with backoff, resyncs via HTTP, handles session expiry, falls back to polling in degraded mode. No page reloads on network blips.

---

## Phase 5: User Story 3 - All Panel Data Reactive (Priority: P3)

**Goal**: Zero polling in the entire panel. Region and user data updates via SSE. All `refetchInterval` removed.

**Independent Test**: Open `/nodes`, create a region via API, verify it appears without reload. Open users page, create a user via API, verify it appears without reload. Search panel source for `refetchInterval` — zero results.

### Implementation for User Story 3

- [X] T031 [P] [US3] Emit `region.update` from `createRegion` in `apps/api/src/services/region.service.ts` (call `sseService.emit` after creation)
- [X] T032 [P] [US3] Emit `region.update` (deleted) from `deleteRegion` in `apps/api/src/services/region.service.ts` (call `sseService.emit` after deletion)
- [X] T033 [P] [US3] Emit `user.update` from user CRUD operations in `apps/api/src/routes/users.ts` (call `sseService.emit` on create, suspend, unsuspend, role change, delete)
- [X] T034 [US3] Retrofit `useRegions` hook in `apps/panel/src/hooks/useRegions.ts` — add SSE subscription for `region.update` via `useSSE` (invalidate `["regions"]` query key)
- [X] T035 [US3] Retrofit user queries in `apps/panel/src/router.tsx` — add SSE subscription for `user.update` via `useSSE` (invalidate `["users"]` and `["user", id]` query keys)
- [X] T036 [US3] Add `useSSE` call to users page section in `apps/panel/src/router.tsx` (subscribe to user events, wire invalidations)
- [X] T037 [P] [US3] Add integration test for region SSE events in `apps/api/src/routes/sse.spec.ts` (region create/delete triggers region.update on SSE stream)
- [X] T038 [P] [US3] Add integration test for user SSE events in `apps/api/src/routes/sse.spec.ts` (user create/suspend/delete triggers user.update on SSE stream)

**Checkpoint**: All panel data is reactive. Zero `refetchInterval` in panel source. Regions and users update in real time.

---

## Phase 6: User Story 4 - Reusable Infrastructure (Priority: P4)

**Goal**: SSE infrastructure is generic and reusable. Future features plug in via event name + handler. Multiplexing verified. Unhandled events silently ignored.

**Independent Test**: Subscribe to a new event type via `useSSE` handler, emit from API, verify received. Emit an unhandled event type, verify no error/crash.

### Implementation for User Story 4

- [X] T039 [US4] Add silent ignore for unhandled event types in `apps/panel/src/hooks/useSSE.ts` (events with no registered handler or invalidations are silently dropped, no console error)
- [X] T040 [US4] Verify multiplexing in `apps/api/src/routes/sse.spec.ts` — multiple event types (node.update, region.update, user.update) delivered over single SSE connection, routed to correct handlers
- [X] T041 [P] [US4] Add unit test for `useSSE` event dispatch in `apps/panel/src/hooks/useSSE.spec.tsx` (multiple handlers for different event types, unhandled event silently ignored, handler receives correct payload)

**Checkpoint**: SSE infrastructure is reusable. Future features subscribe via event name + handler. No new endpoint or connection needed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, E2E tests, documentation sync.

- [X] T042 [P] Verify zero `refetchInterval` in panel source (`grep -r "refetchInterval" apps/panel/src/` returns no results except degraded-mode fallback in `useSSE.ts`)
- [X] T043 [P] Verify zero `setInterval` + fetch polling in panel source (`grep -r "setInterval" apps/panel/src/` returns only SSE heartbeat and degraded-mode fallback)
- [X] T044 Run `bun run check` and `bun run typecheck` — must pass with zero errors
- [X] T045 Run `bun run test` — all unit and integration tests must pass
- [X] T046 MCP verification: Start dev services, open browser via chrome-devtools MCP, verify Scenario 1 from `specs/003-real-time-panel/quickstart.md` (node appears, status changes, metrics update — all without page reload)
- [X] T047 MCP verification: Verify Scenario 2 from quickstart.md (stop API, see reconnecting indicator, restart API, verify resync without page reload)
- [X] T048 MCP verification: Verify Scenario 3 from quickstart.md (grep panel source for polling — zero results)
- [X] T049 Create Playwright E2E test in `apps/panel/tests/e2e/real-time.spec.ts` (login, navigate to nodes, register node via API, verify node appears in DOM without reload, send heartbeat, verify status changes in DOM)
- [X] T050 Run `bun run test:e2e` — Playwright suite must pass
- [X] T051 Update `specs/003-real-time-panel/spec.md` — mark all functional requirements as implemented
- [X] T052 Update `ROADMAP.md` — mark R17 status as `done`
- [X] T053 Update `specs/001-user-auth/spec.md` and `specs/002-node-management/spec.md` — remove tech debt notes (polling replaced by SSE)

**Checkpoint**: R17 complete. All tests pass. Real-time panel verified via MCP and Playwright. Specs and roadmap synchronized.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP deliverable
- **User Story 2 (Phase 4)**: Depends on Foundational — enhances US1 with reliability
- **User Story 3 (Phase 5)**: Depends on Foundational — extends SSE to all panel data
- **User Story 4 (Phase 6)**: Depends on Foundational — verifies reusability
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only. Can start immediately after Phase 2.
- **US2 (P2)**: Depends on Foundational. Enhances `useSSE` hook from Phase 2. Can run in parallel with US1 if different developer.
- **US3 (P3)**: Depends on Foundational. Can run in parallel with US1/US2. Retrofits R1/R4 components.
- **US4 (P4)**: Depends on Foundational. Verifies infrastructure. Can run in parallel with US1/US2/US3.

### Within Each User Story

- Event emission (server-side) before hook retrofit (client-side)
- Hook retrofit before page integration
- Integration tests after implementation
- MCP verification after all stories complete (Phase 7)

### Parallel Opportunities

- T001, T002 can run in parallel (different files)
- T009, T010 can run in parallel (different files)
- T014, T015, T016, T017 can run in parallel (different services)
- T031, T032, T033 can run in parallel (different files)
- US1, US2, US3, US4 can run in parallel after Foundational (if team capacity allows)

---

## Parallel Example: User Story 1

```bash
# Launch all event emission tasks together (different services, no conflicts):
Task: "Emit node.update from processHeartbeat in heartbeat.service.ts"
Task: "Emit node.update from sweepOfflineNodes in heartbeat.service.ts"
Task: "Emit node.create from consumePairingToken in pairing.service.ts"
Task: "Emit node.delete from deleteNode in node.service.ts"

# Then sequentially (same file):
Task: "Retrofit useNodes hook — remove refetchInterval, add SSE"
Task: "Retrofit useNode hook — remove refetchInterval, add SSE"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared schemas)
2. Complete Phase 2: Foundational (SSE endpoint + useSSE hook)
3. Complete Phase 3: User Story 1 (node events + retrofit useNodes)
4. **STOP and VALIDATE**: Verify node status updates in real time via MCP
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → SSE infrastructure ready
2. Add US1 → Node real-time works → MCP verify → MVP!
3. Add US2 → Auto-reconnect works → MCP verify
4. Add US3 → All panel reactive → MCP verify → zero polling
5. Add US4 → Reusable infrastructure verified
6. Polish → E2E tests, docs sync, roadmap update

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (node events + retrofit)
   - Developer B: US2 (auto-reconnect + degraded mode)
   - Developer C: US3 (region/user events + retrofit)
3. US4 is a verification phase — any developer can do it
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- MCP verification (Phase 7) is NON-NEGOTIABLE per Constitution Principle IV
- Playwright tests come AFTER MCP verification, not before
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `useSSE` hook in Phase 2 is a basic version (connect + dispatch). US2 adds backoff, resync, degraded mode. This keeps US1 unblocked with minimal hook functionality.
