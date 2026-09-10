# Data Model: Templates & Groups

**Feature**: 005-templates-groups (R8)
**Date**: 2026-09-10

## Entities

### Group

Template category (e.g., "Minecraft", "Source Engine").

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| name | text | NOT NULL, UNIQUE | Unique across panel |
| description | text | nullable | |
| icon | text | nullable | Icon identifier or URL |
| createdAt | timestamp | NOT NULL, default now() | |
| updatedAt | timestamp | NOT NULL, default now() | |

**Relationships**:
- Has many `Template` (templates.groupId → groups.id, onDelete: restrict)

### Template

Blueprint for creating game servers.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| groupId | UUID | NOT NULL, FK → groups.id | onDelete: restrict |
| registryId | UUID | nullable, FK → registries.id | NULL for locally created or detached templates |
| sourceId | text | nullable | Stable ID from the registry (for update tracking) |
| sourceHash | text | nullable | SHA-256 of the template content from the registry |
| name | text | NOT NULL | Unique within group |
| description | text | nullable | |
| author | text | nullable | Attribution |
| version | text | NOT NULL, default "1.0.0" | Template version (not format version) |
| image | text | NOT NULL | Docker image (e.g., `ghcr.io/papermc/paper:latest`) |
| startupCommand | text | NOT NULL | Command with `{{VARIABLE}}` placeholders |
| stopSignal | text | NOT NULL, default "^C" | e.g., "SIGTERM", "^C" |
| environment | jsonb | NOT NULL, default {} | Key-value env vars (static, not user-editable) |
| portMappings | jsonb | NOT NULL, default [] | Array of PortMapping |
| resourceLimits | jsonb | NOT NULL | ResourceLimits defaults (memoryMb, cpuLimit, pidsLimit) |
| resourceLimitsRange | jsonb | nullable | ResourceLimitsRange (min/max/recommended per resource). If null, user cannot override defaults (R9 enforces). |
| changelog | jsonb | NOT NULL, default [] | Array of ChangelogEntry: {version, date, changes: [{type, description}]}. Full history persisted at install/update time. |
| active | boolean | NOT NULL, default false | If true, users see it in server creation |
| customized | boolean | NOT NULL, default false | If true, registry updates notify but don't overwrite |
| createdAt | timestamp | NOT NULL, default now() | |
| updatedAt | timestamp | NOT NULL, default now() | |

**Relationships**:
- Belongs to `Group`
- Belongs to `Registry` (optional)
- Has many `Variable` (variables.templateId → templates.id, onDelete: cascade)
- Has many `Server` (via R9, not created in R8)

**Unique constraint**: (groupId, name) — template names unique within a group.

**State transitions**:

```
                    install from registry
                    ┌─────────────────────┐
                    │                     ▼
              ┌──────────┐         ┌──────────┐
              │  (none)  │         │ inactive │
              └──────────┘         └──────────┘
                    create locally          │       │
                    ┌─────────────────────┐ │       │ activate
                    │                     ▼ │       │
                    │              ┌──────────┐ ◄───┘
                    │              │  active   │
                    │              └──────────┘
                    │                    │
                    │              deactivate
                    │                    ▼
                    │              ┌──────────┐
                    └─────────────▶│ inactive │
                                   └──────────┘
                                        │
                                   delete (if no servers)
                                        │
                                        ▼
                                   ┌──────────┐
                                   │  (none)  │
                                   └──────────┘
```

### Variable

Editable parameter exposed when creating a server from a template.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| templateId | UUID | NOT NULL, FK → templates.id | onDelete: cascade |
| name | text | NOT NULL | Display name (e.g., "Max Players") |
| envVar | text | NOT NULL | Environment variable name (e.g., "MAX_PLAYERS") |
| dataType | text | NOT NULL | Enum: "string", "integer", "boolean", "select" |
| defaultValue | text | NOT NULL | Stored as string, coerced on use |
| required | boolean | NOT NULL, default false | |
| minValue | integer | nullable | For integer type |
| maxValue | integer | nullable | For integer type |
| minLength | integer | nullable | For string type |
| maxLength | integer | nullable | For string type |
| regexPattern | text | nullable | For string type |
| allowedValues | jsonb | nullable | Array of strings, for select type |
| visibility | text | NOT NULL, default "editable" | Enum: "hidden", "viewable", "editable" |
| sortOrder | integer | NOT NULL, default 0 | Display order |

