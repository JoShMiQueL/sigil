# Research: File Manager (R11)

**Date**: 2026-09-11

## Decision 1: Upload/download strategy

**Decision**: Buffered upload (multipart/form-data → API → daemon), streamed download (daemon → API → browser).

**Rationale**: Uploads use multipart/form-data which Bun's Hono handles natively via `c.req.parseBody()`. The API reads the file into memory (max 100MB) and forwards it as a binary body to the daemon. Downloads stream the daemon response directly back to the browser using Hono's streaming response. This avoids storing files on the API server's disk.

**Alternatives considered**:
- Streaming upload (chunked transfer): More complex, requires backpressure handling, marginal benefit for 100MB limit.
- Browser→daemon direct (like console): Would require JWT auth on file endpoints, adds complexity. File ops are not real-time interactive, so HTTP via API is appropriate (Constitution Principle VI).

## Decision 2: File size limits and validation

**Decision**: Edit max 1MB (text only), upload max 100MB, download no limit.

**Rationale**: 1MB is a reasonable limit for in-browser text editing — larger files cause UI lag. 100MB upload covers most mod/plugin/world files. Downloads have no limit since they stream directly. The API validates file size before forwarding to daemon.

**Alternatives considered**:
- 5MB edit limit: Too large for smooth textarea rendering in low-end browsers.
- 500MB upload limit: Would require chunked upload infrastructure, deferred.

## Decision 3: Rename implementation

**Decision**: Add `SafeRename` to the jail using `os.Rename` within the jail root.

**Rationale**: `os.Rename` is atomic on the same filesystem. The jail validates both source and destination paths are within the jail before calling `os.Rename`. This is simpler and safer than copy+delete.

**Alternatives considered**:
- Copy+delete: Non-atomic, slower for large files, risk of partial state on failure.
- Docker exec `mv`: Unnecessary shell execution, violates "no string concatenation to shell" rule.

## Decision 4: Directory listing format

**Decision**: Flat listing with file metadata (name, size, modtime, isDir).

**Rationale**: The existing `SafeList` returns `[]string` of names. We extend it to return structured entries with metadata via `SafeStat` per entry. Flat listing (current directory only) is simpler than tree and matches Pterodactyl's behavior. Tree view is deferred.

**Alternatives considered**:
- Recursive tree: Too much data for large directories, UI complexity.
- Paginated listing: Premature optimization for <1000 files per directory.

## Decision 5: Editor component

**Decision**: Plain `<textarea>` with monospace font, no syntax highlighting.

**Rationale**: A textarea is simple, fast, and works for all text files. Syntax highlighting (CodeMirror, Monaco) adds significant bundle size and complexity. Most config files are small and don't benefit from highlighting. Syntax highlighting is deferred to a future enhancement.

**Alternatives considered**:
- CodeMirror 6: +300KB bundle, overkill for config editing.
- Monaco Editor: +2MB bundle, designed for code IDEs, not config files.

## Decision 6: Path validation on the API side

**Decision**: API validates path format (no null bytes, no `../`, max length 1024) before forwarding to daemon.

**Rationale**: Defense in depth. The daemon jail already rejects traversal, but validating on the API side gives faster error responses and reduces daemon load. The API uses a Zod schema to validate paths.

**Alternatives considered**:
- Daemon-only validation: Works but slower error responses, more daemon load.
- Browser-only validation: Insufficient — client can be bypassed.

## Decision 7: Error handling for daemon unreachable

**Decision**: API catches daemon connection errors and returns `502 DAEMON_UNREACHABLE` with a clear message.

**Rationale**: Consistent with R9 server lifecycle error handling. The panel shows the error message to the user.

**Alternatives considered**:
- 500 Internal Server Error: Less specific, harder for panel to handle.
- Timeout with retry: File ops are one-shot actions, not worth retrying.

## Decision 8: Overwrite confirmation flow

**Decision**: API returns `409 FILE_EXISTS` when uploading to an existing path. Panel shows confirmation dialog, then re-uploads with `?overwrite=true` query param.

**Rationale**: Explicit confirmation prevents accidental data loss. The `overwrite` flag makes the intent clear in the request.

**Alternatives considered**:
- Always overwrite: Risky, no confirmation.
- Always reject: Too restrictive, requires delete-then-upload (two operations).
