# Data Model: File Manager (R11)

**Date**: 2026-09-11

## Entities

### FileEntry

Represents a file or directory in a server's volume.

| Field | Type | Description |
|-------|------|-------------|
| name | string | File or directory name (basename) |
| path | string | Relative path from volume root (e.g., `config/server.properties`) |
| size | number | Size in bytes (0 for directories) |
| isDir | boolean | True if directory, false if file |
| modTime | string (ISO 8601) | Last modified timestamp |
| mode | string (optional) | Unix file mode (e.g., `0644`) |

### FileListResponse

Response for directory listing.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Current directory path |
| entries | FileEntry[] | Files and directories in current directory |

### FileContent

Represents the content of a text file.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path from volume root |
| content | string | File content (UTF-8 text) |
| size | number | Content size in bytes |
| encoding | string | Always `utf-8` for R11 |

### FileWriteInput

Input for writing file content.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path from volume root |
| content | string | File content (UTF-8 text) |

### FileCreateInput

Input for creating a new file or directory.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path from volume root |
| type | `file` \| `directory` | Type of item to create |

### FileRenameInput

Input for renaming a file or directory.

| Field | Type | Description |
|-------|------|-------------|
| from | string | Current relative path |
| to | string | New relative path |

### FileUploadResponse

Response after uploading a file.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path where file was saved |
| size | number | Uploaded file size in bytes |

## Validation Rules

### Path validation (Zod schema)

- Must be a non-empty string
- Max length: 1024 characters
- No null bytes (`\0`)
- No path traversal (`../` segments)
- No absolute paths (must be relative)
- Allowed characters: alphanumeric, `.`, `-`, `_`, `/`, spaces

### File name validation

- Must be a non-empty string
- Max length: 255 characters
- No null bytes
- No path separators (`/`)
- No special names: `.`, `..`

### File size limits

- Edit (read + write): 1MB (1,048,576 bytes)
- Upload: 100MB (104,857,600 bytes)
- Download: no limit (streamed)

## State Transitions

No state machine needed — file operations are one-shot CRUD actions.

## Database Changes

**None.** R11 does not add any database tables or migrations. All file data lives in Docker volumes on the daemon.

## Shared Schemas Location

All Zod schemas will be defined in:
- `packages/shared/src/files/entry.ts` — FileEntrySchema, FileListResponseSchema
- `packages/shared/src/files/content.ts` — FileContentSchema, FileWriteInputSchema, FileCreateInputSchema, FileRenameInputSchema, FileUploadResponseSchema
- `packages/shared/src/files/path.ts` — FilePathSchema, FileNameSchema (reusable validators)
