# Quickstart: Daemon Core

**Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Prerequisites

- Go 1.27 installed
- Docker Engine running on the machine (for integration tests and daemon execution)
- Panel API running (R1 + R4 completed) with at least one region and a generated pairing token
- `bun dev:services` running (PostgreSQL + Redis for the panel)

## Validation Scenarios

### Scenario 1: Daemon registers and sends heartbeats (P1)

**Setup**: Panel running on `localhost:3000`, a region exists, a pairing token generated.

```bash
# Generate a pairing token via the API (as admin)
curl -X POST http://localhost:3000/api/admin/pairing/tokens \
  -H "Cookie: <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"regionId": "<region-uuid>"}'
# → { "token": "sigilpair_..." }
```

**Run**:
```bash
# Create daemon config
cat > /tmp/daemon.yaml << 'EOF'
panel_url: http://localhost:3000
pairing_token: sigilpair_<token-from-above>
credentials_path: /tmp/daemon-creds.json
volume_base_path: /tmp/sigilpanel/volumes
docker_socket: /var/run/docker.sock
listen_address: 127.0.0.1:8080
heartbeat_interval_sec: 5
EOF

# Start the daemon
cd apps/daemon && go run cmd/daemon/main.go --config /tmp/daemon.yaml
```

**Expected**:
- Daemon logs "registered with panel, node ID: <uuid>"
- Panel shows the node as "online" at `GET /api/admin/nodes`
- Heartbeats arrive every 5 seconds (visible in panel node detail)
- Credentials stored at `/tmp/daemon-creds.json` with `0600` permissions

**Restart test**:
```bash
# Stop the daemon (Ctrl+C), then restart
go run cmd/daemon/main.go --config /tmp/daemon.yaml
# Daemon logs "using stored credentials, skipping registration"
# Node goes back to "online" after first heartbeat
```

### Scenario 2: Container lifecycle through the daemon API (P2)

**Setup**: Daemon running and registered.

```bash
# Create a server
curl -X POST http://localhost:8080/servers \
  -H "X-Node-Id: <secret_id>" \
  -H "X-Node-Signature: <hmac>" \
  -H "X-Node-Timestamp: <timestamp>" \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "550e8400-e29b-41d4-a716-446655440000",
    "image": "alpine:latest",
    "startupCommand": "sleep infinity",
    "environment": {},
    "portMappings": [],
    "resourceLimits": { "memoryMb": 128, "cpuLimit": 0.5 },
    "volumePath": "/tmp/sigilpanel/volumes/550e8400"
  }'
# → 201 { "serverId": "...", "state": "running" }

# Verify container exists
docker ps --filter label=sigilpanel.server-id=550e8400-e29b-41d4-a716-446655440000

# Stop the server
curl -X POST http://localhost:8080/servers/550e8400.../stop \
  -H <auth-headers>
# → 200 { "serverId": "...", "state": "stopped" }

# Start it again
curl -X POST http://localhost:8080/servers/550e8400.../start \
  -H <auth-headers>
# → 200 { "serverId": "...", "state": "running" }

# Remove it
curl -X DELETE http://localhost:8080/servers/550e8400... \
  -H <auth-headers>
# → 204

# Verify container is gone
docker ps -a --filter label=sigilpanel.server-id=550e8400...
# → empty

# Verify volume directory is deleted
ls /tmp/sigilpanel/volumes/550e8400...
# → No such file or directory
```

### Scenario 3: Filesystem jail blocks path traversal (P3)

**Run unit tests**:
```bash
cd apps/daemon && go test ./internal/jail/ -v -run TestJail
```

**Expected**: All tests pass, including:
- `TestPathTraversal` — `../../etc/passwd` rejected
- `TestSymlinkEscape` — symlink to `/etc/passwd` rejected
- `TestZipSlip` — archive with `../` entries rejected
- `TestValidPath` — normal paths within jail succeed
- `TestCrossServerIsolation` — server A cannot access server B's directory

### Scenario 4: State change reporting (P4)

**Setup**: Daemon running, a server created and running.

```bash
# Kill the container directly (simulating a crash)
docker kill <container-id>

# Within 5 seconds, the daemon detects the state change and sends a callback to the panel
# Verify by checking the daemon's logs for the state-change report
# The panel receives POST /api/node/server-state and emits a "server.state" SSE event
# (Note: the panel does not yet persist server state — the servers table is R9.
#  R6 validates the callback is received and the SSE event is emitted.)

# Verify the SSE event was emitted by checking the API logs or
# subscribing to SSE from a browser session
```

**Panel outage test**:
```bash
# Stop the panel
# Kill a container
# The daemon logs "failed to report state change, queuing event"
# Restart the panel
# Within 30 seconds, the daemon delivers queued events
# Panel shows the correct state
```

### Scenario 5: Security hardening (P5)

**Setup**: Daemon running, a server created.

```bash
# Inspect the container's security settings
docker inspect <container-id> --format '{{.HostConfig.CapDrop}}'
# → [ALL]

docker inspect <container-id> --format '{{.HostConfig.SecurityOpt}}'
# → [no-new-privileges]

docker inspect <container-id> --format '{{.Config.User}}'
# → 1000:1000 (non-root, allocated by daemon)

docker inspect <container-id> --format '{{.HostConfig.PidsLimit}}'
# → 512

docker inspect <container-id> --format '{{.HostConfig.Memory}}'
# → 536870912 (512MB in bytes)

docker inspect <container-id> --format '{{.HostConfig.Privileged}}'
# → false

# Verify Docker socket is NOT mounted
docker inspect <container-id> --format '{{.Mounts}}' | grep docker.sock
# → empty (no docker.sock mount)
```

### Scenario 6: Unit and integration tests

```bash
# Unit tests (no Docker needed)
cd apps/daemon && go test ./internal/... -v

# Integration tests (requires Docker running)
cd apps/daemon && go test ./internal/docker/ -v -tags integration

# Schema compatibility test (verifies Go structs match Zod schemas)
cd apps/daemon && go test ./internal/server/ -v -run TestSchemaCompatibility
```

**Expected**: All tests pass. Integration tests create real containers with `alpine:latest`, verify lifecycle operations, and clean up after themselves.
