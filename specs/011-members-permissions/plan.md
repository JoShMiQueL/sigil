# Implementation Plan: Members & Permissions

**Branch**: `011-members-permissions` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-members-permissions/spec.md`

## Summary

R13 adds a per-server member system with granular permission bits. Admins can add registered users as members of specific servers, grant/revoke individual permissions (console, files, backups, power, settings, members, allocations, databases), and transfer ownership. Subusers see only their assigned servers and can only perform permitted actions. The existing admin-only guards on server-scoped routes are replaced with a permission-aware middleware that checks member permissions for non-admin users.

## Technical Context

**Language/Version**: TypeScript 7.0 (API + panel), Go 1.27 (daemon — no changes needed)

**Primary Dependencies**: Hono 4.13, Drizzle ORM 0.45, Zod 4.5, React 19.2, TanStack Query, TanStack Router

**Storage**: PostgreSQL 18 (new `server_members` table)

**Testing**: Vitest 5 (unit/integration), Testcontainers 12 (DB), Playwright 1.62 (E2E)

**Target Platform**: Linux server (API + daemon), browser (panel)

**Project Type**: Web service (monorepo: API + panel + daemon)

**Performance Goals**: Permission checks must add <5ms to request latency

**Constraints**: Permission enforcement must be immediate — no caching of stale permissions

**Scale/Scope**: 8 permission bits, 1 new DB table, ~15 new API endpoints, 4 panel pages/components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Members/permissions are entirely panel-side (DB + API). Daemon is not involved — it already trusts the panel's auth. |
| II. Shared Contracts as Source of Truth | ✅ PASS | Permission schemas and member types go in `packages/shared`. Both API and panel import from shared. |
| III. Security-First Container Isolation | ✅ PASS | No filesystem or container changes. Permissions are an API-layer concern. |
| IV. Test Against Real Infrastructure | ✅ PASS | Unit tests for permission logic, integration tests with Testcontainers, E2E tests with Playwright. |
| V. Spec-Driven Development | ✅ PASS | Spec created and validated before planning. |
| VI. Real-time Protocol Selection | ✅ PASS | Member management is HTTP (actions). No SSE/WS needed. Permission changes take effect on next request (no stale state). |

## Project Structure

### Documentation (this feature)

```text
specs/011-members-permissions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/api.md     # Phase 1 output
└── tasks.md             # Phase 2 output (not yet created)
```

### Source Code (repository root)

```text
packages/shared/src/members/
├── permissions.ts       # Permission bit definitions, schemas
└── member.ts            # MemberSchema, ServerMemberSchema

packages/db/src/schema/
└── server-members.ts    # server_members table

apps/api/src/
├── middleware/
│   └── server-permission.ts  # Permission-aware middleware for server-scoped routes
├── routes/
│   └── members.ts            # Member CRUD routes
└── services/
    └── member.service.ts     # Member business logic

apps/panel/src/
├── hooks/
│   └── useMembers.ts         # React Query hooks for members
├── components/members/
│   ├── member-list.tsx       # Member table with permissions
│   ├── member-add.tsx        # Add member form
│   └── member-permissions.tsx # Permission editor
└── components/servers/
    └── server-detail.tsx     # Add Members section
```

**Structure Decision**: Monorepo with shared contracts in `packages/shared`, DB schema in `packages/db`, API routes in `apps/api`, and panel components in `apps/panel`. The daemon is not modified — it already trusts the panel's auth decisions.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
