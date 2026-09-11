# Tasks: Members & Permissions

**Input**: Design documents from `/specs/011-members-permissions/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are included — the repo has existing test infrastructure (Vitest + Testcontainers + Playwright).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared Zod schemas and database table that all user stories depend on.

- [X] T001 [P] Add permission schemas to `packages/shared/src/members/permissions.ts` — PERMISSIONS array, PermissionsSchema (8 boolean fields), PermissionSchema (single bit)
- [X] T002 [P] Add member schemas to `packages/shared/src/members/member.ts` — MemberSchema, AddMemberInputSchema, UpdateMemberPermissionsInputSchema, TransferOwnershipInputSchema, MemberRoleSchema
- [X] T003 Re-export member schemas from `packages/shared/src/index.ts` — add `export * from "./members/permissions"` and `export * from "./members/member"`
- [X] T004 [P] Add `server_members` table to `packages/db/src/schema/server-members.ts` — id, serverId (FK cascade), userId (FK cascade), role, 8 boolean permission columns, timestamps; unique(serverId, userId), index on userId, index on serverId
- [X] T005 Re-export `server_members` from `packages/db/src/schema/index.ts` — add `export { serverMembers } from "./server-members"`
- [X] T006 Export `serverMembers` from `packages/db/src/index.ts` — add to schema barrel export
- [X] T007 Generate Drizzle migration for `server_members` table — run `bun --filter @sigil/db db:generate`, verify migration SQL creates table with correct indexes and FKs

**Checkpoint**: Shared contracts and database schema ready.

---

## Phase 2: Foundational (Permission Middleware + Service)

**Purpose**: Core permission infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 [P] Create member service in `apps/api/src/services/member.service.ts` — getMember(serverId, userId), listMembers(serverId), addMember(serverId, email, permissions), updateMemberPermissions(memberId, permissions), removeMember(memberId), transferOwnership(serverId, newOwnerId), isOwner(serverId, userId)
- [X] T009 [P] Create permission middleware in `apps/api/src/middleware/server-permission.ts` — `requireServerPermission(permission: PermissionBit)` middleware: resolves serverId from route param, checks if user is admin (bypass) or member with the required permission bit; returns 403 FORBIDDEN if not; caches member lookup in context for the request
- [X] T010 Add member audit actions to `apps/api/src/services/audit.service.ts` — add `member_add`, `member_update`, `member_remove`, `member_transfer` to AuditAction type
- [X] T011 Modify server list query in `apps/api/src/services/server.service.ts` — `listServers` accepts a user parameter: admins get all servers, non-admins get only servers where they are a member (JOIN server_members)
- [X] T012 Modify server detail guard in `apps/api/src/routes/servers.ts` — `GET /:serverId` checks admin OR member of that server (not just admin-only)
- [X] T013 Run `bun run typecheck` and `bun run test` — verify API typechecks and existing tests still pass (no regressions from modified routes)

**Checkpoint**: Permission infrastructure ready — user stories can now be built.

---

## Phase 3: User Story 1 - Add a subuser to a server (Priority: P1) 🎯 MVP

**Goal**: An admin or member with `members` permission can add a registered user as a member of a server with specific permissions.

**Independent Test**: Add a member to a server via API and verify they appear in the member list with the correct permissions.

### Implementation for User Story 1

- [X] T014 [P] [US1] Create member routes in `apps/api/src/routes/members.ts` — `GET /api/admin/servers/:serverId/members` (list) and `POST /api/admin/servers/:serverId/members` (add); admin OR `members` permission guard; validates email exists as active user; prevents duplicates; creates member record with permissions; audit log
- [X] T015 [US1] Mount member routes in `apps/api/src/index.ts` — add `app.route("/api/admin/servers/:serverId/members", memberRoutes)`
- [X] T016 [US1] Auto-create owner member on server creation in `apps/api/src/services/server.service.ts` — when creating a server, insert a `server_members` row with `role=owner` and all permissions for the creating admin
- [X] T017 [US1] Write member route tests in `apps/api/src/routes/members.spec.ts` — test list returns owner, test add returns 201 with permissions, test add with non-existent email returns 400 USER_NOT_FOUND, test add duplicate returns 400 DUPLICATE_MEMBER, test add without members permission returns 403, test add for non-existent server returns 404
- [X] T018 [US1] Run `bun run typecheck` and `bun run test` — verify API typechecks and all tests pass

**Checkpoint**: Admin can add members to a server via API. MVP delivered.

---

## Phase 4: User Story 2 - Subuser accesses server according to permissions (Priority: P2)

**Goal**: A subuser sees only their assigned servers and can only perform permitted actions.

**Independent Test**: Login as a subuser, verify they see only their servers, and verify permission-gated routes return 403 for missing permissions.

### Implementation for User Story 2

- [X] T019 [P] [US2] Apply permission middleware to console route in `apps/api/src/routes/servers.ts` — replace admin-only guard on `POST /:serverId/console-token` with `requireServerPermission("console")`
- [X] T020 [P] [US2] Apply permission middleware to power route in `apps/api/src/routes/servers.ts` — replace admin-only guard on `POST /:serverId/power` with `requireServerPermission("power")`
- [X] T021 [P] [US2] Apply permission middleware to file routes in `apps/api/src/routes/files.ts` — replace admin-only guard with `requireServerPermission("files")` for all file routes
- [X] T022 [P] [US2] Apply permission middleware to backup routes in `apps/api/src/routes/backups.ts` — replace admin-only guard with `requireServerPermission("backups")` for all backup routes
- [X] T023 [US2] Update server list route in `apps/api/src/routes/servers.ts` — `GET /` returns filtered list for non-admins (using modified `listServers` from T011)
- [X] T024 [US2] Write permission enforcement tests in `apps/api/src/routes/members.spec.ts` — test subuser sees only their servers, test subuser without files permission gets 403 on files route, test subuser with files permission gets 200, test subuser without backups permission gets 403 on backups route, test admin bypasses all checks
- [X] T025 [US2] Run `bun run typecheck` and `bun run test` — verify all tests pass including permission enforcement

**Checkpoint**: Subusers can access servers according to their permissions.

---

## Phase 5: User Story 3 - Update or remove member permissions (Priority: P3)

**Goal**: An admin or member with `members` permission can update a member's permissions or remove them entirely.

**Independent Test**: Add a member, update their permissions, verify the change takes effect, remove them, verify they lose access.

### Implementation for User Story 3

- [X] T026 [US3] Add update and delete routes to `apps/api/src/routes/members.ts` — `PUT /:memberId` (update permissions, rejects owner modification) and `DELETE /:memberId` (remove, rejects owner removal); audit log both actions
- [X] T027 [US3] Write update/remove tests in `apps/api/src/routes/members.spec.ts` — test update returns 200 with new permissions, test update on owner returns 403 CANNOT_MODIFY_OWNER, test remove returns 204, test remove on owner returns 403 CANNOT_REMOVE_OWNER, test remove on non-existent member returns 404, test removed member loses server access
- [X] T028 [US3] Run `bun run typecheck` and `bun run test` — verify all tests pass

**Checkpoint**: Admins can update and remove member permissions.

---

## Phase 6: User Story 4 - Server owner role (Priority: P4)

**Goal**: The server creator is the owner with all permissions, cannot be removed, and can transfer ownership.

**Independent Test**: Create a server, verify the creator is owner, verify owner cannot be removed, transfer ownership, verify new owner cannot be removed.

### Implementation for User Story 4

- [X] T029 [US4] Add transfer ownership route to `apps/api/src/routes/members.ts` — `POST /transfer` (admin OR owner only); validates target is a member; swaps roles (old owner → member, new member → owner); audit log
- [X] T030 [US4] Write ownership tests in `apps/api/src/routes/members.spec.ts` — test creator is owner with all permissions, test owner cannot be removed, test owner cannot have permissions modified, test transfer ownership succeeds, test transfer to non-member returns 404, test non-owner transfer returns 403, test previous owner becomes member after transfer
- [X] T031 [US4] Run `bun run typecheck` and `bun run test` — verify all tests pass

**Checkpoint**: Owner role fully functional with transfer support.

---

## Phase 7: Panel UI

**Purpose**: Browser UI for all member and permission operations.

- [X] T032 [P] Create useMembers hook in `apps/panel/src/hooks/useMembers.ts` — useMemberList(serverId), useAddMember(serverId), useUpdateMember(serverId), useRemoveMember(serverId), useTransferOwnership(serverId)
- [X] T033 [P] Create member-list component in `apps/panel/src/components/members/member-list.tsx` — table showing username, email, role badge (owner/member), permission badges, edit/remove buttons; owner row shows badge but no edit/remove
- [X] T034 [P] Create member-add component in `apps/panel/src/components/members/member-add.tsx` — email input, 8 permission checkboxes, submit button, loading state, error display
- [X] T035 [P] Create member-permissions component in `apps/panel/src/components/members/member-permissions.tsx` — inline permission editor with 8 checkboxes, save button; used in member-list for editing
- [X] T036 Add Members section to server detail page in `apps/panel/src/components/servers/server-detail.tsx` — render member-add + member-list below Backups section; only visible if user has `members` permission or is admin
- [X] T037 Add permission-gated tab visibility in `apps/panel/src/components/servers/server-detail.tsx` — hide Files/Console/Backups/Members tabs if user lacks the corresponding permission; fetch current user's permissions for this server
- [X] T038 Run `bun run typecheck` — verify panel typechecks

**Checkpoint**: Panel UI complete for all member operations.

---

## Phase 8: Polish

**Purpose**: Final validation, E2E tests, and ROADMAP update.

- [X] T039 [P] Run `bun run check` (lint + format) and fix any issues in changed files
- [X] T040 [P] Run `bun run typecheck` and fix any type errors
- [X] T041 [P] Run `bun run test` and ensure all unit/integration tests pass
- [X] T042 MCP verification — start dev services, add a member via panel UI, verify in member list, update permissions, verify change, remove member, verify removed; login as subuser, verify only sees assigned server, verify permission-gated tabs hidden
- [X] T043 [P] Write E2E test for member add/list/update/remove in `apps/panel/tests/e2e/members.spec.ts` — login as admin, create server, add member via API, verify in panel list, update permissions, verify change, remove member, verify removed
- [X] T044 [P] Write E2E test for subuser access in `apps/panel/tests/e2e/members.spec.ts` — add member with limited permissions, login as subuser, verify only sees assigned server, verify permission-gated tabs hidden, verify 403 on restricted API
- [X] T045 Run `bun run test:e2e` and ensure all E2E tests pass (including new member tests)
- [X] T046 Run quickstart.md validation scenarios end-to-end
- [X] T047 Update ROADMAP.md to mark R13 as `done`
- [X] T048 Update `apps/api/src/routes/test-cleanup.ts` to delete `server_members` before servers (FK constraint)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3) can start after Foundational
  - US2 (Phase 4) depends on US1 (needs members to test permissions)
  - US3 (Phase 5) depends on US1 (needs members to update/remove)
  - US4 (Phase 6) depends on US1 (needs owner to exist)
- **Panel UI (Phase 7)**: Depends on all API user stories (Phase 3-6)
- **Polish (Phase 8)**: Depends on all phases being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (needs members to enforce permissions against)
- **User Story 3 (P3)**: Depends on US1 (needs members to update/remove)
- **User Story 4 (P4)**: Depends on US1 (needs owner to exist for transfer)

### Parallel Opportunities

- Setup: T001/T002 (different schema files) in parallel with T004 (DB schema)
- Foundational: T008/T009 (service vs middleware, different files) in parallel
- US2: T019/T020/T021/T022 (different route files) can all run in parallel
- Panel UI: T032/T033/T034/T035 (different component files) can run in parallel
- Polish: T039/T040/T041 (lint/typecheck/test) can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test that an admin can add a member via API
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Admin can add members → Test → Demo (MVP!)
3. Add US2 → Subusers see only their servers → Test → Demo
4. Add US3 → Admins can update/remove permissions → Test → Demo
5. Add US4 → Ownership transfer works → Test → Demo
6. Add Panel UI → Full browser experience → Test → Demo
7. Polish → E2E tests, ROADMAP → Commit

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- The daemon is NOT modified — permissions are purely API-side
- Admins bypass all permission checks (implicit all-permissions)
- Server creation and deletion remain admin-only (not delegatable in v1)
