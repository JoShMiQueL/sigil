# Quickstart: Allocations

## Prerequisites

- Docker running (for Testcontainers)
- `bun dev:services` (PostgreSQL + Redis) or let Testcontainers handle it
- API + panel running (or use `scripts/run-e2e.ts`)

## Validation Scenarios

### 1. Add allocations via API

```bash
# Login
COOKIE=$(curl -s -c - http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' \
  | grep session | awk '{print $NF}')

# Get a node ID
NODE_ID=$(curl -s http://localhost:3000/api/admin/nodes \
  -H "Cookie: session=$COOKIE" | jq -r '.[0].id')

# Add a port range
curl -s http://localhost:3000/api/admin/nodes/$NODE_ID/allocations \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$COOKIE" \
  -d '{"ip":"203.0.113.10","portStart":25565,"portEnd":25575,"protocol":"tcp"}'
# Expected: {"created":11,"skipped":0,"ip":"203.0.113.10","portRange":"25565-25575"}

# Add overlapping range (idempotent)
curl -s http://localhost:3000/api/admin/nodes/$NODE_ID/allocations \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$COOKIE" \
  -d '{"ip":"203.0.113.10","portStart":25570,"portEnd":25580}'
# Expected: {"created":5,"skipped":6,...}
```

### 2. List and filter allocations

```bash
# List all
curl -s "http://localhost:3000/api/admin/nodes/$NODE_ID/allocations" \
  -H "Cookie: session=$COOKIE" | jq '.total, .available, .assigned'

# Filter by status
curl -s "http://localhost:3000/api/admin/nodes/$NODE_ID/allocations?status=available" \
  -H "Cookie: session=$COOKIE" | jq '.allocations | length'

# Search by port
curl -s "http://localhost:3000/api/admin/nodes/$NODE_ID/allocations?port=25565" \
  -H "Cookie: session=$COOKIE" | jq '.allocations[0].port'
```

### 3. Assign and unassign

```bash
# Get an available allocation
ALLOC_ID=$(curl -s "http://localhost:3000/api/admin/nodes/$NODE_ID/allocations?status=available" \
  -H "Cookie: session=$COOKIE" | jq -r '.allocations[0].id')

# Assign to a server (use any UUID for testing)
SERVER_ID=$(uuidgen)
curl -s http://localhost:3000/api/admin/nodes/$NODE_ID/allocations/$ALLOC_ID/assign \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$COOKIE" \
  -d "{\"serverId\":\"$SERVER_ID\",\"isPrimary\":true}"
# Expected: {"id":"...","status":"assigned","serverId":"...","isPrimary":true}

# Try to delete assigned allocation (should fail)
curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE http://localhost:3000/api/admin/nodes/$NODE_ID/allocations/$ALLOC_ID \
  -H "Cookie: session=$COOKIE"
# Expected: 409

# Unassign
curl -s http://localhost:3000/api/admin/nodes/$NODE_ID/allocations/$ALLOC_ID/unassign \
  -H "Cookie: session=$COOKIE"
# Expected: {"id":"...","status":"available","serverId":null,"isPrimary":false}
```

### 4. Auto-assign

```bash
SERVER_ID=$(uuidgen)
curl -s http://localhost:3000/api/admin/nodes/$NODE_ID/allocations/auto-assign \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$COOKIE" \
  -d "{\"serverId\":\"$SERVER_ID\"}"
# Expected: allocation object with status=assigned, isPrimary=true
```

### 5. Release server allocations

```bash
curl -s http://localhost:3000/api/admin/allocations/release \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$COOKIE" \
  -d "{\"serverId\":\"$SERVER_ID\"}"
# Expected: {"released":1}
```

### 6. MCP verification (panel UI)

1. Open `http://localhost:5173` in browser
2. Login as admin
3. Navigate to Nodes → click a node
4. Verify "Allocations" section appears with summary (total/available/assigned)
5. Add an IP + port range via the form
6. Verify allocations appear in the list with correct status
7. Filter by status and search by port
8. Verify SSE updates (allocations appear without page reload)
9. Delete an available allocation — verify it disappears
10. Try to delete an assigned allocation — verify error message

### 7. Run tests

```bash
bun run test          # unit + integration (Testcontainers PostgreSQL)
bun run test:e2e      # E2E (Playwright + real API + panel)
```
