# Feature Specification: Backups

**Feature Branch**: `010-backups`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "R12 Backups — Create, restore, local + S3 storage"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a backup (Priority: P1)

An admin can create a backup of a server's volume. The backup captures the current state of all files in the server's jailed filesystem. The admin selects the server, triggers a backup, and the system creates a compressed archive stored either locally on the node or in a configured S3-compatible backend.

**Why this priority**: Without the ability to create backups, no protection exists. This is the foundational operation — everything else (restore, list, delete) depends on a backup existing first.

**Independent Test**: Start a server, create a backup, verify the backup appears in the server's backup list with a non-zero size and a "completed" status.

**Acceptance Scenarios**:

1. **Given** a running server with files in its volume, **When** the admin triggers a backup, **Then** the system creates a compressed archive of the volume and records it in the backup list with "completed" status.
2. **Given** a stopped server with files in its volume, **When** the admin triggers a backup, **Then** the system still creates a backup successfully (server state does not block backups).
3. **Given** a server with a very large volume (approaching storage limit), **When** the admin triggers a backup, **Then** the system rejects the backup with a clear "insufficient storage" error before attempting the operation.
4. **Given** a daemon that is unreachable, **When** the admin triggers a backup, **Then** the panel shows a clear "daemon unreachable" error without crashing.

---

### User Story 2 - Restore a backup (Priority: P2)

An admin can restore a previously created backup to a server. Restoring replaces the current volume contents with the backup's contents. The admin must confirm the operation because it overwrites existing files.

**Why this priority**: A backup without restore is just storage. Restore is the second half of the backup contract — it's what makes backups useful.

**Independent Test**: Create a backup, modify the server's files, restore the backup, verify the files match the backup state.

**Acceptance Scenarios**:

1. **Given** a completed backup exists for a server, **When** the admin restores it, **Then** the server's volume contents are replaced with the backup's contents.
2. **Given** a server with unsaved changes, **When** the admin restores a backup, **Then** the system asks for confirmation before overwriting.
3. **Given** a backup stored in S3, **When** the admin restores it, **Then** the system downloads the backup from S3 and applies it to the volume.
4. **Given** a corrupted or missing backup file, **When** the admin attempts restore, **Then** the system shows a clear error and leaves the volume untouched.

---

### User Story 3 - List and delete backups (Priority: P3)

An admin can view all backups for a server and delete backups that are no longer needed. The list shows backup name, size, creation date, storage location, and status.

**Why this priority**: Backups accumulate storage cost. Without listing and deletion, backups become unmanageable. This is the management layer on top of create/restore.

**Independent Test**: Create two backups, verify both appear in the list, delete one, verify only one remains.

**Acceptance Scenarios**:

1. **Given** multiple backups exist for a server, **When** the admin opens the backups list, **Then** all backups are shown with name, size, date, storage location, and status.
2. **Given** a backup that is no longer needed, **When** the admin deletes it, **Then** the backup is removed from both the list and the storage backend.
3. **Given** a backup that is currently being created (in-progress), **When** the admin attempts to delete it, **Then** the system rejects the deletion with a "backup in progress" error.

---

### User Story 4 - Configure storage backend (Priority: P4)

An admin can configure where backups are stored: local filesystem on the node, or an S3-compatible service (MinIO, R2, B2, AWS S3). The configuration is per-node, allowing different nodes to use different backends.

**Why this priority**: Storage configuration is infrastructure setup. It's needed before backups can be created, but it can use a sensible default (local) and be configured later for S3.

**Independent Test**: Configure a node to use local storage, create a backup, verify it's stored locally. Configure S3, create a backup, verify it's stored in S3.

**Acceptance Scenarios**:

1. **Given** a node with no backup storage configured, **When** the admin creates a backup, **Then** the system uses local storage on the node as the default.
2. **Given** valid S3 credentials, **When** the admin configures S3 storage for a node, **Then** subsequent backups are stored in the S3 bucket.
3. **Given** invalid S3 credentials, **When** the admin tests the configuration, **Then** the system shows a clear "connection failed" error without saving the configuration.