**Relationships**:
- Belongs to `Template`

**Unique constraint**: (templateId, envVar) — no duplicate env vars within a template.

### Registry

Git repository served via HTTP containing template files.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| url | text | NOT NULL, UNIQUE | Base URL (e.g., `https://raw.githubusercontent.com/sigilpanel/templates/main`) |
| name | text | NOT NULL | Display name (e.g., "Official", "Community", "Private") |
| authMethod | text | NOT NULL, default "none" | Enum: "none", "token", "basic" |
| token | text | nullable | For token auth (redacted in API responses and logs) |
| username | text | nullable | For basic auth |
| password | text | nullable | For basic auth (redacted) |
| status | text | NOT NULL, default "unknown" | Enum: "ok", "auth_failed", "unreachable", "unknown" |
| lastCheckedAt | timestamp | nullable | |
| isOfficial | boolean | NOT NULL, default false | True for the default SigilPanel registry |
| createdAt | timestamp | NOT NULL, default now() | |
| updatedAt | timestamp | NOT NULL, default now() | |

**Relationships**:
- Has many `Template` (templates.registryId → registries.id, onDelete: set null)

## Existing Entities (referenced, not modified in R8)

### Server (R9, not created in R8)

The `servers` table will be created in R9. R8 does not create it. The template-to-server relationship is:
- `servers.templateId` → `templates.id` (FK, onDelete: restrict — can't delete a template with servers)

This FK is added in R9 when the servers table is created.

## ER Diagram

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Registry │       │  Group   │       │ Template │
│──────────│       │──────────│       │──────────│
│ id       │       │ id       │       │ id       │
│ url      │       │ name     │       │ groupId ─┼──FK──▶ Group.id
│ name     │       │ desc     │       │ registryId┼─FK──▶ Registry.id (nullable)
│ authMethod│      │ icon     │       │ sourceId │
│ token    │       │ createdAt│       │ sourceHash│
│ username │       │ updatedAt│       │ name     │
│ password │       └──────────┘       │ desc     │
│ status   │              │            │ author   │
│ isOfficial│             │            │ version  │
│ lastChecked│            │            │ image    │
└──────────┘              │            │ startup  │
       │                  │            │ stopSig  │
       │                  │ FK         │ env      │
       │                  │            │ ports    │
       │                  └──────────▶ │ resources│
       │                               │ active   │
       │                               │ customized│
       │                               │ createdAt│
       │                               │ updatedAt│
       │                               └──────────┘
       │                                     │
       │                            FK       │
       │                                     ▼
       │                               ┌──────────┐
       │                               │ Variable │
       │                               │──────────│
       │                               │ id       │
       │                               │ templateId┼─FK──▶ Template.id
       │                               │ name     │
       │                               │ envVar   │
       │                               │ dataType │
       │                               │ default  │
       │                               │ required │
       │                               │ min/max  │
       │                               │ regex    │
       │                               │ allowed  │
       │                               │ visibility│
       │                               │ sortOrder│
       │                               └──────────┘
       │
       │ (R9 will add)
       │                               ┌──────────┐
       └───────────────────────────────│ Server   │ (R9)
                                       │ templateId┼─FK──▶ Template.id
                                       └──────────┘
```

## Drizzle Schema Files

New files in `packages/db/src/schema/`:
- `groups.ts` — groups table
- `templates.ts` — templates table
- `variables.ts` — variables table
- `registries.ts` — registries table

Update `packages/db/src/schema/index.ts` to export all four.

## Migration

A single Drizzle migration creates all four tables with proper FK constraints and unique indexes.
