# API Contracts: Templates & Tags

**Feature**: 005-templates-groups (R8)
**Date**: 2026-09-10

All endpoints are under `/api` and require authentication (session cookie or API key). Admin-only routes require `user.role === "admin"`.

## Templates

### POST /api/templates
Create a template manually. Admin-only.

**Request**:
```json
{
  "tags": ["minecraft", "java"],
  "name": "Paper MC",
  "description": "High-performance Minecraft server",
  "author": "admin",
  "version": "1.0.0",
  "image": "ghcr.io/papermc/paper:latest",
  "startupCommand": "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
  "stopSignal": "^C",
  "environment": { "SERVER_MEMORY": "1024" },
  "portMappings": [
    { "hostPort": 25565, "containerPort": 25565, "protocol": "tcp" }
  ],
  "resourceLimits": { "memoryMb": 1024, "cpuLimit": 1.0, "pidsLimit": 512 },
  "resourceLimitsRange": {
    "memoryMb": { "min": 512, "max": 4096, "recommended": 1024 },
    "cpuLimit": { "min": 0.5, "max": 4.0, "recommended": 1.0 },
    "pidsLimit": { "min": 128, "max": 1024, "recommended": 512 }
  },
  "variables": []
}
```

**Response** (201): Created template object with `active: false`, `customized: false`.

### GET /api/templates
List templates. Admin sees all; users see only active.

**Query params**: `tag` (filter by tag), `active` (filter by active state).

**Response** (200):
```json
{
  "templates": [
    {
      "id": "uuid",
      "tags": ["minecraft", "java"],
      "name": "Paper MC",
      "description": "...",
      "version": "1.0.0",
      "image": "ghcr.io/papermc/paper:latest",
      "active": true,
      "customized": false
    }
  ]
}
```

### GET /api/templates/:id
Get a template with its variables. Admin sees any; user sees only active.

**Response** (200): Full template object including `variables` array.

### PATCH /api/templates/:id
Edit a template. Admin-only. Sets `customized: true` if the template has a `registryId`.

**Request**: Partial template fields (same shape as POST, all optional).

**Response** (200): Updated template object.

### DELETE /api/templates/:id
Delete a template. Admin-only.

**Errors**: 409 if servers use this template (R9).

### POST /api/templates/:id/activate
Activate a template. Admin-only.

**Response** (200): `{ "id": "uuid", "active": true }`

### POST /api/templates/:id/deactivate
Deactivate a template. Admin-only.

**Response** (200): `{ "id": "uuid", "active": false }`

### POST /api/templates/:id/reset
Reset a customized template to the upstream registry version. Admin-only.

**Response** (200): Updated template object with `customized: false`.

**Errors**: 400 if template has no `registryId` or `sourceId`.

### GET /api/templates/:id/export
Export a template as YAML. Admin-only.

**Response** (200): `Content-Type: application/x-yaml`, body is the YAML file.

### POST /api/templates/import
Import a PTDL_v2 egg (JSON) or native YAML template. Admin-only.

**Request** (`multipart/form-data`):
- `file`: the template file (JSON or YAML)
- `tags`: comma-separated tag string (e.g., `"minecraft,java"`); optional
- `conflict`: `"overwrite"` or `"skip"` (default: `"skip"`)

**Response** (201):
```json
{
  "template": { "id": "uuid", "name": "Paper MC", ... },
  "skippedFields": ["scripts.installation", "config.files", "file_denylist", "features"]
}
```

**Errors**: 400 if file is invalid, 409 if name exists and conflict is "skip".

## Variables

Variables are managed as part of the template (included in template create/edit requests). There are no separate variable endpoints — variables are nested in the template object.

## Registries

### GET /api/registries
List configured registries. Admin-only.

**Response** (200):
```json
{
  "registries": [
    {
      "id": "uuid",
      "url": "https://raw.githubusercontent.com/sigilpanel/templates/main",
      "name": "Official",
      "authMethod": "none",
      "hasCredentials": false,
      "status": "ok",
      "lastCheckedAt": "2026-09-10T...",
      "isOfficial": true
    }
  ]
}
```

Note: `token`, `username`, `password` are NEVER returned. Only `hasCredentials` (boolean).

### POST /api/registries
Add a registry. Admin-only.

**Request**:
```json
{
  "url": "https://raw.githubusercontent.com/community/templates/main",
  "name": "Community",
  "authMethod": "token",
  "token": "ghp_xxxxxxxx"
}
```

**Response** (201): Registry object (without credentials).

### PATCH /api/registries/:id
Edit a registry. Admin-only.

**Request**: Partial registry fields. Credentials can be updated but never returned.

