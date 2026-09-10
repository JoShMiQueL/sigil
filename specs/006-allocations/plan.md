# Implementation Plan: Allocations

**Branch**: `006-allocations` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-allocations/spec.md`

## Summary

R7 implements IP/port allocation management per node. An admin configures IP addresses and port ranges on a node to create an allocation pool. Allocations can be assigned to servers (primary + secondary) and are released back to the pool when a server is deleted. The panel owns all allocation data; the daemon receives port mappings as part of server configuration (R6). Real-time updates use the existing SSE infrastructure (R17).

## Technical Context

**Language/Version**: TypeScript 7.0 (API + panel), Go 1.27 (daemon — not involved in R7)

**Primary Dependencies**: Hono 4.13 (API), React 19.2 + TanStack Router 1.170 + TanStack Query (panel), Drizzle ORM 0.45 (DB), Zod 4.5 (shared schemas), Vitest 5 + Testcontainers 12 (tests), Playwright 1.62 (E2E)

**Storage**: PostgreSQL 18 — new `allocations` table. No daemon storage (panel owns allocation data).

**Testing**: Vitest (unit/integration with Testcontainers PostgreSQL), Playwright (E2E), chrome-devtools MCP (interactive verification)

**Target Platform**: Linux server (panel + API), browser (admin UI)

**Project Type**: Web application (monorepo: API + panel + shared + db)

**Performance Goals**: Add 100 ports in <5s, search/filter 1000+ allocations without lag, SSE updates within 2s

**Constraints**: No polling for state (Constitution Principle VI), shared contracts in `packages/shared` (Principle II), panel-only data ownership (Principle I)

**Scale/Scope**: 4 user stories, 20 functional requirements, 1 new DB table, ~6 new API endpoints, 1 new panel page, SSE event extensions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Allocations are panel-owned. The daemon never touches allocation data — it receives port mappings as part of server configuration (R6). No DB imports in daemon, no Docker imports in panel. |
| II. Shared Contracts as Source of Truth | ✅ PASS | Zod schemas for allocations, IP/port validation, and SSE events are defined in `packages/shared` first. Both API and panel import from shared. |
| III. Security-First Container Isolation | ✅ PASS | R7 does not create containers or touch filesystems. It manages metadata (IP:port pairs). No security implications beyond ensuring allocations are properly assigned before server creation. |
| IV. Test Against Real Infrastructure | ✅ PASS | Integration tests use Testcontainers PostgreSQL. E2E tests use the real API + panel. MCP verification before Playwright. |
| V. Spec-Driven Development | ✅ PASS | This spec + plan follow the Spec Kit workflow. |
| VI. Real-time Protocol Selection | ✅ PASS | Allocation changes use SSE (server→browser state). No polling. Auto-reconnect via existing `useSSE` hook. HTTP for CRUD actions. |

## Project Structure

### Documentation (this feature)

```text
specs/006-allocations/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # REST API contracts
└── tasks.md             # Phase 2 output (speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── allocation/
│   └── allocation.ts    # Zod schemas: AllocationSchema, AllocationCreateSchema, etc.
├── sse/
│   └── events.ts        # Extend SSEEventTypeSchema with allocation events
└── index.ts             # Re-export allocation schemas

packages/db/src/
├── schema/
│   └── allocations.ts   # Drizzle table definition
├── migrations/          # Generated migration
└── index.ts             # Re-export

apps/api/src/
├── routes/
│   ├── allocations.ts   # REST endpoints (CRUD + assign + auto-assign)
│   └── allocations.spec.ts  # Integration tests
├── services/
│   └── allocation.service.ts  # Business logic
└── index.ts             # Mount allocations route

apps/panel/src/
├── routes/
│   └── node-detail.tsx   # Extend with allocations tab/section
├── components/
│   └── allocations/
│       ├── allocation-list.tsx     # List + filter + search
│       ├── allocation-form.tsx     # Add IP + port range form
│       └── allocation-summary.tsx  # Total/available/assigned counts
└── hooks/
    └── use-allocations.ts  # TanStack Query hooks
```

**Structure Decision**: Follows the existing monorepo pattern: shared schemas in `packages/shared`, DB schema in `packages/db`, API routes + services in `apps/api`, panel components + hooks in `apps/panel`. Allocations are scoped to nodes, so the UI lives in the node detail page (extending `node-detail.tsx`) rather than a separate top-level route.

## Complexity Tracking

No constitution violations. Table intentionally empty.
