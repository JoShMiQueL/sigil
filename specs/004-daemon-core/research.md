# Research: Daemon Core

**Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## R1: Docker Go SDK — Which Client Library?

**Decision**: Use `github.com/docker/docker/client` (the `moby/moby` client).

**Rationale**: This is the official, stable, low-level Go client for the Docker Engine API. It provides direct access to all Docker Engine operations: `ContainerCreate`, `ContainerStart`, `ContainerStop`, `ContainerRemove`, `ContainerInspect`, `ImagePull`, `Events`. It is the same client used by the Docker CLI itself. The newer `github.com/docker/go-sdk` is explicitly marked as Work In Progress (pre-v1.0) and its API may change — not suitable for production.

**Alternatives considered**:
- `github.com/docker/go-sdk` — higher-level, but WIP, pre-v1.0, API instability. Rejected.
- `github.com/fsouza/go-dockerclient` — third-party, less maintained, diverges from upstream. Rejected.
- Docker CLI via `exec.Command` — violates spec (FR-009: Docker Engine API, not CLI). Rejected.

**Key APIs used**:
- `client.NewClientWithOpts(client.FromEnv)` — connect to Docker via env or Unix socket
- `cli.ContainerCreate(ctx, config, hostConfig, networkConfig, platform, name)` — create container
- `cli.ContainerStart(ctx, id, options)` — start container
- `cli.ContainerStop(ctx, id, timeout)` — graceful stop (SIGTERM, then SIGKILL)
- `cli.ContainerRemove(ctx, id, options)` — remove container + cleanup
- `cli.ContainerInspect(ctx, id)` — get container state
- `cli.ImagePull(ctx, image, options)` — pull image if not local
- `cli.ImageList(ctx, options)` — check if image exists locally
- `cli.Events(ctx, options)` — stream container events (start, die, oom, kill, etc.)

## R2: Filesystem Jail — How to Implement Path Traversal Protection?

**Decision**: Use Go 1.24+ `os.Root` API (`os.OpenRoot`) as the primary jail mechanism, with `filepath.EvalSymlinks` as a secondary check for archive extraction.

**Rationale**: Go 1.24 introduced `os.Root` — a traversal-resistant file API that uses `openat` syscalls on Linux. On Linux 5.6+ it uses `openat2` with `RESOLVE_BENEATH`, which enforces path containment at the kernel level. This is immune to TOCTOU races (time-of-check/time-of-use) because the kernel validates the path at open time, not before. `os.Root` rejects `..` components that escape the root and follows symlinks only within the root. Since the daemon targets Go 1.27 and Linux, `os.Root` is the ideal solution.

**How it works**:
```go
root, err := os.OpenRoot("/var/lib/sigilpanel/volumes/<uuid>")
f, err := root.Open("server.properties")  // safe, relative to root
// root.Open("../../etc/passwd") → error, escapes root
// symlink to /etc/passwd → error, target outside root
```

**For archive extraction**: `os.Root` protects file opens, but archive extraction needs pre-validation of entry paths. We use `filepath.EvalSymlinks` + `filepath.IsLocal` on each archive entry before extracting, then extract through `os.Root` for defense in depth.

**Alternatives considered**:
- `github.com/cyphar/filepath-securejoin` — userspace symlink resolution, but TOCTOU-vulnerable. The authors themselves recommend `os.Root` or `libpathrs` for new users. Rejected.
- `filepath.Clean` + `filepath.IsLocal` only — lexical check, doesn't handle symlinks. Insufficient. Rejected.
- Manual `openat` calls — reinventing what `os.Root` already does. Rejected.

## R3: Container State Monitoring — How to Detect State Changes?

**Decision**: Use the Docker Events API (`cli.Events`) with a filter for `type=container` and a label `sigilpanel.server-id=<uuid>` to stream events for managed containers.

**Rationale**: The Docker Events API streams real-time events from the Docker daemon. Each event has an `Action` (start, die, oom, kill, stop, destroy, remove) and an `Actor` with container ID and attributes (including exit code for `die` events). By filtering on our label, we only get events for containers we manage. This is the same mechanism Docker uses internally.

**Event mapping**:
| Docker Event | Container State | Report to Panel |
|-------------|----------------|-----------------|
| `start` | running | "running" |
| `die` (exit code 0) | stopped | "stopped" |
| `die` (exit code != 0) | crashed | "crashed" (with exit code) |
| `oom` | crashed | "crashed" (reason: oom) |
| `kill` | stopped | "stopped" (reason: killed) |
| `stop` | stopped | "stopped" |
| `destroy` / `remove` | missing | "missing" |

**Reconciliation on startup**: On daemon restart, we list all containers with our label (`cli.ContainerList` with filter), inspect each, and report current state to the panel. This handles the case where state changed while the daemon was down.

**Alternatives considered**:
- Polling `ContainerInspect` every N seconds — wastes CPU, adds latency, misses fast state changes. Rejected (also violates the spirit of Principle VI: no polling for state).
- `ContainerWait` per container — blocks a goroutine per container, doesn't scale well for 50+ servers. Rejected as primary mechanism (may use as secondary for specific wait scenarios).

## R4: Container Security Hardening — What Hardening to Apply?

