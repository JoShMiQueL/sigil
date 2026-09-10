# Contract: Daemon HTTP API (Panel → Daemon)

**Feature**: 004-daemon-core
**Base URL**: `http://<node-ip>:<port>` (default port 8080)

All requests are authenticated with HMAC-SHA256 using the same credential scheme as R4 node auth. The panel signs requests with the node's secret.

**Authentication headers** (on every request):
- `X-Node-Id`: the node's `secret_id`
- `X-Node-Signature`: `HMAC-SHA256(secret, timestamp + body)`
- `X-Node-Timestamp`: Unix epoch seconds (must be within ±60s of daemon time)

**Error responses** (all endpoints):
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description" } }
```

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `AUTH_FAILED` | 401 | Invalid or missing auth headers |
| `TIMESTAMP_OUT_OF_WINDOW` | 400 | Timestamp outside ±60s window |
| `SERVER_NOT_FOUND` | 404 | Server UUID not managed by this daemon |
| `INVALID_CONFIG` | 400 | Server configuration validation failed |
| `DOCKER_UNAVAILABLE` | 503 | Docker daemon not reachable |
| `DISK_FULL` | 503 | Disk usage exceeds threshold, refusing new servers |
| `IMAGE_PULL_FAILED` | 422 | Failed to pull the requested image |
| `CONFLICT` | 409 | Operation conflicts with current server state |

## POST /servers

Create a new server container. Validates configuration, pulls image if needed, creates volume directory, creates and starts the container.

**Request**: `CreateServerRequestSchema` (= `ServerConfigurationSchema`)
```json
{
  "serverId": "uuid",
  "image": "alpine:latest",
  "startupCommand": "sleep infinity",
  "environment": { "ENV_VAR": "value" },
  "portMappings": [
    {
      "hostPort": 25565,
      "containerPort": 25565,
      "protocol": "tcp"
    }
  ],
  "resourceLimits": {
    "memoryMb": 512,
    "cpuLimit": 1.0,
    "pidsLimit": 256
  },
  "volumePath": "/var/lib/sigil/volumes/uuid"
}
```

**Response 201**: `LifecycleResponseSchema`
```json
{
  "serverId": "uuid",
  "state": "running",
  "message": "Container created and started"
}
```

**Response 400**: Invalid configuration.
```json
{ "error": { "code": "INVALID_CONFIG", "message": "Image is required" } }
```

**Response 503**: Docker unavailable or disk full.
```json
{ "error": { "code": "DISK_FULL", "message": "Disk usage at 97%, refusing new servers" } }
```

**Response 422**: Image pull failed.
```json
{ "error": { "code": "IMAGE_PULL_FAILED", "message": "Failed to pull image alpine:latest: manifest not found" } }
```

## POST /servers/:serverId/start

Start a stopped or crashed server container. Idempotent — starting a running server is a no-op.

**Response 200**: `LifecycleResponseSchema`
```json
{
  "serverId": "uuid",
  "state": "running"
}
```

**Response 404**: Server not found.

## POST /servers/:serverId/stop

Stop a running server container gracefully. Sends SIGTERM, waits for the configured timeout (default 10s), then sends SIGKILL. Idempotent — stopping a stopped server is a no-op.

**Response 200**: `LifecycleResponseSchema`
```json
{
  "serverId": "uuid",
  "state": "stopped"
}
```

**Response 404**: Server not found.

## POST /servers/:serverId/restart

Restart a server container. Stops (if running), then starts.

**Response 200**: `LifecycleResponseSchema`
```json
{
  "serverId": "uuid",
  "state": "running"
}
```

**Response 404**: Server not found.

## DELETE /servers/:serverId

Remove a server container and clean up resources. Stops the container if running, removes it, deletes the volume directory.

**Response 204**: Server removed.

**Response 404**: Server not found.

## GET /servers/:serverId

Get the current status of a server.

**Response 200**: `ServerStatusSchema`
```json
{
  "serverId": "uuid",
  "state": "running",
  "containerId": "abc123...",
  "uptime": 3600
}
```

**Response 404**: Server not found.

## GET /servers

List all managed servers and their states.

**Response 200**: `ServerStatusSchema[]`
```json
[
  {
    "serverId": "uuid",
    "state": "running",
    "containerId": "abc123...",
    "uptime": 3600
  }
]
```

## GET /health

Daemon health check. No authentication required.

**Response 200**:
```json
{
  "status": "ok",
  "docker": "connected",
  "registered": true,
  "servers": 5
}
```

**Response 503**: Docker unavailable.
```json
{
  "status": "degraded",
  "docker": "disconnected",
  "registered": true,
  "servers": 5
}
```
