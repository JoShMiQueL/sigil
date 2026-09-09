# Tasks: Node Management

**Input**: Design documents from `/specs/002-node-management/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included for this feature — pairing tokens, node credentials, and HMAC authentication are security-sensitive and require coverage per Constitution Principle IV.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Monorepo: `apps/api/src/` (Hono API), `apps/panel/src/` (React UI), `packages/shared/src/` (Zod schemas), `packages/db/src/` (Drizzle schema)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create node-specific package structure for shared schemas

- [X] T001 Create `packages/shared/src/node/` directory with index file re-exporting all node schemas

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create `regions` table schema in `packages/db/src/schema/regions.ts` with all fields from data-model.md
- [X] T003 [P] Create `nodes` table schema in `packages/db/src/schema/nodes.ts` with all fields from data-model.md
- [X] T004 [P] Create `pairing_tokens` table schema in `packages/db/src/schema/pairing-tokens.ts` with all fields from data-model.md
- [X] T005 [P] Create `node_credentials` table schema in `packages/db/src/schema/node-credentials.ts` with all fields from data-model.md
- [X] T006 Export all new schemas from `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`, then generate Drizzle migration
- [X] T007 [P] Create Zod schemas for Region, RegionCreate, RegionUpdate in `packages/shared/src/node/region.ts`
- [X] T008 [P] Create Zod schemas for Node, NodeUpdate, NodeStatus, NodeCapabilities in `packages/shared/src/node/node.ts`
- [X] T009 [P] Create Zod schemas for PairingToken, PairingTokenCreate, PairingRequest, PairingTokenDisplay in `packages/shared/src/node/pairing.ts`
- [X] T010 [P] Create Zod schema for HeartbeatPayload in `packages/shared/src/node/heartbeat.ts`
- [X] T011 [P] Create Zod schemas for NodeCredential, NodeAuthHeaders in `packages/shared/src/node/credentials.ts`
- [X] T012 Re-export all node schemas from `packages/shared/src/node/index.ts` and update `packages/shared/src/index.ts`
- [X] T013 [P] Create HMAC-SHA256 credential generation and verification library in `apps/api/src/lib/credentials.ts` (generate secret, verify signature with ±60s timestamp window)
- [X] T014 [P] Create unit test for credential generation and HMAC verification in `apps/api/src/lib/credentials.spec.ts`
- [X] T015 Create node authentication middleware in `apps/api/src/middleware/node-auth.ts` (verify X-Node-Id, X-Node-Signature, X-Node-Timestamp headers against active credentials)
- [X] T016 [P] Create unit test for node-auth middleware in `apps/api/src/middleware/node-auth.spec.ts` (valid signature, invalid signature, revoked credentials, timestamp out of window)
- [X] T017 Update test-cleanup endpoint in `apps/api/src/routes/test-cleanup.ts` to also delete from `node_credentials`, `pairing_tokens`, `nodes`, `regions` (in FK order)

**Checkpoint**: Foundation ready — DB schema, shared schemas, credential lib, and node auth middleware are all in place. User story implementation can now begin.

---

## Phase 3: User Story 1 - Admin Creates a Region (Priority: P1) 🎯 MVP

**Goal**: An admin can create, list, and delete regions. Regions are the container for nodes.

**Independent Test**: Log in as admin, navigate to Nodes, create a region, verify it appears in the list, delete it.

### Tests for User Story 1

- [X] T018 [P] [US1] Integration test for region CRUD (create, list, delete, duplicate name error, delete with nodes error) in `apps/api/src/routes/regions.spec.ts` (Testcontainers PostgreSQL)

### Implementation for User Story 1

- [X] T019 [US1] Implement region service in `apps/api/src/services/region.service.ts` (create, list with node/server counts, delete with guard)
- [X] T020 [US1] Implement region routes in `apps/api/src/routes/regions.ts` (GET /api/admin/regions, POST /api/admin/regions, DELETE /api/admin/regions/:id)
- [X] T021 [US1] Register region routes in `apps/api/src/index.ts`
- [X] T022 [P] [US1] Create region list component in `apps/panel/src/components/RegionList.tsx` (shows regions with node/server counts, delete button)
- [X] T023 [P] [US1] Create create region form in `apps/panel/src/components/CreateRegionForm.tsx` (name + description dialog)
- [X] T024 [US1] Create nodes route in `apps/panel/src/routes/nodes.tsx` (renders RegionList + CreateRegionForm, shows empty node table placeholder)
- [X] T025 [US1] Add "Nodes" link to panel navigation in `apps/panel/src/components/` (sidebar/nav)
- [X] T026 [P] [US1] E2E test for region management in `apps/panel/tests/e2e/regions.spec.ts` (create region, verify in list, delete region, duplicate name error)

**Checkpoint**: Region management is fully functional. An admin can create, list, and delete regions.

---

## Phase 4: User Story 2 - Admin Pairs a Node (Priority: P2)

**Goal**: An admin can generate pairing tokens and a daemon can register itself using that token. The node appears in the panel after registration.

**Independent Test**: Generate a pairing token, simulate daemon registration via curl, verify the node appears in the node list.

### Tests for User Story 2

- [X] T027 [P] [US2] Integration test for pairing token generation and listing in `apps/api/src/routes/pairing.spec.ts` (Testcontainers PostgreSQL)
- [X] T028 [P] [US2] Integration test for daemon registration in `apps/api/src/routes/pairing.spec.ts` (valid token, expired token, used token, invalid token)

### Implementation for User Story 2

- [X] T029 [US2] Implement pairing service in `apps/api/src/services/pairing.service.ts` (generate token, validate token, consume token + create node + issue credentials)
- [X] T030 [US2] Implement pairing admin routes in `apps/api/src/routes/pairing.ts` (POST /api/admin/pairing/tokens, GET /api/admin/pairing/tokens)
- [X] T031 [US2] Implement daemon registration route in `apps/api/src/routes/pairing.ts` (POST /api/node/register — no auth, exchanges token for credentials)
- [X] T032 [US2] Register pairing routes in `apps/api/src/index.ts`
- [X] T033 [P] [US2] Create pairing token dialog in `apps/panel/src/components/PairingTokenDialog.tsx` (select region, generate, display token once with copy button)
- [X] T034 [P] [US2] Create node table component in `apps/panel/src/components/NodeTable.tsx` (hostname, region, status, server count)
- [X] T035 [US2] Add pairing token button and node table to nodes page in `apps/panel/src/routes/nodes.tsx`
- [X] T036 [P] [US2] E2E test for pairing flow in `apps/panel/tests/e2e/pairing.spec.ts` (generate token, verify displayed once, simulate registration via API call, verify node in list)

**Checkpoint**: Node pairing is functional. An admin can generate tokens and daemons can register. Nodes appear in the panel.

---

## Phase 5: User Story 3 - Node Health Monitoring (Priority: P3)

**Goal**: The panel shows node health based on heartbeats. Online nodes display resource usage. Offline nodes are visually marked.

**Independent Test**: Register a node, send a heartbeat via curl, verify status changes to online with resource data. Stop heartbeats, verify status changes to offline.

### Tests for User Story 3

- [ ] T037 [P] [US3] Integration test for heartbeat processing in `apps/api/src/routes/heartbeat.spec.ts` (valid heartbeat updates status to online, invalid auth rejected, timestamp out of window rejected)
- [ ] T038 [P] [US3] Integration test for heartbeat timeout in `apps/api/src/routes/heartbeat.spec.ts` (node marked offline after timeout, node recovers on new heartbeat)

### Implementation for User Story 3

- [ ] T039 [US3] Implement heartbeat service in `apps/api/src/services/heartbeat.service.ts` (process heartbeat, update node status + resource usage, timeout sweep)
- [ ] T040 [US3] Implement heartbeat route in `apps/api/src/routes/pairing.ts` (POST /api/node/heartbeat — requires node-auth middleware)
- [ ] T041 [US3] Start heartbeat timeout sweep interval in `apps/api/src/index.ts` (30s sweep, marks nodes offline if last_heartbeat_at > 90s ago)
- [ ] T042 [P] [US3] Create node detail page in `apps/panel/src/routes/node-detail.tsx` (shows node info + resource usage)
- [ ] T043 [P] [US3] Create node detail panel component in `apps/panel/src/components/NodeDetailPanel.tsx` (CPU/memory/disk bars, container count, last heartbeat time)
- [ ] T044 [US3] Add 15s polling to node table in `apps/panel/src/components/NodeTable.tsx` (refresh node list when page is active, show online/offline/unknown indicators)
- [ ] T045 [US3] Add node row click navigation to node detail page in `apps/panel/src/components/NodeTable.tsx`
- [ ] T046 [P] [US3] E2E test for heartbeat flow in `apps/panel/tests/e2e/heartbeat.spec.ts` (register node, send heartbeat via API, verify online status + resource data in UI)

**Checkpoint**: Health monitoring is functional. Admins can see node status and resource usage in real time.

---

## Phase 6: User Story 4 - Admin Manages Nodes (Priority: P4)

**Goal**: An admin can edit, remove, and regenerate credentials for nodes. Removal is blocked if the node has servers.

**Independent Test**: Register a node, edit its display name, regenerate credentials, verify old credentials fail, remove the node, verify it's gone.

### Tests for User Story 4

- [ ] T047 [P] [US4] Integration test for node CRUD in `apps/api/src/routes/nodes.spec.ts` (list, detail, update, delete, delete with servers error, regenerate credentials)

### Implementation for User Story 4

- [ ] T048 [US4] Implement node service in `apps/api/src/services/node.service.ts` (list, detail, update, delete with server guard, regenerate credentials)
- [ ] T049 [US4] Implement node admin routes in `apps/api/src/routes/nodes.ts` (GET /api/admin/nodes, GET /api/admin/nodes/:id, PATCH /api/admin/nodes/:id, DELETE /api/admin/nodes/:id, POST /api/admin/nodes/:id/regenerate-credentials)
- [ ] T050 [US4] Register node routes in `apps/api/src/index.ts`
- [ ] T051 [P] [US4] Create node edit dialog in `apps/panel/src/components/NodeEditDialog.tsx` (edit display name, change region)
- [ ] T052 [US4] Add edit, regenerate credentials, and remove actions to node detail page in `apps/panel/src/routes/node-detail.tsx`
- [ ] T053 [P] [US4] E2E test for node management in `apps/panel/tests/e2e/node-management.spec.ts` (edit node, regenerate credentials, verify old creds fail, remove node)

**Checkpoint**: Full node lifecycle management is functional. Admins can edit, remove, and regenerate credentials.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T054 Add audit log entries for all node management actions (region create/delete, pairing token generate, node register/edit/remove/regenerate) in respective service files
- [ ] T055 [P] Update `ROADMAP.md` to mark R4 as done
- [ ] T056 [P] Update `AGENTS.md` with node management section (new endpoints, new test files, new panel routes)
- [ ] T057 Run quickstart.md validation scenarios and verify all pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): Depends on US1 (needs regions to exist for pairing)
  - US3 (Phase 5): Depends on US2 (needs registered nodes to send heartbeats)
  - US4 (Phase 6): Depends on US2 (needs nodes to manage)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P2)**: Requires US1 (regions must exist for pairing token generation)
- **US3 (P3)**: Requires US2 (nodes must be registered to send heartbeats)
- **US4 (P4)**: Requires US2 (nodes must exist to manage them)

### Within Each User Story

- Tests written FIRST, ensure they FAIL before implementation
- Services before routes
- Routes before panel UI
- Panel components before page integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational DB schema tasks (T002-T005) can run in parallel
- All Foundational Zod schema tasks (T007-T011) can run in parallel
- Credential lib (T013) and its test (T014) can run in parallel with Zod schemas
- Within US1: RegionList (T022) and CreateRegionForm (T023) can run in parallel
- Within US2: PairingTokenDialog (T033) and NodeTable (T034) can run in parallel
- Within US3: NodeDetailPanel (T043) can run in parallel with heartbeat service work
- Within US4: NodeEditDialog (T051) can run in parallel with node service work

---

## Parallel Example: Foundational Phase

```bash
# Launch all DB schema tasks together:
Task: "Create regions table schema in packages/db/src/schema/regions.ts"
Task: "Create nodes table schema in packages/db/src/schema/nodes.ts"
Task: "Create pairing_tokens table schema in packages/db/src/schema/pairing-tokens.ts"
Task: "Create node_credentials table schema in packages/db/src/schema/node-credentials.ts"

# Launch all Zod schema tasks together:
Task: "Create Zod schemas for Region in packages/shared/src/node/region.ts"
Task: "Create Zod schemas for Node in packages/shared/src/node/node.ts"
Task: "Create Zod schemas for PairingToken in packages/shared/src/node/pairing.ts"
Task: "Create Zod schema for HeartbeatPayload in packages/shared/src/node/heartbeat.ts"
Task: "Create Zod schemas for NodeCredential in packages/shared/src/node/credentials.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Regions)
4. **STOP and VALIDATE**: Test region CRUD independently
5. Demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Regions) → Test independently → Demo (MVP!)
3. Add US2 (Pairing) → Test independently → Demo
4. Add US3 (Health Monitoring) → Test independently → Demo
5. Add US4 (Node Management) → Test independently → Demo
6. Polish → Final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The daemon (R6) is NOT implemented in this spec — daemon endpoints are tested via curl/integration tests that simulate daemon calls
- Node credential authentication (HMAC-SHA256) is separate from user session/API key auth (R1)
