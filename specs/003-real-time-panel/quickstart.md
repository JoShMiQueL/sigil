# Quickstart: Real-time Panel Updates

**Date**: 2026-09-09 | **Feature**: R17 Real-time Panel

## Prerequisites

- Docker running (PostgreSQL + Redis via `bun dev:services`)
- R1 (auth) and R4 (node management) implemented
- chrome-devtools MCP configured (see AGENTS.md)

## Setup

```bash
bun dev:services
bun --filter @sigil/db db:migrate
bun --filter @sigil/api db:seed
bun dev
```

## Validation Scenarios

### Scenario 1: Node status updates in real time (US1)

1. Open `http://localhost:5173` in the browser, log in as admin
2. Navigate to `/nodes`
3. Create a region if none exists
4. Generate a pairing token
5. Register a node via API:
   ```bash
   curl -X POST http://localhost:3000/api/node/register \
     -H "Content-Type: application/json" \
     -d '{"pairingToken":"sigilpair_...","hostname":"rt-test.local","ipAddress":"10.0.0.1","capabilities":{"docker":true}}'
   ```
6. **Verify**: The node appears in the table automatically (no page reload)
7. Send a heartbeat with the returned credentials:
   ```bash
   # Use the secretId and secret from registration response
   # See specs/002-node-management/quickstart.md for HMAC signature format
   curl -X POST http://localhost:3000/api/node/heartbeat \
     -H "Content-Type: application/json" \
     -H "x-node-id: <secretId>" \
     -H "x-node-signature: <hmac>" \
     -H "x-node-timestamp: <ts>" \
     -d '{"timestamp":<ts>,"cpuUsage":42.5,"memoryUsage":68,"diskUsage":35.2,"containerCount":5}'
   ```
8. **Verify**: The node status changes to "online" and metrics appear in the table within 1 second — no page reload, no manual refresh
9. Wait 90+ seconds without sending heartbeats
10. **Verify**: The node status changes to "offline" with a red indicator — no page reload

### Scenario 2: Auto-reconnect (US2)

1. Open the nodes page with at least one node
2. Stop the API server (`Ctrl+C` or kill the process)
3. **Verify**: Within 2 seconds, a "reconnecting" indicator appears
4. Restart the API server
5. **Verify**: The "reconnecting" indicator disappears, the panel resyncs, and real-time updates resume — no page reload

### Scenario 3: No polling in code (US3)

1. Search the panel source for polling:
   ```bash
   grep -r "refetchInterval" apps/panel/src/
   grep -r "setInterval" apps/panel/src/
   ```
2. **Verify**: No results (or only in the degraded-mode fallback in `useSSE.ts`)

### Scenario 4: Reusable hook for future events (US4)

1. In a panel component, add a subscription:
   ```typescript
   useSSE({
     handlers: {
       "audit.create": (payload) => console.log("New audit entry:", payload),
     },
   });
   ```
2. Emit an `audit.create` event from the API
3. **Verify**: The handler fires in the browser console — no new SSE connection, no new endpoint

## MCP Verification

Before writing Playwright tests, verify interactively with chrome-devtools MCP:

1. Navigate to `/nodes`, take a snapshot
2. Register a node via `evaluate_script` (fetch to `/api/node/register`)
3. Take a snapshot — verify the node appears in the table without navigation
4. Send a heartbeat via `evaluate_script` (fetch to `/api/node/heartbeat` with HMAC)
5. Take a snapshot — verify status is "online" and metrics are visible
6. Wait for timeout sweep (or mock time)
7. Take a snapshot — verify status is "offline"
8. Stop the API, take a snapshot — verify "reconnecting" indicator
9. Restart the API, take a snapshot — verify indicator is gone and updates resume
