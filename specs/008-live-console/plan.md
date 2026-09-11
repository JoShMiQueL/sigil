# Implementation Plan: Live Console

**Branch**: `008-live-console` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-live-console/spec.md`

## Summary

R10 adds a live console and resource stats to the panel. The browser opens a direct WebSocket to the daemon (bypassing the panel) using a short-lived JWT signed by the panel API. The daemon attaches to the container's stdout/stderr, streams output to the browser, accepts stdin commands, and pushes periodic resource stats. The panel issues console JWTs, renders the console UI, and handles auto-reconnect with exponential backoff.

## Technical Context

**Language/Version**: TypeScript 7.0 (panel + API), Go 1.27 (daemon)

**Primary Dependencies**:
- Panel: React 19, TanStack Router, TanStack Query, shadcn/ui
- API: Hono 4.13, Bun 1.4 runtime, better-auth
- Daemon: Go 1.27, Docker Engine API (docker/docker client)
- Shared: Zod 4.5
- New: `jose` (JWT signing in API), `gorilla/websocket` (WebSocket server in daemon)

**Storage**: PostgreSQL 18 (server records, existing), Redis 8 (session cache, existing). No new persistent storage — console output is in-memory only.

**Testing**: Vitest 5 (unit/integration), Testcontainers 12 (PostgreSQL + Redis), Playwright 1.62 (E2E), Go testing (daemon unit/integration)

**Target Platform**: Linux server (daemon), Browser (panel)

**Project Type**: Web application (monorepo: panel + API + daemon)

**Performance Goals**: <1s console latency, <2s command round-trip, stats every 5s

**Constraints**: No polling for state (constitution Principle VI), no panel in live data path, JWT max 5 min lifetime, auto-reconnect required

**Scale/Scope**: Single admin console sessions per server (multi-admin supported but no fanout optimization needed yet)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Browser→daemon direct WebSocket. Panel issues JWT but is not in the live data path. Daemon never touches DB. |
| II. Shared Contracts as Source of Truth | ✅ PASS | Console message, command, stats, and JWT payload schemas defined in `packages/shared`. |
| III. Security-First Container Isolation | ✅ PASS | JWT scoped to serverId, validated by daemon. No filesystem access via console. Stdin is container-internal only. |
| IV. Test Against Real Infrastructure | ✅ PASS | Daemon WebSocket tested against real Docker. E2E tests use Testcontainers + real daemon. MCP verification before Playwright. |
| V. Spec-Driven Development | ✅ PASS | Spec created and validated before plan. |
| VI. Real-time Protocol Selection | ✅ PASS | WebSocket for console (bidirectional), SSE for panel state updates, HTTP for JWT issuance. No polling. |

## Project Structure

### Documentation (this feature)

```text
specs/008-live-console/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # WebSocket protocol + REST JWT endpoint
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/shared/src/
├── console/
│   ├── message.ts       # ConsoleMessage, ConsoleCommand, ServerStats schemas
│   └── token.ts         # ConsoleTokenPayload schema (JWT claims)
└── index.ts             # re-export

apps/api/src/
├── lib/
│   └── console-token.ts # JWT signing (jose library)
├── routes/
│   └── console-token.ts # POST /api/admin/servers/:serverId/console-token
└── index.ts             # mount console-token route

apps/daemon/internal/
├── console/
│   ├── manager.go       # Console session manager (attach, stream, buffer)
│   ├── handler.go       # WebSocket upgrade + message handling
│   └── stats.go         # Per-container stats collector
├── auth/
│   └── jwt.go           # JWT validation for WebSocket connections
└── api/
    └── router.go        # Add /ws/servers/{serverId}/console route

apps/panel/src/
├── hooks/
│   ├── useConsoleToken.ts   # Fetch JWT from API
│   └── useConsole.ts        # WebSocket connection + auto-reconnect
├── components/servers/
│   ├── console-view.tsx     # Console output + input
│   └── server-stats.tsx     # CPU/memory/disk stats
└── routes/
    └── server-detail.tsx     # Add console tab + stats panel
```

**Structure Decision**: Monorepo with panel (React), API (Hono), and daemon (Go). Shared contracts in `packages/shared`. New `console` package in shared for message/token schemas. New `console` package in daemon for WebSocket handling. New `console-token` lib in API for JWT signing.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
