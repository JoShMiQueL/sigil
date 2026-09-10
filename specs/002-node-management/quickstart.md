# Quickstart: Node Management

**Feature**: 002-node-management
**Date**: 2026-09-09

## Prerequisites

- Docker running (for PostgreSQL + Redis dev services)
- R1 (User Auth) implemented and working
- Admin account seeded (`admin@sigil.local` / `admin12345`)

## Setup

```bash
bun dev:services          # Start PostgreSQL + Redis
bun --filter @sigil/db db:generate  # Generate Drizzle migrations
bun --filter @sigil/db db:migrate   # Run migrations
bun --filter @sigil/api db:seed     # Seed admin user
bun dev                   # Start API (:3000) + panel (:5173)
```

## Verification Scenarios

### 1. Region management

1. Log in as admin at `http://localhost:5173`
2. Navigate to Nodes
3. Click "Create Region", enter name "EU-West" and description "European servers"
4. Verify the region appears in the region list with 0 nodes and 0 servers
5. Try to create another region with the same name — verify error "A region with this name already exists"
6. Delete the region — verify it disappears (no nodes assigned, so deletion succeeds)

### 2. Node pairing

1. Create a region "EU-West"
2. Click "Generate Pairing Token" and select the EU-West region
3. Verify the token is displayed once with an expiration time
4. Simulate a daemon registration:
   ```bash
   curl -X POST http://localhost:3000/api/node/register \
     -H "Content-Type: application/json" \
     -d '{
       "pairingToken": "<token from step 3>",
       "hostname": "node-01.example.com",
       "ipAddress": "203.0.113.10",
       "capabilities": { "docker": true, "sftp": true }
     }'
   ```
5. Verify the response contains `nodeId`, `secretId`, and `secret`
6. Verify the node appears in the node list with status "unknown"
7. Try to register again with the same token — verify error "Pairing token already used"

### 3. Heartbeat and health monitoring

1. Register a node (see scenario 2)
2. Send a heartbeat:
   ```bash
   # Compute HMAC signature (example, real daemon does this in Go)
   curl -X POST http://localhost:3000/api/node/heartbeat \
     -H "Content-Type: application/json" \
     -H "X-Node-Id: <secret_id>" \
     -H "X-Node-Signature: <hmac>" \
     -H "X-Node-Timestamp: <unix_ts>" \
     -d '{
       "timestamp": <unix_ts>,
       "cpuUsage": 42.5,
       "memoryUsage": 68.0,
       "diskUsage": 35.2,
       "containerCount": 5
     }'
   ```
3. Verify the node's status changes to "online" with resource usage displayed
4. Wait 90+ seconds without sending a heartbeat
5. Verify the node's status changes to "offline"
6. Send another heartbeat — verify status returns to "online"

### 4. Node management

1. Register a node (see scenario 2)
2. Edit the node's display name — verify the change is saved
3. Regenerate credentials — verify new credentials are shown and old ones are invalid
4. Try to send a heartbeat with the old credentials — verify 401 error
5. Remove the node — verify it disappears from the list
6. Try to send a heartbeat with the removed node's credentials — verify 401 error

### 5. Region deletion guard

1. Create a region and register a node in it
2. Try to delete the region — verify error "Cannot delete a region with active nodes"
3. Remove the node
4. Delete the region — verify it succeeds

## Running Tests

```bash
bun run test                    # Unit + integration (Testcontainers PostgreSQL)
bun run test:e2e                # E2E (Playwright, needs Docker for dev services)
```

See [AGENTS.md](../../../AGENTS.md) for the complete test guide.