### DELETE /api/registries/:id
Remove a registry. Admin-only. Templates installed from this registry remain in the DB (their `registryId` is set to NULL).

### POST /api/registries/:id/check
Manually trigger a registry check. Admin-only.

**Response** (200):
```json
{
  "id": "uuid",
  "status": "ok",
  "availableTemplates": [
    { "sourceId": "rust", "name": "Rust", "version": "1.0.0", "installed": false }
  ]
}
```

### GET /api/registries/:id/available
List available templates from a registry (not yet installed). Admin-only.

**Response** (200):
```json
{
  "templates": [
    {
      "sourceId": "rust",
      "name": "Rust",
      "description": "Rust dedicated server",
      "tags": ["rust"],
      "author": "Community",
      "version": "1.0.0",
      "sha256": "abc123...",
      "installed": false
    }
  ]
}
```

### POST /api/registries/:id/install
Install a template from the registry. Admin-only.

**Request**:
```json
{
  "sourceId": "rust"
}
```

**Response** (201): Created template object with `active: false`, `customized: false`.

## SSE Events

New SSE event types added to `SSEEventTypeSchema`:

### template.update_available
Emitted when the background checker detects a template update from a registry. Admin-only.

```json
{
  "type": "template.update_available",
  "payload": {
    "templateId": "uuid",
    "templateName": "Paper MC",
    "registryName": "Official",
    "sourceId": "paper-mc",
    "oldVersion": "1.0.0",
    "newVersion": "1.1.0",
    "changes": [
      { "type": "added", "description": "EULA acceptance variable" },
      { "type": "changed", "description": "Updated to Paper 1.21" },
      { "type": "fixed", "description": "Memory limit not applied on restart" }
    ],
    "customized": false
  },
  "timestamp": "2026-09-10T..."
}
```

### template.update_applied
Emitted when the admin applies a template update.

```json
{
  "type": "template.update_applied",
  "payload": {
    "templateId": "uuid",
    "templateName": "Paper MC",
    "newVersion": "1.1.0"
  },
  "timestamp": "2026-09-10T..."
}
```

### template.create / template.update / template.delete
Emitted on template CRUD operations. Follows the existing pattern of `node.create`, `node.update`, `node.delete`.

```json
{
  "type": "template.create",
  "payload": { "id": "uuid", "name": "Paper MC", "tags": ["minecraft", "java"], "active": false },
  "timestamp": "2026-09-10T..."
}
```

## Registry Index Format (External Contract)

The registry repo must contain an `index.yaml` at the root:

```yaml
templates:
  - id: paper-mc
    name: "Paper MC"
    description: "High-performance Minecraft server"
    tags:
      - minecraft
      - java
    author: SigilPanel
    version: "1.1.0"
    file: minecraft/paper-mc.yaml
    sha256: "def456..."
```

The index is lean — only metadata for change detection (`sha256`) and file location (`file`). Changelog lives inside each template YAML file.

Each template file is a YAML file at the path specified by `file` relative to the repo root:

```yaml
# minecraft/paper-mc.yaml
name: "Paper MC"
description: "High-performance Minecraft server"
author: SigilPanel
version: "1.0.0"
tags:
  - minecraft
  - java
image: "ghcr.io/papermc/paper:latest"
startupCommand: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
stopSignal: "^C"
environment:
  SERVER_MEMORY: "1024"
portMappings:
  - hostPort: 25565
    containerPort: 25565
    protocol: tcp
resourceLimits:
  memoryMb: 1024
  cpuLimit: 1.0
  pidsLimit: 512
resourceLimitsRange:
  memoryMb:
    min: 512
    max: 4096
    recommended: 1024
  cpuLimit:
    min: 0.5
    max: 4.0
    recommended: 1.0
  pidsLimit:
    min: 128
    max: 1024
    recommended: 512
changelog:
  - version: "1.1.0"
    date: "2026-09-10"
    changes:
      - type: added
        description: "EULA acceptance variable"
      - type: changed
        description: "Updated to Paper 1.21"
      - type: fixed
        description: "Memory limit not applied on restart"
  - version: "1.0.0"
    date: "2026-08-01"
    changes:
      - type: added
        description: "Initial release"
variables:
  - name: "Server Jar File"
    envVar: "SERVER_JARFILE"
    dataType: "string"
    defaultValue: "paper.jar"
    required: true
    visibility: "editable"
    sortOrder: 0
  - name: "Max Players"
    envVar: "MAX_PLAYERS"
    dataType: "integer"
    defaultValue: "20"
    required: true
    min: 1
    max: 100
    visibility: "editable"
    sortOrder: 1
```
