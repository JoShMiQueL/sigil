# Quickstart: Live Console

## Prerequisites

- Docker running (for Testcontainers + daemon)
- `bun dev:services` started (PostgreSQL + Redis)
- `bun --filter @sigil/db db:migrate` applied
- `bun --filter @sigil/api db:seed` run (admin user exists)
- Daemon running on `127.0.0.1:8080` with `APP_SECRET` set in config

## Validation Scenarios

### Scenario 1: Issue a console token

```bash
# Login and get session cookie
COOKIE=$(curl -s -c - http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' \
  | grep sigil_session | awk '{print $NF}')

# Create a server (requires node + active template + allocations)
SERVER_ID=$(curl -s http://localhost:3000/api/admin/servers \
  -H "Content-Type: application/json" \
  -H "Cookie: sigil_session=$COOKIE" \
  -d '{"name":"Console Test","nodeId":"<node-uuid>","templateId":"<template-uuid>","variables":{}}' \
  | jq -r '.id')

# Request a console token
curl -s http://localhost:3000/api/admin/servers/$SERVER_ID/console-token \
  -H "Cookie: sigil_session=$COOKIE"
```

**Expected**: JSON with `token`, `daemonUrl`, `serverId`, `expiresIn: 300`.

### Scenario 2: Console token for stopped server

```bash
# Stop the server first
curl -s -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/power \
  -H "Content-Type: application/json" \
  -H "Cookie: sigil_session=$COOKIE" \
  -d '{"action":"stop"}'

# Try to get a console token
curl -s -w "\n%{http_code}" http://localhost:3000/api/admin/servers/$SERVER_ID/console-token \
  -H "Cookie: sigil_session=$COOKIE"
```

**Expected**: 409 with `SERVER_NOT_RUNNING` error.

### Scenario 3: MCP verification — console UI

1. Open `http://localhost:5173/login` in chrome-devtools MCP
2. Login as `admin@sigil.local` / `admin12345`
3. Navigate to `/servers`
4. Click a running server to open its detail page
5. Verify the console panel is visible with a "connected" indicator
6. Verify output appears in real time (if the server produces output)
7. Type a command in the input box and press Enter
8. Verify the command appears in the output
9. Stop the server via the power button
10. Verify the console shows "disconnected" and the input is disabled

### Scenario 4: MCP verification — resource stats

1. On the server detail page, verify the stats panel shows CPU, memory, and disk
2. Verify the values update every 5 seconds (watch for changes)
3. Stop the server
4. Verify stats show zero or "not available"

### Scenario 5: MCP verification — auto-reconnect

1. Open the console for a running server
2. Simulate a network blip (stop the daemon, wait 2s, restart it)
3. Verify the console shows "reconnecting..."
4. Verify the console reconnects and resumes streaming after the daemon is back
5. Verify recent output context is preserved (buffer replay)

### Scenario 6: Error paths

1. Try to open console for a stopped server → "server is not running" indicator
2. Try to send a command while server is stopped → input disabled
3. Navigate away from console and back → reconnects with buffer

### Scenario 7: E2E test

```bash
bun run test:e2e
```

**Expected**: All E2E tests pass, including new console tests:
- Console appears for running server
- Console shows "not running" for stopped server
- Command input is disabled when stopped
- Stats panel displays values
