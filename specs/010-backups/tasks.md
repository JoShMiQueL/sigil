# Tasks: Backups

**Input**: Design documents from `/specs/010-backups/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included for all user stories (unit tests for API routes, daemon tests, E2E tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared Zod schemas and database tables that all user stories depend on.

- [X] T001 [P] Add backup Zod schemas to `packages/shared/src/backups/backup.ts` — BackupSchema, BackupListResponseSchema, CreateBackupInputSchema, BackupStatusSchema, BackupStorageConfigSchema, UpdateBackupStorageConfigInputSchema
- [X] T002 [P] Re-export backup schemas from `packages/shared/src/index.ts` — add `export * from "./backups/backup"`
- [X] T003 [P] Add backups table to `packages/db/src/schema/backups.ts` — id, serverId, nodeId, name, sizeBytes, status, storageLocation, checksum, errorMessage, createdAt, completedAt; indexes on serverId, nodeId, status
- [X] T004 [P] Add backup_storage_configs table to `packages/db/src/schema/backup-storage.ts` — id, nodeId (unique), backend, localPath, s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey, s3Region, maxBackupSizeGb, createdAt, updatedAt
- [X] T005 Re-export new schemas from `packages/db/src/schema/index.ts` — add `export { backups } from "./backups"` and `export { backupStorageConfigs } from "./backup-storage"`
- [X] T006 Generate Drizzle migration for new tables — run `bun --filter @sigil/db db:generate`, verify migration SQL creates both tables with correct indexes and FKs

**Checkpoint**: Shared contracts and database schema ready.

---

## Phase 2: Foundational (Daemon Backup Infrastructure)

**Purpose**: Daemon-side backup creation, restore, delete, and storage backend support. MUST complete before any user story UI/API work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 [P] Add `BackupBasePath` to daemon config in `apps/daemon/internal/config/config.go` — new field `BackupBasePath string` with default `/var/lib/sigil/backups`, create directory in Validate()
- [X] T008 [P] Add `aws-sdk-go-v2/s3` dependency to daemon — `cd apps/daemon && go get github.com/aws/aws-sdk-go-v2/s3 github.com/aws/aws-sdk-go-v2/config`
- [X] T009 [P] Create local storage backend in `apps/daemon/internal/backup/local.go` — LocalStorage struct with Store(reader, key), Retrieve(key) (io.ReadCloser), Delete(key), Path(key) methods; uses BackupBasePath
- [X] T010 [P] Create S3 storage backend in `apps/daemon/internal/backup/s3.go` — S3Storage struct with Store, Retrieve, Delete methods; uses aws-sdk-go-v2 with custom endpoint resolver; streaming upload/download
- [X] T011 Create archive creation in `apps/daemon/internal/backup/archive.go` — CreateArchive(jail, serverID) (io.ReadSeeker, size, error) that walks the jail volume and creates a tar.gz stream; ExtractArchive(jail, serverID, reader) error that extracts tar.gz into volume through jail
- [X] T012 Create backup manager in `apps/daemon/internal/backup/manager.go` — BackupManager with CreateBackup(serverID, backupID, name, storageConfig) and RestoreBackup(serverID, backupID, storageConfig) and DeleteBackup(serverID, backupID, storageConfig); tracks in-progress backups per server; returns BACKUP_IN_PROGRESS error if concurrent
- [X] T013 [P] Add backup storage config endpoint to daemon in `apps/daemon/internal/api/handlers.go` — GET /servers/{serverId}/backups/config returns the daemon's local backup path; POST /servers/{serverId}/backups/config receives S3 config from panel (encrypted)
- [X] T014 Add backup create handler to daemon in `apps/daemon/internal/api/handlers.go` — POST /servers/{serverId}/backups creates tar.gz, stores to local/S3, returns {backupId, sizeBytes, checksum, status}
- [X] T015 Add backup restore handler to daemon in `apps/daemon/internal/api/handlers.go` — POST /servers/{serverId}/backups/{backupId}/restore downloads from storage, extracts tar.gz into volume through jail
- [X] T016 Add backup delete handler to daemon in `apps/daemon/internal/api/handlers.go` — DELETE /servers/{serverId}/backups/{backupId} removes from storage
- [X] T017 Register backup routes in daemon router in `apps/daemon/internal/api/router.go` — add backup routes to protected mux
- [X] T018 Run `go build ./...` and `go vet ./...` and `go test ./...` in `apps/daemon/` — verify daemon compiles and tests pass

**Checkpoint**: Daemon backup infrastructure ready — API and panel can now be built.

---

## Phase 3: User Story 1 - Create a backup (Priority: P1) 🎯 MVP

**Goal**: Admin can create a backup of a server's volume and see it in the list.

**Independent Test**: Create a server with files, trigger a backup, verify it appears in the list with "completed" status and non-zero size.

### Implementation for User Story 1

- [X] T019 [P] [US1] Extend DaemonClient with backup methods in `apps/api/src/services/daemon-client.service.ts` — add createBackup(serverId, backupId, name, storageLocation), restoreBackup(serverId, backupId, storageLocation), deleteBackup(serverId, backupId, storageLocation)
- [X] T020 [P] [US1] Create backup routes in `apps/api/src/routes/backups.ts` — GET /api/admin/servers/:serverId/backups (list), POST /api/admin/servers/:serverId/backups (create); admin guard, server lookup, daemon client creation, error mapping
- [X] T021 Mount backup routes in `apps/api/src/index.ts` — add `app.route("/api/admin/servers/:serverId/backups", backupRoutes)`
- [X] T022 [US1] Implement backup creation flow in `apps/api/src/routes/backups.ts` — POST creates backup record (status=pending) in DB, sends command to daemon, updates record with size/checksum/status on response, handles errors (daemon unreachable, backup in progress)
- [X] T023 [US1] Add backup audit actions to `apps/api/src/services/audit.service.ts` — add `backup_create`, `backup_restore`, `backup_delete` to AuditAction type
- [X] T024 [US1] Write backup route tests in `apps/api/src/routes/backups.spec.ts` — test list returns empty, test create returns 201 with pending status, test create with invalid name returns 400, test create for non-existent server returns 404, test create with backup in progress returns 409
- [X] T025 Run `bun run typecheck` and `bun run test` — verify API typechecks and all tests pass

**Checkpoint**: Admin can create a backup via API. MVP delivered.

---

## Phase 4: User Story 2 - Restore a backup (Priority: P2)

**Goal**: Admin can restore a completed backup to its server, replacing volume contents.

**Independent Test**: Create a backup, modify server files, restore the backup, verify files match the backup state.

### Implementation for User Story 2

- [X] T026 [US2] Add restore route to `apps/api/src/routes/backups.ts` — POST /api/admin/servers/:serverId/backups/:backupId/restore; checks backup status is "completed", stops server if running (via power action), calls daemon restore, leaves server stopped
- [X] T027 [US2] Implement restore flow in `apps/api/src/routes/backups.ts` — fetch backup record, verify status=completed, check if server running and stop it, call daemon restoreBackup, update backup record lastRestoredAt, audit log
- [X] T028 [US2] Add restore tests to `apps/api/src/routes/backups.spec.ts` — test restore returns 200 for completed backup, test restore returns 409 for non-completed backup, test restore returns 404 for non-existent backup

**Checkpoint**: Admin can restore backups via API.

---

## Phase 5: User Story 3 - List and delete backups (Priority: P3)

**Goal**: Admin can view all backups for a server and delete unwanted ones.

**Independent Test**: Create two backups, verify both in list, delete one, verify only one remains.

### Implementation for User Story 3

- [X] T029 [US3] Add delete route to `apps/api/src/routes/backups.ts` — DELETE /api/admin/servers/:serverId/backups/:backupId; checks backup not in progress, calls daemon deleteBackup, removes record from DB, audit log
- [X] T030 [US3] Implement list with metadata in `apps/api/src/routes/backups.ts` — GET returns backups with name, size, date, storage location, status; ordered by createdAt desc
- [X] T031 [US3] Add delete tests to `apps/api/src/routes/backups.spec.ts` — test delete returns 204 for completed backup, test delete returns 409 for in-progress backup, test delete returns 404 for non-existent backup

**Checkpoint**: Admin can list and delete backups via API.

---

## Phase 6: User Story 4 - Configure storage backend (Priority: P4)

**Goal**: Admin can configure per-node storage backend (local or S3) and test S3 connectivity.

**Independent Test**: Configure a node to use local storage, create a backup, verify stored locally. Configure S3, test connectivity, create a backup, verify stored in S3.

### Implementation for User Story 4

- [X] T032 [P] [US4] Create storage config routes in `apps/api/src/routes/backup-storage.ts` — GET /api/admin/nodes/:nodeId/backup-storage (get config), PUT (update config), POST /test (test S3 connectivity); admin guard, encrypt S3 secret key before saving
- [X] T033 [US4] Mount storage config routes in `apps/api/src/index.ts` — add `app.route("/api/admin/nodes/:nodeId/backup-storage", backupStorageRoutes)`
- [X] T034 [US4] Implement S3 connectivity test in `apps/api/src/routes/backup-storage.ts` — POST /test sends a HEAD bucket request to the S3 endpoint via daemon, returns ok/failure without saving config
- [X] T035 [US4] Write storage config tests in `apps/api/src/routes/backup-storage.spec.ts` — test GET returns default local config, test PUT with S3 config saves and encrypts secret key, test PUT with invalid S3 config returns 400, test POST /test with valid credentials returns 200, test POST /test with invalid credentials returns 502

**Checkpoint**: Admin can configure storage backends via API.

---

## Phase 7: Panel UI

**Purpose**: Browser UI for all backup operations.

- [X] T036 [P] Create useBackups hook in `apps/panel/src/hooks/useBackups.ts` — useBackupList(serverId), useCreateBackup(serverId), useRestoreBackup(serverId), useDeleteBackup(serverId), useBackupStorageConfig(nodeId), useUpdateBackupStorageConfig(nodeId), useTestBackupStorage(nodeId)
- [X] T037 [P] Create backup-list component in `apps/panel/src/components/backups/backup-list.tsx` — table showing name, size, date, storage location, status; delete button per row with confirmation; restore button per completed backup with confirmation
- [X] T038 [P] Create backup-create component in `apps/panel/src/components/backups/backup-create.tsx` — "Create Backup" button, name input, submit, loading state, error display
- [X] T039 [P] Create backup-storage-config component in `apps/panel/src/components/backups/backup-storage-config.tsx` — form for backend selection (local/s3), S3 fields (endpoint, bucket, access key, secret key, region), max size, test button, save button
- [X] T040 Add Backups section to server detail page in `apps/panel/src/components/servers/server-detail.tsx` — render backup-create + backup-list below Files section
- [X] T041 Add Backup Storage tab to node detail or settings page in `apps/panel/src/components/` — render backup-storage-config for the selected node

**Checkpoint**: Panel UI complete for all backup operations.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, E2E tests, and ROADMAP update.

- [X] T042 [P] Run `bun run check` (lint + format) and fix any issues in changed files
- [X] T043 [P] Run `bun run typecheck` and fix any type errors
- [X] T044 [P] Run `bun run test` and ensure all unit/integration tests pass
- [X] T045 [P] Run `go build ./...` and `go vet ./...` and `go test ./...` in `apps/daemon/` — verify daemon passes
- [X] T046 MCP verification — start dev services, create a server with files, create a backup, verify it appears in the panel, restore it, verify files restored, delete it, verify removed; configure S3 storage, test connectivity
- [X] T047 [P] Write E2E test for backup create/list/delete in `apps/panel/tests/e2e/backups.spec.ts` — login, create server, create backup via API, verify in panel list, delete via API, verify removed from list
- [X] T048 [P] Write E2E test for backup restore in `apps/panel/tests/e2e/backups.spec.ts` — create backup, modify files, restore via API, verify files match backup
- [X] T049 Run `bun run test:e2e` and ensure all E2E tests pass (including new backup tests)
- [X] T050 Run quickstart.md validation scenarios end-to-end
- [X] T051 Update ROADMAP.md to mark R12 as `done`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (shared schemas) — BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Phase 2 completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): Depends on US1 (needs a completed backup to restore)
  - US3 (Phase 5): Depends on US1 (needs backups to list/delete)
  - US4 (Phase 6): Independent of US1-US3 (storage config is separate)
- **Panel UI (Phase 7)**: Depends on all API user stories (Phases 3-6)
- **Polish (Phase 8)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — creates backups
- **US2 (P2)**: Can start after US1 — restores existing backups
- **US3 (P3)**: Can start after US1 — lists/deletes existing backups
- **US4 (P4)**: Can start after Foundational — independent of US1-US3

### Parallel Opportunities

- Setup: T001/T002/T003/T004 (different files)
- Foundational: T007/T008/T009/T010 (different daemon files)
- US1: T019/T020 (different files)
- US4: T032 (separate route file)
- Panel UI: T036/T037/T038/T039 (different component files)
- Polish: T042/T043/T044/T045 (different checks)

---

## Parallel Example: User Story 1

```bash
# Launch daemon client + route creation in parallel:
Task: "Extend DaemonClient with backup methods in apps/api/src/services/daemon-client.service.ts"
Task: "Create backup routes in apps/api/src/routes/backups.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared schemas + DB tables)
2. Complete Phase 2: Foundational (daemon backup infrastructure)
3. Complete Phase 3: User Story 1 (create backup via API)
4. **STOP and VALIDATE**: Test backup creation end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Daemon can create/restore/delete backups
2. Add US1 → Admin can create backups via API (MVP!)
3. Add US2 → Admin can restore backups
4. Add US3 → Admin can list and delete backups
5. Add US4 → Admin can configure storage backends
6. Add Panel UI → All operations available in browser
7. Polish → E2E tests, ROADMAP update

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Backups go through the daemon jail — panel never touches node filesystem
- S3 credentials are encrypted in the panel DB using existing crypto infrastructure
