# Tasks: File Manager

**Input**: Design documents from `/specs/009-file-manager/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are included for API routes, daemon handlers, and E2E flows.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared Zod schemas for file entries, content, and path validation.

- [X] T001 [P] Add file entry schemas to `packages/shared/src/files/entry.ts` — FileEntrySchema (name, path, size, isDir, modTime), FileListResponseSchema (path, entries[])
- [X] T002 [P] Add file content and operation schemas to `packages/shared/src/files/content.ts` — FileContentSchema, FileWriteInputSchema, FileCreateInputSchema, FileRenameInputSchema, FileUploadResponseSchema
- [X] T003 [P] Add path validation schemas to `packages/shared/src/files/path.ts` — FilePathSchema (no null bytes, no `../`, max 1024 chars), FileNameSchema (no path separators, max 255 chars)
- [X] T004 Re-export file schemas from `packages/shared/src/index.ts` — add `export * from "./files/entry"`, `export * from "./files/content"`, `export * from "./files/path"`

**Checkpoint**: Shared contracts ready.

---

## Phase 2: Foundational (Daemon + API Infrastructure)

**Purpose**: Extend the daemon with missing file operations and add API proxy routes. MUST be complete before ANY user story UI work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Daemon Extensions

- [X] T005 [P] Add SafeRename to jail in `apps/daemon/internal/jail/jail.go` — SafeRename(fromRel, toRel string) error, validates both paths within jail, uses os.Rename
- [X] T006 [P] Add SafeRename test to `apps/daemon/internal/jail/jail_test.go` — test rename within jail, test rename escaping jail rejected, test rename non-existent source
- [X] T007 Extend Manager with Mkdir, Stat, Rename in `apps/daemon/internal/server/manager.go` — Mkdir(serverID, relPath), Stat(serverID, relPath) (FileInfo), Rename(serverID, fromRel, toRel)
- [X] T008 Extend Manager ListFiles to return structured entries in `apps/daemon/internal/server/manager.go` — change return from []string to []FileEntry with name, size, isDir, modTime (use SafeStat per entry)
- [X] T009 [P] Add upload handler to daemon in `apps/daemon/internal/api/handlers.go` — POST /servers/{serverId}/files/upload?path=<dir>, reads binary body, writes to jail using SafeWrite
- [X] T010 [P] Add download handler to daemon in `apps/daemon/internal/api/handlers.go` — GET /servers/{serverId}/files/download?path=<file>, streams file content via SafeOpen
- [X] T011 Add mkdir, stat, rename handlers to daemon in `apps/daemon/internal/api/handlers.go` — POST /files/mkdir, GET /files/stat, POST /files/rename
- [X] T012 Register new file routes in daemon router in `apps/daemon/internal/api/router.go` — add upload, download, mkdir, stat, rename routes to protected mux
- [X] T013 Run `go build ./...` and `go vet ./...` and `go test ./...` in `apps/daemon/` — verify daemon compiles and tests pass

### API Extensions

- [X] T014 [P] Extend DaemonClient with file methods in `apps/api/src/services/daemon-client.service.ts` — add mkdir, stat, rename, upload (binary), download (stream) methods
- [X] T015 Create file routes in `apps/api/src/routes/files.ts` — GET /api/admin/servers/:serverId/files (list), GET .../files/read, PUT .../files/write, POST .../files/create, DELETE .../files, POST .../files/rename, POST .../files/upload, GET .../files/download
- [X] T016 Mount file routes in `apps/api/src/index.ts` — add admin file routes under /api/admin/servers/:serverId/files
- [X] T017 Write file route tests in `apps/api/src/routes/files.spec.ts` — list returns entries, read returns content, write saves content, create makes dir, delete removes file, rename renames, upload saves file, download streams file, 404 for non-existent server, 409 for not running, 502 for daemon unreachable
- [X] T018 Run `bun run typecheck` and `bun run test` — verify API typechecks and all tests pass

**Checkpoint**: Daemon + API infrastructure ready — panel UI implementation can begin.

---

## Phase 3: User Story 1 — Browse Server Files (P1)

**Goal**: Admin can browse the file tree of a running server's volume.

**Independent Test**: Open a running server's file page and verify the directory listing appears with correct file names and metadata.

### Implementation for User Story 1

- [X] T019 [P] [US1] Create useFiles hook in `apps/panel/src/hooks/useFiles.ts` — useFileList(serverId, path) returns FileListResponse, useFileContent(serverId, path) returns FileContent, mutations for write/create/delete/rename/upload
- [X] T020 [US1] Create file-browser component in `apps/panel/src/components/files/file-browser.tsx` — directory listing table (name, size, modTime, type icon), breadcrumb navigation, click directory to enter, click file to open editor
- [X] T021 [US1] Add Files tab to server detail page in `apps/panel/src/components/servers/server-detail.tsx` — tab/section showing file-browser when server is running, "server is not running" indicator when stopped
- [X] T022 [US1] MCP verification — start dev services, create + start a server, open Files tab, verify directory listing, verify navigation into subdirectories, verify breadcrumb, verify "not running" indicator for stopped server
- [X] T023 [US1] Add E2E test for file browsing in `apps/panel/tests/e2e/files.spec.ts` — create + start server, open Files tab, verify listing appears, verify directory navigation, verify breadcrumb

**Checkpoint**: Admin can browse live server files. MVP delivered.

---

## Phase 4: User Story 2 — Edit File Contents (P2)

**Goal**: Admin can view and edit text file contents.

**Independent Test**: Open a text file, modify content, save, reopen to verify changes persisted.

### Implementation for User Story 2

- [X] T024 [P] [US2] Create file-editor component in `apps/panel/src/components/files/file-editor.tsx` — textarea with monospace font, Save button, unsaved changes indicator, "file too large" error for >1MB, close button
- [X] T025 [US2] Integrate file editor into file-browser in `apps/panel/src/components/files/file-browser.tsx` — clicking a text file opens the editor, saving calls useFiles write mutation, unsaved changes warning on navigation
- [X] T026 [US2] MCP verification — open a text file, modify content, save, reopen to verify, try opening >1MB file, verify "file too large" error
- [X] T027 [US2] Add E2E test for file editing in `apps/panel/tests/e2e/files.spec.ts` — open file, edit content, save, reopen, verify changes persisted

**Checkpoint**: Admin can edit text files.

---

## Phase 5: User Story 3 — Upload and Download Files (P3)

**Goal**: Admin can upload files from their machine and download files to their machine.

**Independent Test**: Upload a file, verify it appears in listing, download it, verify content matches.

### Implementation for User Story 3

- [X] T028 [P] [US3] Create file-upload component in `apps/panel/src/components/files/file-upload.tsx` — file picker, upload progress indicator, overwrite confirmation dialog (calls upload with overwrite=true on confirm)
- [X] T029 [US3] Add download handler to file-browser in `apps/panel/src/components/files/file-browser.tsx` — Download button per file, triggers browser download via API endpoint
- [X] T030 [US3] MCP verification — upload a file, verify it appears in listing, download a file, verify it downloads, upload same name, verify overwrite confirmation
- [X] T031 [US3] Add E2E test for upload/download in `apps/panel/tests/e2e/files.spec.ts` — upload a file, verify in listing, download it, verify content

**Checkpoint**: Admin can upload and download files.

---

## Phase 6: User Story 4 — Delete and Create Files/Directories (P4)

**Goal**: Admin can create, delete, and rename files and directories.

**Independent Test**: Create a new directory, create a file inside it, rename it, and delete it.

### Implementation for User Story 4

- [X] T032 [P] [US4] Create file-toolbar component in `apps/panel/src/components/files/file-toolbar.tsx` — New File button (prompts for name), New Folder button (prompts for name), Upload button, refresh button
- [X] T033 [US4] Add delete and rename to file-browser in `apps/panel/src/components/files/file-browser.tsx` — Delete button per entry with confirmation dialog, Rename button with prompt, calls useFiles mutations
- [X] T034 [US4] Integrate file-toolbar into file-browser in `apps/panel/src/components/files/file-browser.tsx` — toolbar above listing, New File/Folder calls create mutation, refresh re-fetches listing
- [X] T035 [US4] MCP verification — create new folder, create new file, rename file, delete file, delete folder, verify all operations work
- [X] T036 [US4] Add E2E test for CRUD operations in `apps/panel/tests/e2e/files.spec.ts` — create folder, create file, rename, delete, verify all operations

**Checkpoint**: Admin can create, delete, and rename files.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, lint, and ROADMAP update.

- [X] T037 [P] Run `bun run check` (lint + format) and fix any issues in changed files
- [X] T038 [P] Run `bun run typecheck` and fix any type errors
- [X] T039 [P] Run `bun run test` and ensure all unit/integration tests pass
- [X] T040 [P] Run `go build ./...` and `go vet ./...` and `go test ./...` in `apps/daemon/` — verify daemon passes
- [X] T041 Run `bun run test:e2e` and ensure all E2E tests pass (including new file tests)
- [X] T042 Run quickstart.md validation scenarios end-to-end
- [X] T043 Update ROADMAP.md to mark R11 as `done`

---

## Dependencies

```text
Phase 1 (Setup) → Phase 2 (Foundational)
Phase 2 (Foundational) → Phase 3 (US1: Browse)
Phase 3 (US1) → Phase 4 (US2: Edit)
Phase 3 (US1) → Phase 5 (US3: Upload/Download)
Phase 3 (US1) → Phase 6 (US4: CRUD)
Phase 7 (Polish) → after all stories
```

## Parallel Opportunities

- **Phase 1**: T001/T002/T003 (different schema files)
- **Phase 2 Daemon**: T005/T006 (jail rename + test) in parallel with T009/T010 (upload/download handlers)
- **Phase 2 API**: T014 (DaemonClient) in parallel with daemon work
- **Phase 3-6**: T019 (hooks), T024 (editor), T028 (upload), T032 (toolbar) are all different files

## Implementation Strategy

**MVP**: Phase 1 + Phase 2 + Phase 3 (US1) — admin can browse server files.

**Incremental delivery**: Each user story adds one capability (browse → edit → upload/download → CRUD). Each is independently testable.

## Independent Test Criteria

- **US1**: Start a server, open Files tab, verify directory listing and navigation
- **US2**: Open a text file, edit, save, reopen, verify changes
- **US3**: Upload a file, verify in listing, download, verify content
- **US4**: Create folder, create file, rename, delete, verify all operations
