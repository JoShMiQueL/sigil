# Implementation Plan: Real-time Panel Updates

**Branch**: `003-real-time-panel` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-real-time-panel/spec.md`

## Summary

Real-time panel infrastructure using Server-Sent Events (SSE). Replaces all HTTP polling in R1/R4 with a push-based model. A single SSE endpoint in the API multiplexes event types (node, region, user) to authenticated panel clients. A reusable `useSSE` hook integrates with TanStack Query so existing components become reactive without rewriting their data layer. Auto-reconnect with exponential backoff ensures the panel survives network blips without page reloads. This is the foundation for all future real-time features (R5 audit log, R9 server status, R10 console stats).

## Technical Context

**Language/Version**: TypeScript 7.0 on Bun 1.4

**Primary Dependencies**: Hono 4.13 (SSE via `hono/streaming` `streamSSE`), TanStack Query 5 (query invalidation on SSE events), React 19.2 (EventSource API), ioredis 5.8 (pub/sub for multi-process event fanout)

**Storage**: PostgreSQL 18 (existing tables — no new tables), Redis 8 (pub/sub channel for SSE event fanout across API instances)

**Testing**: Vitest 5 (unit — SSE event emitter, debounce, reconnect logic), Testcontainers 12 (integration — SSE endpoint with real DB), Playwright 1.62 (E2E — real-time node status update in browser)

**Target Platform**: Linux server (API), any modern browser (panel — EventSource is universally supported)

**Project Type**: web-service (Hono API SSE endpoint + React SPA hook)

**Performance Goals**: event delivery < 1s from DB change to browser render, 50 concurrent SSE connections, debounce metrics to 1 event/sec/node

**Constraints**: no polling for state data (Constitution Principle VI), auto-reconnect with backoff, session-cookie auth for SSE, single connection per client multiplexing all event types

**Scale/Scope**: 4 user stories, 1 SSE endpoint, 1 reusable hook, retrofit R1/R4 components, ~6 event types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | SSE is panel-only. The API pushes events to the browser. The daemon reports to the API via HTTP (existing heartbeat mechanism). The daemon never talks to the browser directly. No Docker, no filesystem. |
| II. Shared Contracts as Source of Truth | ✅ PASS | SSE event schemas (SSEEvent, event type enums, payloads) live in `packages/shared`. Both API and panel import them. The `useSSE` hook is typed against shared schemas. |
| III. Security-First Container Isolation | ✅ N/A | No containers, no filesystem, no user input to shell. SSE auth reuses session cookie from R1. No new secrets. |
| IV. Test Against Real Infrastructure (NON-NEGOTIABLE) | ✅ PASS | Unit tests for event emitter, debounce, reconnect logic. Integration tests with Testcontainers (real DB, real SSE stream). E2E with Playwright (real browser, real SSE connection, real-time update visible). MCP-first verification: verify the SSE flow in the browser before writing Playwright tests. |
| V. Spec-Driven Development | ✅ PASS | Spec written and validated before this plan. |
| VI. Real-time Protocol Selection | ✅ PASS | This spec IS the implementation of Principle VI. SSE for panel updates, HTTP for actions, WebSocket deferred to R10. No polling. Auto-reconnect. Graceful degradation. |

**Gate result**: All principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/003-real-time-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── sse-api.md       # SSE endpoint and event contracts
└── tasks.md             # Phase 2 output (not created by this command)
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── index.ts                    # Register SSE route
│       ├── routes/
│       │   └── sse.ts                  # GET /api/sse — SSE endpoint (streamSSE)
│       ├── services/
│       │   └── sse.service.ts          # Event emitter, pub/sub, debounce, subscriber management
│       └── lib/
│           └── sse-events.ts            # Event type registry, typed emit helpers
├── panel/
│   └── src/
│       ├── hooks/
│       │   ├── useSSE.ts               # Reusable SSE hook (connect, reconnect, event dispatch)
│       │   ├── useRegions.ts           # Updated: remove polling, use SSE for invalidation
│       │   └── useNodes.ts             # Updated: remove refetchInterval, use SSE for invalidation
│       └── components/
│           └── ReconnectingIndicator.tsx  # "Reconnecting" banner shown on SSE drop
packages/
└── shared/
    └── src/
        ├── sse/
        │   ├── events.ts               # SSEEventSchema, SSEEventType enum, event payload schemas
        │   └── index.ts                # Re-exports
        └── index.ts                    # Re-export sse schemas
```

**Structure Decision**: Follows the existing monorepo pattern. SSE endpoint in `apps/api/src/routes/sse.ts` using Hono's `streamSSE`. Event emitter service in `apps/api/src/services/sse.service.ts` manages subscribers and Redis pub/sub for multi-process fanout. Shared event schemas in `packages/shared/src/sse/`. Panel hook in `apps/panel/src/hooks/useSSE.ts` wraps the native EventSource API with auto-reconnect and TanStack Query integration. R1/R4 hooks (`useRegions`, `useNodes`) are retrofitted to remove `refetchInterval` and subscribe to SSE events instead.
