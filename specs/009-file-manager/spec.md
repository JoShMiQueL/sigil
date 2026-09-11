# Feature Specification: File Manager

**Feature Branch**: `009-file-manager`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Browse, edit, upload, download, SFTP — file browser, editor, upload, SFTP. Deferred: backups, archives."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Server Files (Priority: P1)

An administrator can browse the file tree of a running server's volume, navigate directories, and see file metadata (name, size, modified date, type).

**Why this priority**: Without browsing, no other file operation is possible. This is the foundation of the file manager.

**Independent Test**: Can be fully tested by opening a server's file page and verifying the directory listing appears with correct file names and metadata.

**Acceptance Scenarios**:

1. **Given** a running server with files in its volume, **When** the admin opens the file manager page, **Then** the root directory listing appears showing all files and folders with name, size, and last modified date.
2. **Given** the file manager showing the root directory, **When** the admin clicks a subdirectory, **Then** the listing updates to show that directory's contents and a breadcrumb shows the current path.
3. **Given** the file manager showing a subdirectory, **When** the admin clicks the breadcrumb parent, **Then** the listing returns to the parent directory.
4. **Given** a server that is not running, **When** the admin opens the file manager, **Then** a "server is not running" indicator is shown and browsing is disabled.

---

### User Story 2 - Edit File Contents (Priority: P2)

An administrator can view and edit the contents of text files in the server's volume, and save changes back.

**Why this priority**: Editing config files is the second most common file operation after browsing. Server admins frequently need to tweak configurations.

**Independent Test**: Can be fully tested by opening a text file, modifying its content, saving, and reopening to verify the changes persisted.

**Acceptance Scenarios**:

1. **Given** the file manager showing a directory with a text file, **When** the admin clicks the file, **Then** an editor opens showing the file's current content.
2. **Given** the editor open with file content, **When** the admin modifies the content and clicks Save, **Then** a success indicator appears and the file is saved.
3. **Given** a binary or very large file (>1MB), **When** the admin tries to open it, **Then** a "file too large or binary" message is shown instead of the editor.
4. **Given** the editor open with unsaved changes, **When** the admin navigates away, **Then** a confirmation dialog warns about unsaved changes.

---

### User Story 3 - Upload and Download Files (Priority: P3)

An administrator can upload files from their machine to the server's volume and download files from the server to their machine.

**Why this priority**: Upload/download is essential for installing mods, plugins, and world files, but requires the browse foundation first.

**Independent Test**: Can be fully tested by uploading a file, verifying it appears in the listing, then downloading it and verifying the content matches.

**Acceptance Scenarios**:

1. **Given** the file manager showing a directory, **When** the admin selects a file from their machine and uploads it, **Then** the file appears in the directory listing.
2. **Given** the file manager showing a directory with a file, **When** the admin clicks Download on that file, **Then** the file downloads to their machine.
3. **Given** the file manager showing a directory, **When** the admin uploads a file with the same name as an existing file, **Then** a confirmation dialog asks to overwrite.
4. **Given** an upload in progress, **When** the upload is running, **Then** a progress indicator shows the upload status.

---

### User Story 4 - Delete and Create Files/Directories (Priority: P4)

An administrator can delete files and directories, create new files and directories, and rename items.

**Why this priority**: These are standard file management operations that complete the file manager's CRUD capabilities.

**Independent Test**: Can be fully tested by creating a new directory, creating a file inside it, renaming it, and deleting it.

**Acceptance Scenarios**:

1. **Given** the file manager showing a directory, **When** the admin clicks "New Folder" and enters a name, **Then** the folder appears in the listing.
2. **Given** the file manager showing a directory, **When** the admin clicks "New File" and enters a name, **Then** an empty file appears in the listing.
3. **Given** the file manager showing a file, **When** the admin clicks Delete and confirms, **Then** the file is removed from the listing.
4. **Given** the file manager showing a directory, **When** the admin clicks Delete and confirms, **Then** the directory and all its contents are removed.
5. **Given** the file manager showing a file or directory, **When** the admin clicks Rename and enters a new name, **Then** the item is renamed in the listing.

### Edge Cases

- What happens when the admin tries to access a path with `../` traversal? The jail rejects it and a "path not found" error is shown.
- What happens when the admin tries to upload a file larger than the server's disk limit? The upload fails with a "disk full" error.
- What happens when the admin tries to edit a file that was deleted by the server process? The save fails with a "file not found" error.
- What happens when the admin tries to download a file that doesn't exist? A "file not found" error is shown.
- What happens when the daemon is unreachable? All file operations show a "daemon unreachable" error.
- What happens when the admin tries to create a file with an invalid name (e.g., containing `/` or null bytes)? A validation error is shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow administrators to browse the file tree of a running server's volume, showing directory contents with file name, size, and last modified date.
- **FR-002**: System MUST support directory navigation, including entering subdirectories and navigating back via breadcrumbs.
- **FR-003**: System MUST allow administrators to view and edit text file contents in an editor.
- **FR-004**: System MUST allow administrators to save edited file contents back to the server volume.
- **FR-005**: System MUST reject opening files larger than 1MB in the editor with a clear error message.
- **FR-006**: System MUST allow administrators to upload files from their machine to the current directory.
- **FR-007**: System MUST allow administrators to download files from the server to their machine.
- **FR-008**: System MUST allow administrators to create new files and directories.
- **FR-009**: System MUST allow administrators to delete files and directories (with confirmation).
- **FR-010**: System MUST allow administrators to rename files and directories.
- **FR-011**: System MUST show a "server is not running" indicator when the server is not running, disabling all file operations.
- **FR-012**: System MUST show a "daemon unreachable" error when the daemon is not reachable.
- **FR-013**: System MUST reject path traversal attempts (`../`, symlinks escaping the jail) with a "path not found" error.
- **FR-014**: System MUST validate file names, rejecting names containing path separators or null bytes.
- **FR-015**: System MUST prompt for confirmation before overwriting an existing file during upload.
- **FR-016**: System MUST prompt for confirmation before deleting a file or directory.
- **FR-017**: System MUST warn about unsaved changes when navigating away from the editor.

### Key Entities *(include if feature involves data)*

- **FileEntry**: Represents a file or directory in the server volume — name, path (relative to volume root), size, type (file/directory), last modified date.
- **FileContent**: Represents the content of a text file — path, content (string), size, encoding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can browse, edit, upload, download, create, delete, and rename files without leaving the panel.
- **SC-002**: File operations complete in under 2 seconds for files under 1MB.
- **SC-003**: Path traversal attacks are blocked 100% of the time — no file outside the server's volume is ever accessible.
- **SC-004**: The file manager handles directories with 100+ files without performance degradation.
- **SC-005**: All file operations show clear success or error feedback to the user.

## Assumptions

- Only administrators have access to the file manager for now; per-server permissions are deferred to R13.
- SFTP access is deferred to a future feature — R11 focuses on the web-based file manager only.
- Archive extraction (zip/tar) is already implemented in the daemon jail and will be exposed as a bonus operation.
- File operations go through the API (panel→API→daemon), not browser→daemon direct like the console. This follows Constitution Principle VI: HTTP for actions, WebSocket for interactive console only.
- The daemon's existing jail infrastructure provides path containment and security.
- Maximum file size for editing is 1MB; larger files must be downloaded for editing externally.
- Upload size limit is 100MB per file; larger uploads are deferred to a future feature.
- No drag-and-drop upload in v1; file picker only. Drag-and-drop is deferred.
