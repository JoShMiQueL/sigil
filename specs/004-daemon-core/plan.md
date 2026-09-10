# Implementation Plan: Daemon Core

**Branch**: `004-daemon-core` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-daemon-core/spec.md`

## Summary

The SigilPanel daemon (Go 1.27) runs on each node and manages Docker containers for game servers. It registers with the panel via pairing tokens (R4), sends periodic heartbeats, accepts authenticated server lifecycle commands (create, start, stop, restart, remove) from the panel via its own HTTP API, isolates server files in a secure filesystem jail, monitors and reports container state changes back to the panel, and applies non-negotiable security hardening to all containers. This is the execution plane foundation — without it, no game servers can run.

## Technical Context

**Language/Version**: Go 1.27

**Primary Dependencies**: `docker/client` (official Go SDK for Docker Engine API), `net/http` (stdlib, daemon's own HTTP API), `gopkg.in/yaml.v3` (config), `crypto/hmac` (HMAC-SHA256 auth), `log/slog` (structured logging)

**Storage**: Local filesystem — daemon config (`/etc/sigilpanel/daemon.yaml`), credentials (`/var/lib/sigilpanel/daemon/credentials.json` with 0600 permissions), server volumes (`/var/lib/sigilpanel/volumes/<server-uuid>/`). No database access (Constitution Principle I).

**Testing**: Go testing (`go test`) for unit tests (filesystem jail, config parsing, HMAC auth, config validation). Integration tests against a real Docker daemon (Constitution Principle IV — no Docker mocks). Tests run in CI with Docker available.

**Target Platform**: Linux server (daemon runs on each node, requires Docker Engine installed)

**Project Type**: daemon (long-running Go binary, HTTP server + Docker client + background workers)

**Performance Goals**: heartbeat delivery < 1s, container lifecycle operations < 10s for standard images, state change reporting < 5s detection, 50 concurrent containers without degradation

**Constraints**: no database imports (Principle I), no Docker CLI (Docker Engine API only), no privileged containers, no Docker socket in containers, all file paths through jail, secrets redacted in logs, HMAC auth on all panel-to-daemon requests

**Scale/Scope**: 5 user stories, 5 entities, ~15 daemon HTTP endpoints, ~10 Go packages, ~30 test cases

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | The daemon NEVER touches the database. It receives server configuration as JSON from the panel and reports state changes via HTTP callbacks. No database imports, no Drizzle, no PostgreSQL driver in the daemon. |
| II. Shared Contracts as Source of Truth | ✅ PASS (with note) | Zod schemas in `packages/shared` define the shapes. The Go daemon cannot import TypeScript/Zod directly — it defines equivalent Go structs that match the Zod schemas. The Zod schemas are the source of truth; Go structs must match. New schemas for server config, container state, and state change events are added to `packages/shared` first, then mirrored in Go. |
| III. Security-First Container Isolation (NON-NEGOTIABLE) | ✅ PASS | This spec IS the container isolation spec. Filesystem jail (path canonicalization, symlink rejection, zip-slip), cap_drop ALL, no-new-privileges, non-root user, PID limits, resource limits, no Docker socket mount, no privileged containers. Security hardening is automatic and cannot be overridden. |
| IV. Test Against Real Infrastructure (NON-NEGOTIABLE) | ✅ PASS | Unit tests for jail, config, auth, validation. Integration tests against a real Docker daemon — no dockerode mocks, no Docker CLI mocks. The daemon is tested with real containers (alpine image). |
| V. Spec-Driven Development | ✅ PASS | Spec written and validated before this plan. |
| VI. Real-time Protocol Selection | ✅ PASS | Daemon→panel state changes use HTTP callbacks (not SSE/WS — SSE is browser-facing, the daemon is a service client). Panel→daemon commands use HTTP. WebSocket console (R10) is a separate spec. |

**Gate result**: All principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/004-daemon-core/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── daemon-api.md    # Daemon HTTP API (panel→daemon)
│   ├── panel-callback.md # Panel callback API (daemon→panel)
│   └── shared-schemas.md # New shared Zod schemas + Go struct mapping
└── tasks.md             # Phase 2 output (not created by this command)
```

### Source Code (repository root)