**Decision**: Apply the following hardening to ALL containers, non-overridable:

| Control | Docker API Setting |
|---------|------------------|
| Capabilities | `CapDrop: []string{"ALL"}`, `CapAdd: []` (empty unless template explicitly requires) |
| Privileges | `SecurityOpt: []string{"no-new-privileges"}` |
| User | `User: "<uid>:<gid>"` (allocated by daemon, non-root) |
| PID limits | `PidsLimit: pointer.ToInt(512)` (configurable, default 512) |
| Memory limit | `Memory: <bytes>` (from server config, required) |
| CPU limit | `NanoCPUs: <value>` (from server config, required) |
| Read-only root | `ReadonlyRootfs: true` (with tmpfs for /tmp) |
| Docker socket | NEVER mounted (hardcoded, not configurable) |
| Privileged mode | NEVER (hardcoded `Privileged: false`) |

**Rationale**: These are industry-standard hardening practices confirmed by multiple sources (Docker docs, security blogs, CVE history). `cap_drop: ALL` + `no-new-privileges` prevents privilege escalation. Non-root user limits blast radius. PID limits prevent fork bombs. Memory limits prevent OOM cascades. Read-only rootfs prevents payload drops. The Docker socket is the #1 self-inflicted container escape vector — it must never be mounted.

**UID/GID allocation**: The daemon allocates a unique UID/GID per server from a configurable range (default: 1000-65535). This ensures isolation between servers even if one escapes the container.

**Alternatives considered**:
- AppArmor/SELinux profiles — valuable but kernel/distribution-specific. Deferred to a future hardening spec.
- Seccomp profiles — Docker's default seccomp profile is already applied. Custom profiles are template-specific. Deferred to R8.

## R5: Shared Contracts — How to Share Schemas Between Go and TypeScript?

**Decision**: Zod schemas in `packages/shared` are the source of truth. The Go daemon defines equivalent Go structs with `json` tags that match the Zod schema field names. Validation in Go is done manually (field checks) or via a lightweight validation library. No code generation — the schemas are simple enough to mirror manually, and a test in CI can verify the Go structs match by comparing JSON round-trip against the Zod schemas.

**Rationale**: The constitution (Principle II) says Zod schemas in `packages/shared` are the source of truth. The Go daemon cannot import TypeScript/Zod. Code generation (Zod → JSON Schema → Go) is complex and adds build dependencies. Manual mirroring with a verification test is simpler and sufficient for the current schema complexity.

**Verification approach**: A CI test serializes a Go struct to JSON and validates it against the Zod schema (via a small Node script). If the JSON doesn't match the schema, the test fails. This catches drift without code generation.

**Alternatives considered**:
- `quicktype` (JSON Schema → Go) — requires generating JSON Schema from Zod first, then Go from JSON Schema. Two-step code generation, build complexity. Rejected for now.
- `zod-to-openapi` → Go client generation — overkill for internal daemon-to-panel communication. Rejected.
- Protocol Buffers — adds a new dependency and build step. Rejected.

## R6: Panel-to-Daemon Authentication — How Does the Panel Authenticate to the Daemon?

**Decision**: The panel signs requests to the daemon using the same HMAC-SHA256 scheme as R4 node auth. The panel has the node's secret (stored encrypted in the DB, decrypted when needed). The daemon stores the secret locally. Both sides use the same headers: `X-Node-Id` (secret ID), `X-Node-Signature` (HMAC-SHA256 of `timestamp + body`), `X-Node-Timestamp`.

**Rationale**: R4 already established the HMAC-SHA256 credential scheme for daemon→panel communication. Using the same scheme for panel→daemon is symmetric and simple. The panel already has the credential infrastructure (encrypt/decrypt, sign/verify). The daemon needs to verify signatures, which is straightforward in Go with `crypto/hmac`.

**Flow**:
1. Panel needs to send a command to daemon on node X
2. Panel looks up node X's credentials in the DB, decrypts the secret
3. Panel signs the request body with `HMAC-SHA256(secret, timestamp + body)`
4. Panel sends request to `http://<node-ip>:8080/servers/...` with auth headers
5. Daemon verifies the signature using its locally stored secret
6. If valid, daemon processes the command

**Alternatives considered**:
- Mutual TLS — requires cert management infrastructure. Overkill for now. Rejected.
- JWT — stateless but heavier. HMAC is simpler for service-to-service. Rejected.
- Separate panel-to-daemon secret — adds complexity. The existing node secret is sufficient. Rejected.

## R7: HTTP Router for the Daemon — Which Library?

**Decision**: Use `net/http` with Go 1.22+ enhanced routing patterns (`mux.HandleFunc("GET /path/{id}", handler)`). No external router library.

**Rationale**: Go 1.22 added pattern-based routing to the standard library, including path parameters, method matching, and wildcards. Since the daemon targets Go 1.27, this is available. The daemon's API surface is small (~15 endpoints) and doesn't need middleware complexity. Using stdlib avoids external dependencies.

**Alternatives considered**:
- `chi` — popular, lightweight, but unnecessary given Go 1.22+ routing. Rejected.
- `gorilla/mux` — archived/legacy. Rejected.
- `gin` — heavy, opinionated. Rejected.