---

### Edge Cases

- What happens when the node runs out of disk space during a backup? The daemon detects the failure, marks the backup as "failed", and cleans up the partial archive.
- What happens when an S3 upload fails mid-backup? The daemon retries with exponential backoff, and if still failing, marks the backup as "failed" and cleans up.
- What happens when two admins create a backup on the same server simultaneously? The second request is rejected with a "backup already in progress" error.
- What happens when a backup is restored to a server that is currently running? The system stops the server, restores the backup, and leaves the server stopped (admin must manually restart).
- What happens when a backup name contains invalid characters? The system rejects it with a validation error before attempting the operation.
- What happens when a backup is very large (>10GB)? The system uses streaming/chunked transfer to avoid loading the entire backup into memory.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an admin to create a backup of any server's volume.
- **FR-002**: System MUST store backups either locally on the node or in a configured S3-compatible backend.
- **FR-003**: System MUST compress backups to reduce storage usage.
- **FR-004**: System MUST list all backups for a server with metadata (name, size, date, location, status).
- **FR-005**: System MUST allow an admin to restore a backup to its server, replacing current volume contents.
- **FR-006**: System MUST require explicit confirmation before restoring (overwrite warning).
- **FR-007**: System MUST allow an admin to delete a backup from both the list and the storage backend.
- **FR-008**: System MUST reject deletion of a backup that is currently being created.
- **FR-009**: System MUST show clear errors for: daemon unreachable, insufficient storage, corrupted backup, S3 connection failure.
- **FR-010**: System MUST track backup status (pending, in-progress, completed, failed) and surface it to the admin.
- **FR-011**: System MUST allow per-node configuration of the storage backend (local or S3).
- **FR-012**: System MUST test S3 connectivity before saving the configuration.
- **FR-013**: System MUST log all backup operations (create, restore, delete) to the audit log.
- **FR-014**: System MUST enforce that all backup file operations go through the daemon jail — the panel never touches the node filesystem directly.
- **FR-015**: System MUST stop a running server before restoring a backup and leave it stopped after.

### Key Entities *(include if feature involves data)*

- **Backup**: Represents a snapshot of a server's volume at a point in time. Key attributes: id, serverId, name, size, status, storageLocation (local/s3), createdAt, completedAt.
- **BackupStorageConfig**: Per-node configuration for backup storage. Key attributes: nodeId, backend (local/s3), s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey (encrypted).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can create a backup of a 1GB server volume in under 5 minutes.
- **SC-002**: Admin can restore a backup and see the restored files in the file manager within 1 minute of restore completion.
- **SC-003**: Backup list loads in under 2 seconds even with 100+ backups.
- **SC-004**: 95% of backup operations complete successfully on the first attempt under normal conditions.
- **SC-005**: Admin can configure S3 storage and create a successful backup in S3 within 10 minutes of configuration.

## Assumptions

- The daemon already has access to the server's volume filesystem (established in R9).
- The existing jail infrastructure (R11) will be used for all backup file operations — backups are archives of the jailed volume.
- Only admin users can create, restore, list, and delete backups in v1. Granular member permissions are deferred to R13.
- Backup scheduling (cron-based automatic backups) is out of scope for R12 and deferred to a future feature.
- Backup encryption at rest is out of scope for v1 (S3 server-side encryption is sufficient if the admin configures it on the bucket).
- The S3-compatible API follows the standard AWS S3 API (works with MinIO, R2, B2, AWS S3, etc.).
- Local storage uses a configurable directory on the node (default: `/var/lib/sigil/backups`).
- Backups are tar.gz archives of the volume directory, created by the daemon.
- The panel stores backup metadata in PostgreSQL; the daemon stores the actual backup files.
- Backup size limits are configurable per node, with a sensible default (e.g., 10GB per backup).