```text
apps/daemon/
├── go.mod
├── go.sum
├── cmd/
│   └── daemon/
│       └── main.go                  # Entry point: load config, register, start workers
├── internal/
│   ├── config/
│   │   ├── config.go                # Config struct, YAML parsing, validation
│   │   └── config_test.go
│   ├── auth/
│   │   ├── credentials.go           # Credential storage (load/save, 0600 permissions)
│   │   ├── credentials_test.go
│   │   ├── hmac.go                   # HMAC-SHA256 sign/verify (matches R4 scheme)
│   │   ├── hmac_test.go
│   │   ├── middleware.go             # HTTP middleware: verify panel requests
│   │   └── middleware_test.go
│   ├── panel/
│   │   ├── client.go                 # HTTP client: register, heartbeat, state callback
│   │   ├── client_test.go
│   │   └── retry.go                  # Exponential backoff retry logic
│   ├── docker/
│   │   ├── client.go                 # Docker Engine API client wrapper
│   │   ├── lifecycle.go              # Create, start, stop, restart, remove containers
│   │   ├── lifecycle_test.go         # Integration tests (real Docker)
│   │   ├── hardening.go              # Security hardening policy (caps, user, limits)
│   │   ├── hardening_test.go
│   │   ├── monitor.go                # Container state monitoring (event stream)
│   │   └── monitor_test.go
│   ├── jail/
│   │   ├── jail.go                   # Path resolution, canonicalization, symlink check
│   │   ├── jail_test.go              # Traversal, symlink, zip-slip attack tests
│   │   └── archive.go                # Safe archive extraction (zip-slip protection)
│   │   └── archive_test.go
│   ├── server/
│   │   ├── manager.go                # Server manager: in-memory state, per-server locking
│   │   ├── manager_test.go
│   │   ├── validate.go               # Server config validation
│   │   └── validate_test.go
│   ├── api/
│   │   ├── router.go                 # HTTP router (net/http stdlib)
│   │   ├── handlers.go               # Lifecycle command handlers
│   │   ├── handlers_test.go
│   │   └── response.go               # JSON response helpers
│   ├── heartbeat/
│   │   ├── collector.go              # System resource collection (CPU, mem, disk)
│   │   ├── collector_test.go
│   │   └── loop.go                    # Heartbeat loop with retry
│   └── logger/
│       └── logger.go                 # slog setup with secret redaction
├── Makefile                          # build, test, test-integration targets
└── Dockerfile                        # Daemon container image (for development)

packages/shared/
└── src/
    ├── server/
    │   ├── config.ts                 # ServerConfigurationSchema (image, cmd, env, ports, limits)
    │   ├── state.ts                  # ContainerStateSchema, StateChangeEventSchema
    │   └── lifecycle.ts              # Lifecycle request/response schemas
    └── index.ts                      # Re-exports server schemas

apps/api/src/
├── routes/
│   └── server-state.ts               # POST /api/node/server-state (daemon→panel callback)
├── services/
│   ├── daemon-client.service.ts     # Sign and send lifecycle commands to daemon
│   └── server-state.service.ts      # Process state change callbacks
└── index.ts                          # Register server-state route
```

**Structure Decision**: The daemon is a Go application following standard Go project layout (`cmd/` for entry points, `internal/` for private packages). Each concern is a separate package: `config`, `auth`, `panel` (panel client), `docker` (Docker integration), `jail` (filesystem security), `server` (server management), `api` (HTTP handlers), `heartbeat` (resource collection), `logger`. New shared Zod schemas for server config/state are added to `packages/shared/src/server/`. The API gets a new route for daemon state-change callbacks. This follows the existing monorepo pattern: shared contracts in `packages/shared`, API routes in `apps/api/src/routes/`, services in `apps/api/src/services/`.

**Panel-to-daemon auth**: The panel signs outgoing requests to the daemon using the same HMAC-SHA256 scheme as R4. The panel API decrypts the node's stored secret (`decrypt()` from `apps/api/src/lib/crypto.ts`) and uses `computeSignature()` from `apps/api/src/lib/credentials.ts` to sign requests. The daemon verifies the signature with its stored copy of the secret. This is symmetric HMAC — both sides share the same secret. The panel needs a new `daemon-client.service.ts` that handles signing and sending lifecycle commands to the daemon.
