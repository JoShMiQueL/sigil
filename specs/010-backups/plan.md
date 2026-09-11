# Implementation Plan: Backups

**Branch**: `010-backups` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-backups/spec.md`

## Summary

R12 adds server backup creation, restore, listing, deletion, and per-node storage backend configuration (local or S3-compatible). The daemon creates tar.gz archives of server volumes through the existing jail, stores them locally or uploads to S3. The panel stores backup metadata in PostgreSQL and orchestrates operations via authenticated HTTP to the daemon. Restore stops the server, replaces volume contents, and leaves it stopped.

## Technical Context

**Language/Version**: TypeScript 7.0 (panel/API), Go 1.27 (daemon)

**Primary Dependencies**:
- Panel/API: Hono 4.13, Drizzle ORM 0.45, Zod 4.5, React 19.2, TanStack Query/Router
- Daemon: Go stdlib `archive/tar`, `compress/gzip`, `net/http`; AWS S3 SDK for Go (`aws-sdk-go-v2`)
- New: `aws-sdk-go-v2/s3` (daemon) for S3-compatible storage

**Storage**: PostgreSQL (backup metadata, storage config), local filesystem or S3 (backup files)

**Testing**: Vitest 5 (API), `go test` (daemon), Playwright 1.62 (E2E), Testcontainers 12

**Target Platform**: Linux server (daemon + API), browser (panel)

**Project Type**: Web service (panel/API + daemon)

**Performance Goals**: 1GB backup in under 5 minutes, backup list loads in under 2s

**Constraints**: Backups go through jail, panel never touches node FS, admin-only, streaming for large files

**Scale/Scope**: Single-node deployments initially, per-node storage config

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Control Plane / Execution Plane Separation — ✅ PASS
- Panel stores backup metadata in PostgreSQL, never touches node filesystem.
- Daemon creates, stores, and restores backup files through the jail.
- Panel sends commands to daemon via authenticated HTTP.

### Principle II: Shared Contracts as Source of Truth — ✅ PASS
- Backup schemas (Backup, BackupStatus, BackupStorageConfig) defined in `packages/shared`.
- Both panel and daemon import shared types.

### Principle III: Security-First Container Isolation — ✅ PASS
- Backups are created from the jailed volume — no direct filesystem access.
- Restore writes through the jail — no path traversal possible.
- S3 credentials encrypted at rest in the panel DB (reuse existing encryption).

### Principle IV: Test Against Real Infrastructure — ✅ PASS
- Daemon backup tests use real filesystem (temp dirs).
- S3 tests use Testcontainers MinIO or skip if no S3 available.
- E2E tests verify backup create/restore via real daemon + Testcontainers.

### Principle V: Spec-Driven Development — ✅ PASS
- Spec, plan, data model, contracts, and tasks generated before implementation.

### Principle VI: Real-time Protocol Selection — ✅ PASS
- Backup operations are HTTP request/response (create, restore, list, delete, config).
- Backup status updates via SSE (existing panel SSE infrastructure) or polling fallback.
- No WebSocket needed for backups.

## Project Structure

### Documentation (this feature)

```text
specs/010-backups/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/shared/src/backups/
├── backup.ts            # Backup, BackupStatus, BackupStorageConfig schemas
└── index.ts             # Re-exports

packages/db/src/schema/
├── backups.ts           # New: backups table
├── backup-storage.ts    # New: per-node storage config table
└── index.ts             # Updated: re-export new schemas

apps/daemon/internal/
├── backup/
│   ├── manager.go       # Backup creation, restore, delete, list
│   ├── archive.go       # tar.gz creation/extraction through jail
│   ├── s3.go            # S3-compatible storage client
│   └── local.go         # Local filesystem storage
├── api/
│   ├── handlers.go      # Extended: backup handlers
│   └── router.go        # Extended: backup routes
└── config/
    └── config.go        # Extended: backup storage path config

apps/api/src/
├── routes/
│   └── backups.ts       # New: REST routes for backups
├── services/
│   └── daemon-client.service.ts  # Extended: backup methods
└── index.ts             # Extended: mount backup routes

apps/panel/src/
├── hooks/
│   └── useBackups.ts    # New: TanStack Query hooks
└── components/
    └── backups/
        ├── backup-list.tsx      # New: backup list + delete
        ├── backup-create.tsx    # New: create backup button
        └── backup-restore.tsx   # New: restore with confirmation
```

**Structure Decision**: Follows existing monorepo pattern (shared + api + panel + daemon). New `backups/` directory in shared, daemon, and panel. DB schema gets two new tables. No new packages.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
