# Research: Backups

**Date**: 2026-09-11
**Feature**: R12 Backups
**Spec**: [spec.md](./spec.md)

## Research Tasks

### 1. Archive format: tar.gz vs zip vs custom

**Decision**: tar.gz (gzip-compressed tar)

**Rationale**:
- Go stdlib has `archive/tar` and `compress/gzip` — no external dependencies.
- tar.gz is the standard for Linux server backups (Pterodactyl uses it too).
- Better compression for text-heavy game server files (configs, logs).
- Streaming-friendly: can create and extract without loading the entire archive in memory.
- The daemon jail already has `ExtractTar` — we can reuse the extraction logic for restore.

**Alternatives considered**:
- zip: Simpler random access, but Go's `archive/zip` doesn't stream as well for large archives. Less compression for text files.
- zstd: Better compression ratio and speed, but requires external Go dependency. Can be added later as an option.
- Custom format: No benefit over tar.gz, adds complexity.

### 2. S3 client library for Go

**Decision**: `aws-sdk-go-v2/s3` with custom endpoint resolver

**Rationale**:
- Official AWS SDK for Go v2 is well-maintained, has S3-compatible API support.
- Supports custom endpoints (MinIO, R2, B2) via endpoint resolver.
- Streaming upload/download — doesn't load entire backup into memory.
- Mature, battle-tested, handles retries and error mapping.

**Alternatives considered**:
- `minio-go`: MinIO's own SDK, excellent for S3-compatible but adds a non-AWS dependency.
- `gocloud.dev/blob`: Cloud-agnostic abstraction, but overkill for just S3.
- Raw HTTP: Too much boilerplate for S3's auth and multipart upload.

### 3. Backup status tracking: sync vs async

**Decision**: Async with status polling via SSE

**Rationale**:
- Backups can take minutes for large volumes. HTTP request would timeout.
- The panel creates a backup record with "pending" status, sends the command to the daemon, and the daemon updates status via callback or the panel polls.
- The existing SSE infrastructure (R3) can push status updates to the browser.
- For v1, the panel can poll the daemon for status every few seconds (simple) and transition to SSE in a follow-up.

**Flow**:
1. Panel creates backup record (status=pending) in PostgreSQL.
2. Panel sends "create backup" command to daemon via HTTP.
3. Daemon creates the archive, uploads to local/S3, calls back to panel with status (completed/failed) + size.
4. Panel updates the backup record.
5. Browser sees the update via SSE or refetch.

**Alternatives considered**:
- Sync HTTP: Blocks the request for minutes, timeouts.
- WebSocket: Overkill for one-way status updates.
- Daemon writes directly to DB: Violates Principle I (daemon never touches DB).

### 4. Restore flow: stop server first

**Decision**: Panel stops the server, tells daemon to restore, leaves server stopped

**Rationale**:
- Restoring a running server's volume would corrupt files in use.
- The panel already has power action endpoints (R9) — reuse them.
- After restore, the admin manually restarts the server. This is safer than auto-restarting.

**Flow**:
1. Panel checks if server is running. If so, sends stop command.
2. Panel waits for server to stop (poll status or SSE).
3. Panel sends "restore backup" command to daemon.
4. Daemon extracts the archive into the volume through the jail.
5. Panel updates backup record's "lastRestoredAt" timestamp.
6. Server stays stopped — admin restarts manually.

### 5. S3 credential storage

**Decision**: Encrypt S3 credentials using existing panel encryption

**Rationale**:
- The panel already has encryption infrastructure (`apps/api/src/lib/crypto.ts`) used for node credentials.
- S3 secret keys are sensitive — must not be stored in plaintext.
- Per-node storage config means each node can have different S3 credentials.

### 6. Local storage path configuration

**Decision**: Configurable per-node, default `/var/lib/sigil/backups`

**Rationale**:
- The daemon already has `VolumeBasePath` config — add `BackupBasePath` alongside it.
- Default to `/var/lib/sigil/backups` (matching the volume base pattern).
- The daemon creates the directory if it doesn't exist (like it does for volumes).

### 7. Backup size limits

**Decision**: Configurable per node, default 10GB per backup

**Rationale**:
- Game server volumes can range from MB to GB.
- A 10GB default prevents runaway backups from filling disk.
- The daemon checks available disk space before starting a backup (reuse `isDiskFull` check).

### 8. Concurrent backup prevention

**Decision**: Daemon tracks in-progress backups per server, rejects concurrent requests

**Rationale**:
- Two backups on the same server would race on the volume.
- The daemon's backup manager tracks active backups by server ID.
- The panel also checks status before allowing a new backup (defense in depth).
