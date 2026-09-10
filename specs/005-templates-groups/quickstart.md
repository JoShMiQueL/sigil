# Quickstart: Templates & Tags

**Feature**: 005-templates-groups (R8)
**Date**: 2026-09-10

## Prerequisites

- Docker running (for Testcontainers and dev services)
- Bun 1.4+
- Go 1.27+ (for daemon, not needed for R8 API/panel tests)

## Setup

```bash
bun dev:services          # PostgreSQL + Redis
bun --filter @sigil/db db:generate
bun --filter @sigil/db db:migrate
bun --filter @sigil/api db:seed
bun dev                   # API on :3000, panel on :5173
```

## Validation Scenarios

### Scenario 1: Tagging Templates Inline (US1)

> **Note**: The original R8 design had a "Group CRUD" scenario here. Groups were replaced by inline tags after implementation — there is no groups API or UI. Tags are set directly on each template.

```bash
# Create a template with tags (tags are set inline on the template)
curl -s -X POST http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["minecraft", "java"],
    "name": "Paper MC",
    "image": "ghcr.io/papermc/paper:latest",
    "startupCommand": "java -jar paper.jar nogui",
    "stopSignal": "^C",
    "portMappings": [{"hostPort": 25565, "containerPort": 25565, "protocol": "tcp"}],
    "resourceLimits": {"memoryMb": 1024, "cpuLimit": 1.0, "pidsLimit": 512},
    "variables": []
  }'

# List templates filtered by tag
curl -s "http://localhost:3000/api/templates?tag=minecraft" \
  -H "Cookie: sigil_session=<admin-session>"

# Edit the template's tags (remove "java")
curl -s -X PATCH http://localhost:3000/api/templates/<id> \
  -H "Cookie: sigil_session=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["minecraft"]}'

# Verify the template no longer appears under the "java" filter
curl -s "http://localhost:3000/api/templates?tag=java" \
  -H "Cookie: sigil_session=<admin-session>"
```

**Expected**: Template created with tags `["minecraft", "java"]`, appears under both tag filters. After editing tags to `["minecraft"]`, it no longer appears under the "java" filter.

### Scenario 2: Template CRUD + Variables (US2, US3, US4)

```bash
# Create template with variables and tags
curl -s -X POST http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["minecraft", "java"],
    "name": "Paper MC",
    "image": "ghcr.io/papermc/paper:latest",
    "startupCommand": "java -jar paper.jar nogui",
    "stopSignal": "^C",
    "portMappings": [{"hostPort": 25565, "containerPort": 25565, "protocol": "tcp"}],
    "resourceLimits": {"memoryMb": 1024, "cpuLimit": 1.0, "pidsLimit": 512},
    "variables": [
      {
        "name": "Max Players",
        "envVar": "MAX_PLAYERS",
        "dataType": "integer",
        "defaultValue": "20",
        "required": true,
        "minValue": 1,
        "maxValue": 100,
        "visibility": "editable",
        "sortOrder": 0
      }
    ]
  }'

# List templates
curl -s http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<admin-session>"

# Activate template
curl -s -X POST http://localhost:3000/api/templates/<id>/activate \
  -H "Cookie: sigil_session=<admin-session>"

# Verify user can see it (user session)
curl -s http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<user-session>"

# Deactivate
curl -s -X POST http://localhost:3000/api/templates/<id>/deactivate \
  -H "Cookie: sigil_session=<admin-session>"

# Verify user no longer sees it
curl -s http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<user-session>"
```

**Expected**: Template created inactive, activated, visible to users, deactivated, hidden from users.

### Scenario 3: PTDL_v2 Import (US5)

```bash
# Import a PTDL_v2 egg with tags (comma-separated string in form data)
curl -s -X POST http://localhost:3000/api/templates/import \
  -H "Cookie: sigil_session=<admin-session>" \
  -F "file=@paper-egg.json" \
  -F "tags=minecraft,java" \
  -F "conflict=skip"

# Verify template was created with converted variables
curl -s http://localhost:3000/api/templates/<id> \
  -H "Cookie: sigil_session=<admin-session>"
```

