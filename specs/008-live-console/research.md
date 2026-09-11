# Research: Live Console

## Decision 1: WebSocket library for Go daemon

**Decision**: `gorilla/websocket`

**Rationale**: Most widely used WebSocket library for Go. Mature, well-tested, handles HTTP upgrade, ping/pong, close frames. Used by Pterodactyl's daemon (Wings) and proven at scale. Standard library `net/http` does not include WebSocket support.

**Alternatives considered**:
- `nhooyr.io/websocket` — newer, simpler API, but less ecosystem adoption and fewer examples for Docker attach patterns
- `golang.org/x/net/websocket` — deprecated, lacks features
- Raw TCP + custom framing — too much work, reinventing the wheel

## Decision 2: JWT library for API (TypeScript)

**Decision**: `jose`

**Rationale**: Modern JWT/JWS/JWE library for TypeScript. Supports HS256 (HMAC) which matches the existing `APP_SECRET` pattern. Tree-shakeable, well-maintained, works with Bun runtime. Better-auth uses it internally.

**Alternatives considered**:
- `jsonwebtoken` — older, callback-based, less type-safe
- Manual HMAC signing — unnecessary complexity, error-prone
- `@tsndr/cloudflare-worker-jwt` — too minimal, lacks verification features

## Decision 3: JWT validation in Go daemon

**Decision**: `golang-jwt/jwt/v5`

**Rationale**: Standard JWT library for Go. Supports HS256 verification. Well-maintained, widely used. The daemon needs to verify the JWT signature using a shared secret (the `APP_SECRET` env var, passed to the daemon at registration or via config).

**Alternatives considered**:
- `lestrrat-go/jwx` — more feature-rich but heavier than needed
- Manual HMAC verification — possible but error-prone for JWT structure parsing

## Decision 4: Docker container attach strategy

**Decision**: Docker Engine API `ContainerAttach` with `stream=true, stdout=true, stderr=true` over a hijacked connection, combined with `ContainerLogs` with `follow=true` for initial buffer.

**Rationale**: 
- `ContainerAttach` provides a bidirectional connection to the container's stdin/stdout/stderr. This is what `docker attach` uses internally.
- For reconnection, the daemon maintains an in-memory ring buffer of recent output (last 1000 lines). On reconnect, it sends the buffer first, then continues streaming.
- `ContainerLogs` with `follow=true, since=<timestamp>` can also be used for read-only streaming, but `ContainerAttach` is needed for stdin (commands).

**Alternatives considered**:
- `ContainerLogs` only — read-only, cannot send stdin commands
- `ContainerExec` per command — creates a new exec instance per command, heavier, doesn't show output from the main process
- Docker stats API for resource stats — `ContainerStats` with `stream=true` provides real-time CPU/memory

## Decision 5: Console token issuance flow

**Decision**: 
1. Browser requests a console token via `POST /api/admin/servers/:serverId/console-token`
2. API validates admin session, checks server exists and is running
3. API signs a JWT with `APP_SECRET` (HS256), claims: `{ serverId, userId, scope: "console", exp: now+5min }`
4. Browser receives `{ token, daemonUrl }` where `daemonUrl` is `ws://<node.ip>:8080/ws/servers/<serverId>/console`
5. Browser opens WebSocket to daemon with `?token=<jwt>` query param
6. Daemon validates JWT signature, checks `serverId` matches the URL path, checks expiry
7. Daemon attaches to container and begins streaming

**Rationale**: The panel signs the JWT but is NOT in the live data path. The browser connects directly to the daemon. The JWT is short-lived (5 min) so a stolen token has limited impact. The daemon validates the JWT using the shared `APP_SECRET`.

**Alternatives considered**:
- Panel proxies WebSocket — violates Principle I (panel in live data path), adds latency, panel becomes bottleneck
- Daemon issues its own tokens — daemon shouldn't know about users, violates separation
- Long-lived API key — too risky, no scope limitation

## Decision 6: Shared secret distribution to daemon

**Decision**: The daemon receives `APP_SECRET` via its config file (environment variable `APP_SECRET` set in the daemon config YAML). The panel and daemon share the same `APP_SECRET`.

**Rationale**: The daemon already receives configuration via a YAML file (`/tmp/sigil-daemon-e2e.yaml` in E2E, or a production config file). Adding `app_secret` to the config is the simplest approach. The secret is used only for JWT verification, not for HMAC request signing (that uses per-node credentials).

**Alternatives considered**:
- Panel sends secret to daemon at registration — adds complexity, secret would need to be in the registration response
- Per-node JWT signing key — more complex key management, unnecessary for MVP
- RSA/asymmetric keys — overkill for this use case, adds key distribution complexity

## Decision 7: Resource stats delivery

**Decision**: Stats are pushed via the same WebSocket connection as console output, as a separate message type (`stats`). The daemon collects per-container stats every 5 seconds using Docker `ContainerStats` API and sends them as `ServerStats` messages.

**Rationale**: Using the same WebSocket avoids opening a second connection. Stats are low-frequency (every 5s) so they don't interfere with console output. The browser distinguishes message types by a `type` field.

**Alternatives considered**:
- Separate SSE endpoint for stats — adds another connection, more complexity
- Separate WebSocket for stats — unnecessary, same connection works
- HTTP polling — violates Principle VI (no polling for state)

## Decision 8: Console output buffering and truncation

**Decision**: The daemon maintains an in-memory ring buffer of the last 1000 lines (or ~64KB) per active console session. On reconnect, the buffer is sent first. The browser truncates output beyond 10,000 lines to prevent memory issues.

**Rationale**: 1000 lines is enough context for an admin to understand what happened before reconnecting. 10,000 lines in the browser is a reasonable upper bound before the DOM becomes slow. The ring buffer is per-session (not per-container) so it's cleaned up when the last admin disconnects.

**Alternatives considered**:
- No buffer — admins lose all context on reconnect, poor UX
- Persistent log storage — out of scope for R10, deferred to future feature
- Larger buffer (10k lines) — unnecessary memory usage for most cases

## Decision 9: Auto-reconnect strategy

**Decision**: Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s). On reconnect, request a new JWT (the old one may have expired), then open a new WebSocket. The console shows a "reconnecting..." indicator during backoff.

**Rationale**: Exponential backoff prevents thundering herd on daemon restart. Requesting a new JWT on each reconnect handles token expiry gracefully. The "reconnecting" indicator follows constitution Principle VI rule 6 (graceful degradation).

**Alternatives considered**:
- Fixed 1s retry — too aggressive on long outages
- Linear backoff — slower to recover from short blips
- No auto-reconnect — poor UX, requires page reload

## Decision 10: Console UI rendering

**Decision**: Render console output in a scrollable `<pre>` element with monospace font. Auto-scroll to bottom on new output unless the user has scrolled up (to inspect history). Color-code stdout (white) and stderr (red).

**Rationale**: `<pre>` preserves whitespace and line breaks. Auto-scroll with scroll-up detection is the standard terminal emulator pattern. Color-coding helps distinguish errors from normal output.

**Alternatives considered**:
- xterm.js — full terminal emulator, overkill for this use case, adds significant bundle size
- Custom canvas renderer — unnecessary complexity
- Plain `<div>` with line breaks — loses monospace alignment
