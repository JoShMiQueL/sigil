# Implementation Plan: File Manager

**Branch**: `009-file-manager` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-file-manager/spec.md`

## Summary

R11 adds a web-based file manager for browsing, editing, uploading, downloading, creating, deleting, and renaming files in a server's volume. The daemon already has a jail package with SafeRead, SafeWrite, SafeList, SafeDelete, SafeMkdirAll, SafeStat, ExtractZip, and ExtractTar. The API's DaemonClient already has methods for read, write, list, and delete. The work is: (1) extend the daemon with missing operations (mkdir, stat, rename, upload stream, download stream), (2) add API REST routes that proxy to the daemon, (3) build the panel UI with a file browser, editor, upload/download, and CRUD operations.

## Technical Context

**Language/Version**: TypeScript 7.0 (API + panel), Go 1.27 (daemon)

**Primary Dependencies**: Hono 4.13 (API), React 19.2 + TanStack Query + TanStack Router (panel), Go net/http + Docker Engine API (daemon)

**Storage**: PostgreSQL (server records), Docker volumes (server files). No new database tables.

**Testing**: Vitest 5 (unit/integration), Testcontainers 12 (integration), Playwright 1.62 (E2E), go test (daemon)

**Target Platform**: Linux server (daemon), browser (panel)

**Project Type**: web-service (monorepo: API + panel + daemon)

**Performance Goals**: File operations <2s for files <1MB, directory listing <1s for 100+ files

**Constraints**: File edit max 1MB, upload max 100MB, path traversal blocked by jail, no SFTP in R11

**Scale/Scope**: 4 user stories, ~15 new endpoints, ~8 new panel components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Panel proxies to daemon via HTTP. Panel never touches filesystem. Daemon never touches DB. |
| II. Shared Contracts as Source of Truth | ✅ PASS | File entry/content schemas in `packages/shared`. |
| III. Security-First Container Isolation | ✅ PASS | All file ops go through daemon jail. Path traversal blocked. No direct fs access from API. |
| IV. Test Against Real Infrastructure | ✅ PASS | Integration tests use real Docker + Testcontainers. E2E uses real daemon. |
| V. Spec-Driven Development | ✅ PASS | Spec created and validated before planning. |
| VI. Real-time Protocol Selection | ✅ PASS | File operations use HTTP (actions), not WebSocket. SSE not needed for file ops. |

**Post-Phase 1 Re-check**: ✅ All principles still pass after design.

## Project Structure

### Documentation (this feature)

```text
specs/009-file-manager/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/api.md     # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/files/
├── entry.ts             # FileEntrySchema, FileListResponseSchema
├── content.ts           # FileContentSchema, FileUploadResponseSchema
└── index re-exports

apps/api/src/
├── routes/files.ts      # REST routes: list, read, write, delete, mkdir, rename, upload, download
├── routes/files.spec.ts # Route tests
└── services/daemon-client.service.ts  # Extended with new file methods

apps/daemon/internal/
├── api/handlers.go      # Extended: mkdir, stat, rename, upload, download handlers
├── api/router.go        # Extended: new file routes
├── server/manager.go    # Extended: Mkdir, Stat, Rename methods
└── jail/jail.go         # Extended: SafeRename method

apps/panel/src/
├── hooks/useFiles.ts    # React Query hooks for file operations
├── components/files/
│   ├── file-browser.tsx # Directory listing, navigation, breadcrumbs
│   ├── file-editor.tsx  # Text file editor with save
│   ├── file-upload.tsx  # Upload component
│   └── file-toolbar.tsx # New file, new folder, upload, download buttons
└── routes/server-detail.tsx  # Extended with Files tab

apps/panel/tests/e2e/
└── files.spec.ts        # E2E tests for file manager
```

## Phases

### Phase 0: Research

See [research.md](./research.md) for detailed decisions on:
1. Upload/download strategy (streaming vs buffered)
2. File size limits and validation
3. Rename implementation (atomic vs copy+delete)
4. Directory listing format (flat vs tree)
5. Editor component (textarea vs code editor)
6. Path validation on the API side
7. Error handling for daemon unreachable
8. Overwrite confirmation flow

### Phase 1: Design & Contracts

See [data-model.md](./data-model.md) for entity definitions and validation rules.
See [contracts/api.md](./contracts/api.md) for REST endpoint specifications.
See [quickstart.md](./quickstart.md) for validation scenarios.