**Expected**: Template created from egg, `skippedFields` includes `scripts.installation`, `config.files`, `file_denylist`, `features`. Variables have structured validation (not Laravel rules strings).

### Scenario 4: Export (US6)

```bash
# Export template as YAML
curl -s http://localhost:3000/api/templates/<id>/export \
  -H "Cookie: sigil_session=<admin-session>" \
  -o paper-mc.yaml

# Import the exported YAML with new tags
curl -s -X POST http://localhost:3000/api/templates/import \
  -H "Cookie: sigil_session=<admin-session>" \
  -F "file=@paper-mc.yaml" \
  -F "tags=minecraft,backup" \
  -F "conflict=skip"
```

**Expected**: YAML file downloaded, re-imported template matches original in all fields.

### Scenario 5: Registry Management (US2, US7)

```bash
# List registries (official should be pre-configured)
curl -s http://localhost:3000/api/registries \
  -H "Cookie: sigil_session=<admin-session>"

# Add a community registry
curl -s -X POST http://localhost:3000/api/registries \
  -H "Cookie: sigil_session=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://raw.githubusercontent.com/community/templates/main",
    "name": "Community",
    "authMethod": "none"
  }'

# List available templates from the community registry
curl -s http://localhost:3000/api/registries/<id>/available \
  -H "Cookie: sigil_session=<admin-session>"

# Install a template from the registry
curl -s -X POST http://localhost:3000/api/registries/<id>/install \
  -H "Cookie: sigil_session=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"sourceId": "rust"}'

# Verify installed template is inactive
curl -s http://localhost:3000/api/templates \
  -H "Cookie: sigil_session=<admin-session>"
```

**Expected**: Official registry pre-configured, community registry added, available templates listed, template installed as inactive.

### Scenario 6: MCP Browser Verification

1. Login to panel at `http://localhost:5173` as admin
2. Navigate to Templates section
3. Create a template "Paper MC" through the UI with tags `["minecraft", "java"]` and a variable
4. Activate the template — verify it shows as active
5. Verify the template appears in the user-facing template list (switch to user view or check via SSE)
6. Use the tag filter to narrow the list to "minecraft" — verify only tagged templates show
7. Deactivate the template — verify it disappears from user view
8. Import a PTDL_v2 egg file with tags — verify the import dialog shows skipped fields
9. Export a template — verify a YAML file downloads
10. Navigate to Registries section — verify official registry is listed
11. Add a community registry — verify available templates appear
12. Install a template from the registry — verify it appears as inactive in Installed templates with tags inherited from the registry index

**Expected**: All UI flows work without page reloads. SSE updates reflect template changes in real-time. Tag filtering narrows the list correctly.

### Scenario 7: Background Update Detection (US7)

1. Configure the panel to point to a test registry
2. Note the current state of an installed template (version, sha256)
3. Update the template YAML in the test registry — bump version, add a changelog entry with typed changes
4. Wait for the next background check cycle (or trigger manually via `POST /api/registries/:id/check`)
5. Verify the admin receives an SSE notification `template.update_available` with old version, new version, and structured changes array
6. Open the notification — verify changes render with colored badges (added=green, changed=blue, fixed=purple)
7. Apply the update — verify the template reflects the new version and changelog
8. Open the template detail — verify the full changelog history is visible with all version entries
9. Customize a template, then update the registry again — verify the notification shows but does not overwrite
10. Reset to upstream — verify local changes are discarded

**Expected**: SSE notification received with structured changelog, badges render correctly, update applied, full history visible, customized templates protected, reset works.

## Test Commands

```bash
bun run check        # Biome lint + format
bun run typecheck    # TypeScript type checking
bun run test         # Unit + integration tests
bun run test:e2e     # E2E tests (after MCP verification)
make ci              # Full CI: lint + typecheck + test + e2e (same as GitHub Actions)
```
