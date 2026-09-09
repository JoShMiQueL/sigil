# Implementation Plan: Node Management

**Branch**: `002-node-management` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-node-management/spec.md`

## Summary

Node management for the SigilPanel control plane. Covers region management (P1), node pairing via single-use tokens (P2), node health monitoring via heartbeats (P3), and node lifecycle management (P4). The panel owns all node records and the API contract that the daemon (R6) will use to register and report. The daemon itself is not implemented in this spec.

## Technical Context

**Language/Version**: TypeScript 7.0 on Node 24 LTS

**Primary Dependencies**: Hono (API), Drizzle ORM (PostgreSQL), Zod 4 (validation), ioredis (Redis for heartbeat scheduling)

**Storage**: PostgreSQL 18 (regions, nodes, pairing_tokens, node_credentials), Redis 8 (heartbeat timeout tracking)

**Testing**: Vitest 5 (unit), Testcontainers 12 (integration with real PostgreSQL), Playwright 1.62 (E2E node management UI)

**Target Platform**: Linux server (panel API + UI), any modern browser (UI)

**Project Type**: web-service (Hono API + React SPA)

**Performance Goals**: node list < 200ms for 100 nodes, heartbeat processing < 50ms, pairing token validation < 100ms

**Constraints**: no `any` in TypeScript, Zod validation at all boundaries, pairing tokens single-use and time-limited, node credentials HMAC-based, no secrets in logs, audit log for all node management actions

**Scale/Scope**: 4 user stories, 5 entities, ~12 API endpoints, 1 React module (nodes section)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Node management is panel-only. The API holds node records, pairing tokens, and credentials. The daemon (R6) will call the API to register and send heartbeats — it never touches the database. No Docker imports in this spec. |
| II. Shared Contracts as Source of Truth | ✅ PASS | All node-related Zod schemas (region, node, pairing token, heartbeat) live in `packages/shared`. Both API and panel UI import from there. The daemon (R6) will also import these schemas. |
| III. Security-First Container Isolation | ✅ N/A | Node management does not involve containers or filesystem access. Pairing tokens and node credentials are security-sensitive: tokens are single-use and time-limited, credentials are HMAC-based and regenerable. |
| IV. Test Against Real Infrastructure | ✅ PASS | Unit tests for token generation, credential validation. Integration tests with Testcontainers (real PostgreSQL). E2E with Playwright for node management UI. Heartbeat timeout behavior tested with time mocking. |
| V. Spec-Driven Development | ✅ PASS | Spec written and validated before this plan. |
| VI. Browser-Direct Realtime | ✅ N/A | Node health is polled via REST, not realtime WebSocket. Realtime console/stats (R10) is a separate feature. |

**Gate result**: All principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-node-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── regions-api.md   # Region CRUD
│   ├── nodes-api.md     # Node CRUD, pairing, heartbeats
│   └── pairing-api.md   # Pairing token generation and daemon registration
└── tasks.md             # Phase 2 output (not created by this command)
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── index.ts                    # Register node routes
│       ├── middleware/
│       │   └── node-auth.ts            # Daemon credential authentication
│       ├── routes/
│       │   ├── regions.ts              # /api/admin/regions/* (CRUD)
│       │   ├── nodes.ts                # /api/admin/nodes/* (CRUD, edit, remove)
│       │   └── pairing.ts              # /api/admin/pairing/* + /api/node/* (register, heartbeat)
│       ├── services/
│       │   ├── region.service.ts       # Region CRUD, validation
│       │   ├── node.service.ts         # Node CRUD, status management
│       │   ├── pairing.service.ts      # Token generation, validation, consumption
│       │   └── heartbeat.service.ts    # Heartbeat processing, timeout detection
│       └── lib/
│           └── credentials.ts          # HMAC credential generation and verification
├── panel/
│   └── src/
│       ├── routes/
│       │   ├── nodes.tsx               # Node list page
│       │   └── node-detail.tsx         # Single node detail page
│       ├── components/
│       │   ├── RegionList.tsx          # Region list with node counts
│       │   ├── CreateRegionForm.tsx    # Create region dialog
│       │   ├── NodeTable.tsx           # Node list with status indicators
│       │   ├── PairingTokenDialog.tsx  # Generate and display pairing token
│       │   └── NodeDetailPanel.tsx     # Node details with resource usage
│       └── hooks/
│           ├── useRegions.ts           # Region data hook
│           └── useNodes.ts             # Node data hook with polling
packages/
├── shared/
│   └── src/
│       ├── node/
│       │   ├── region.ts               # Region, RegionCreate schemas
│       │   ├── node.ts                 # Node, NodeUpdate, NodeStatus schemas
│       │   ├── pairing.ts              # PairingToken, PairingRequest schemas
│       │   ├── heartbeat.ts            # HeartbeatPayload schema
│       │   └── credentials.ts          # NodeCredentials schema
│       └── index.ts                    # Re-exports node schemas
└── db/
    └── src/
        ├── schema/
        │   ├── regions.ts              # regions table
        │   ├── nodes.ts                # nodes table
        │   ├── pairing-tokens.ts       # pairing_tokens table
        │   └── node-credentials.ts     # node_credentials table
        ├── migrations/                 # Drizzle migrations
        └── index.ts                    # DB client + schema exports
```

**Structure Decision**: Follows the existing monorepo pattern from R1. API routes in `apps/api/src/routes/`, services in `apps/api/src/services/`, shared Zod schemas in `packages/shared/src/node/`, Drizzle schema in `packages/db/src/schema/`. The panel adds a new `nodes` section with routes and components. A new `node-auth.ts` middleware handles daemon credential authentication (separate from user session/API key auth from R1).
