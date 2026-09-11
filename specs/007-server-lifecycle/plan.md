# Implementation Plan: Server Lifecycle

**Branch**: `007-server-lifecycle` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-server-lifecycle/spec.md`

## Summary

R9 builds the panel-owned server lifecycle layer on top of the existing daemon proxy routes. The panel must own a `servers` table (id, name, nodeId, templateId, allocationId, status, config, createdAt, updatedAt), create server records before dispatching to the daemon, auto-assign primary allocations (R7), release allocations on delete (R7), enforce a state machine (offline → starting → running → stopping → stopped, with crashed/creation_failed terminals), accept daemon state reports, and emit SSE events for real-time UI updates. The existing daemon-proxy routes in `servers.ts` are refactored to go through the panel-owned server record first, then delegate to the daemon.

## Technical Context

**Language/Version**: TypeScript 7.0 (API + panel), Go 1.27 (daemon — already implemented in R6)

**Primary Dependencies**: Hono 4.13, Drizzle ORM 0.45, Zod 4.5, TanStack Query, TanStack Router

**Storage**: PostgreSQL 18 (servers table), Redis 8 (SSE fan-out)

**Testing**: Vitest 5 (unit/integration with Testcontainers), Playwright 1.62 (E2E), chrome-devtools MCP (interactive verification)

**Target Platform**: Linux server (API + daemon), browser (panel)

**Project Type**: Web service (monorepo: API + panel + daemon)

**Performance Goals**: Server state transitions complete within 10s; SSE updates reach browser within 2s

**Constraints**: Panel never talks to Docker; all container ops via daemon HTTP; no polling for state (SSE only)

**Scale/Scope**: ~15 new files (schema, service, routes, hooks, components, tests); ~8 E2E tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Panel owns server records + state; daemon owns containers. No DB imports in daemon. |
| II. Shared Contracts as Source of Truth | ✅ PASS | Server schemas in `packages/shared/src/server/`. New `ServerRecordSchema`, `ServerCreateInputSchema` added there. |
| III. Security-First Container Isolation | ✅ PASS | No new container access; daemon already enforces isolation (R6). |
| IV. Test Against Real Infrastructure | ✅ PASS | Integration tests with Testcontainers; E2E with real daemon via run-e2e.ts; MCP verification before Playwright. |
| V. Spec-Driven Development | ✅ PASS | Spec → plan → tasks → implement. |
| VI. Real-time Protocol Selection | ✅ PASS | HTTP for create/start/stop/restart/delete actions; SSE for state updates; no polling. |

## Project Structure

### Documentation (this feature)

```text
specs/007-server-lifecycle/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/server/
├── record.ts            # NEW: ServerRecordSchema, ServerCreateInputSchema, ServerListResponseSchema
├── config.ts            # EXISTS: ServerConfigurationSchema (used by daemon)
├── lifecycle.ts         # EXISTS: CreateServerRequestSchema, LifecycleResponseSchema
├── state.ts             # EXISTS: ContainerStateSchema, StateChangeEventSchema
└── index.ts             # UPDATE: re-export record.ts

packages/db/src/schema/
├── servers.ts           # NEW: servers table (id, name, nodeId, templateId, allocationId, status, config JSONB, createdAt, updatedAt)
└── index.ts             # UPDATE: export servers

apps/api/src/
├── routes/
│   ├── servers.ts       # REFACTOR: panel-owned CRUD + power actions + list
│   ├── servers.spec.ts  # NEW: route tests
│   └── server-state.ts  # EXISTS: daemon state reports (update to persist state)
├── services/
│   ├── server.service.ts     # NEW: createServer, getServer, listServers, deleteServer, powerAction, updateServerState
│   └── server.service.spec.ts # NEW: service integration tests

apps/panel/src/
├── hooks/
│   └── useServers.ts    # NEW: useServers, useServer, useCreateServer, usePowerAction, useDeleteServer
├── components/
│   └── servers/
│       ├── server-list.tsx     # NEW
│       ├── server-detail.tsx   # NEW (power controls + info)
│       └── server-create-dialog.tsx # NEW
├── routes/
│   ├── servers.tsx      # NEW: servers list page
│   └── server-detail.tsx # NEW: server detail page
└── tests/e2e/
    └── server-lifecycle.spec.ts # UPDATE: existing R6 test → R9 panel-owned flow
```

**Structure Decision**: Monorepo web application. Panel-owned server records in `packages/db`, shared contracts in `packages/shared`, API service + routes in `apps/api`, panel hooks + components in `apps/panel`. The existing `servers.ts` route is a daemon proxy — R9 refactors it to own the server record first, then delegate to the daemon.

## Complexity Tracking

No violations. All constitution principles pass.
