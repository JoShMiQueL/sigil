# Quickstart: Server Lifecycle (R9)

## Prerequisites

- Docker running (for Testcontainers + dev services)
- `bun dev:services` started (PostgreSQL + Redis)
- `bun --filter @sigilpanel/db db:migrate` run
- `bun --filter @sigilpanel/api db:seed` run (admin user)
- API running on `:3000`
- Panel running on `:5173`
- A registered node with available allocations and an activated template

## Validation Scenarios

### 1. Create a server via API

```bash
# Login as admin
ADMIN_COOKIE=$(curl -s -c - -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' | grep session | awk '{print $NF}')

# Get a node ID
NODE_ID=$(curl -s -b "session=$ADMIN_COOKIE" http://localhost:3000/api/admin/nodes | python3 -c "import sys,json; print(json.load(sys.stdin)['nodes'][0]['id'])")

# Get an active template ID
TEMPLATE_ID=$(curl -s -b "session=$ADMIN_COOKIE" http://localhost:3000/api/admin/templates | python3 -c "import sys,json; print(json.load(sys.stdin)['templates'][0]['id'])")

# Create a server
curl -s -b "session=$ADMIN_COOKIE" -X POST http://localhost:3000/api/admin/servers \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Server\",\"nodeId\":\"$NODE_ID\",\"templateId\":\"$TEMPLATE_ID\"}"
```

**Expected**: 201 with server record, `status: "offline"`, `allocationId` populated.

### 2. List servers via API

```bash
curl -s -b "session=$ADMIN_COOKIE" http://localhost:3000/api/admin/servers | python3 -m json.tool
```

**Expected**: `servers` array containing the created server, `total` >= 1.

### 3. Start a server via API

```bash
SERVER_ID=<from step 1>
curl -s -b "session=$ADMIN_COOKIE" -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/power \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}'
```

**Expected**: 200 with `status: "starting"`.

### 4. Stop a server via API

```bash
curl -s -b "session=$ADMIN_COOKIE" -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/power \
  -H "Content-Type: application/json" \
  -d '{"action":"stop"}'
```

**Expected**: 200 with `status: "stopping"`.

### 5. Delete a server via API

```bash
curl -s -b "session=$ADMIN_COOKIE" -X DELETE http://localhost:3000/api/admin/servers/$SERVER_ID
```

**Expected**: 204 no body. Verify allocations released: `GET /api/admin/nodes/$NODE_ID/allocations/summary` shows the allocation as available again.

### 6. MCP verification — Create server via panel UI

1. Login to panel at `http://localhost:5173`
2. Navigate to Servers page
3. Click "Create Server"
4. Fill in name, select node, select template
5. Submit
6. Verify server appears in list with status "offline"
7. Verify allocation was assigned (check node detail page)

### 7. MCP verification — Power controls via panel UI

1. Navigate to server detail page
2. Click "Start"
3. Verify status changes to "starting" then "running" (via SSE, no page reload)
4. Click "Stop"
5. Verify status changes to "stopping" then "stopped"
6. Click "Delete"
7. Confirm deletion
8. Verify server disappears from list (via SSE, no page reload)
9. Verify allocations released on node detail page

### 8. Error cases via API

```bash
# No available allocations — create a node with no allocations, try to create a server
# Expected: 409 NO_AVAILABLE_ALLOCATIONS

# Node unreachable — stop the daemon, try to create a server
# Expected: 502 NODE_UNREACHABLE

# Invalid state transition — try to start a running server
# Expected: 409 INVALID_STATE_TRANSITION

# Duplicate name — create two servers with the same name on the same node
# Expected: 409 DUPLICATE_NAME
```
