# Research: Templates & Tags

**Feature**: 005-templates-groups (R8)
**Date**: 2026-09-10

> **Groups → Tags Refactor (post-implementation)**: The original R8 research and design assumed database-backed template **groups** — a `groups` table with full CRUD, a dedicated admin UI, and a `groupId` foreign key on templates. After implementation, this was refactored to a **tags** model. The decision and its rationale are recorded below so the historical design context is preserved alongside the current model.
>
> **What changed**:
> - Templates now carry a `tags: string[]` column (`text[] NOT NULL DEFAULT '{}'` with a GIN index) instead of a `groupId` FK.
> - There is no `groups` table, no groups API (`/api/groups`), and no groups UI page.
> - Tags are managed **inline** on each template (the admin edits the template's tag list directly in the template form).
> - A template can have **multiple** tags (e.g., `["minecraft", "java"]`), whereas a group was a single membership.
> - The **source of truth** for tags on registry-installed templates is registry metadata: the registry index entry changed from `group: string` to `tags: string[]`. Locally created templates have user-defined tags.
> - The panel **filters by tag** (`GET /api/templates?tag=minecraft`) instead of by group.
> - Template name uniqueness is now enforced **across the panel** (previously unique within a group).
>
> **Why tags over groups**: Groups required a separate CRUD surface (table, API, UI, hook, form, navigation) purely to act as a categorization label. Tags provide the same categorization with far less machinery — no extra entity, no "cannot delete a non-empty group" constraint, no reassignment workflow, and a template can belong to multiple categories at once (a group forced single membership). Filtering by tag via a GIN index is as fast as filtering by a FK. The registry index contract becomes richer (multiple tags) without adding complexity. The net effect is a simpler data model, simpler API, and simpler UI while strictly increasing expressiveness.
>
> **Impact on the research below**: R3 (registry index format) and R6 (seeding) originally referenced a `group` field; those references are updated to `tags` to reflect the current contract. The rest of the research (PTDL_v2 mapping, YAML parsing, registry fetch, background checker, credential storage, resource limits range, changelog format) is unaffected by the refactor.

## R1: PTDL_v2 Field Mapping to SigilPanel Native Format

### Decision

SigilPanel uses its own native template format (YAML). PTDL_v2 eggs (JSON) are imported and converted. The mapping is:

| PTDL_v2 Field | SigilPanel Field | Transformation |
|--------------|-----------------|----------------|
| `name` | `name` | Direct |
| `description` | `description` | Direct |
| `author` (email) | `author` | Direct (kept for attribution) |
| `startup` | `startupCommand` | Direct |
| `docker_images` (map label→image) | `image` | Take first value (or default-labeled entry). Multi-image selection deferred. |
| `config.stop` | `stopSignal` | Direct (string, e.g., "^C" or "SIGTERM") |
| `variables[].name` | `variables[].name` | Direct |
| `variables[].description` | `variables[].displayLabel` | Direct |
| `variables[].env_variable` | `variables[].envVar` | Direct |
| `variables[].default_value` | `variables[].defaultValue` | Direct |
| `variables[].rules` (Laravel string) | `variables[].type` + structured validation | Parse pipe-delimited rules |
| `variables[].field_type` ("text") | `variables[].dataType` (string/int/bool/select) | Infer from rules |
| `variables[].user_viewable` + `user_editable` | `variables[].visibility` | See mapping below |
| `meta.update_url` | — | Dropped (SigilPanel uses registry) |
| `file_denylist` | — | Dropped (jail handles this, R6) |
| `features` | — | Dropped (Pterodactyl-specific) |
| `scripts.installation` | — | Deferred (not in R8 scope) |
| `config.files` | — | Deferred (config file parsers, not in R8) |
| `config.startup` | — | Deferred |
| `config.logs` | — | Deferred |

### Rules parsing

PTDL_v2 `rules` is a pipe-delimited Laravel validation string, e.g., `required|integer|min:1|max:100`.

Parsing algorithm:
1. Split by `|`
2. Map known rules:
   - `required` → `required: true`
   - `string` → `dataType: "string"`
   - `integer` → `dataType: "integer"`
   - `boolean` → `dataType: "boolean"`
   - `min:N` → `min: N` (for integer) or `minLength: N` (for string)
   - `max:N` → `max: N` (for integer) or `maxLength: N` (for string)
   - `regex:PATTERN` → `regex: PATTERN`
   - `in:val1,val2,val3` → `dataType: "select"`, `allowedValues: ["val1", "val2", "val3"]`
3. If no `required` rule → `required: false`
4. If no type rule → default `dataType: "string"`

### Visibility mapping

| `user_viewable` | `user_editable` | `visibility` |
|-----------------|----------------|-------------|
| true | true | `editable` |
| true | false | `viewable` |
| false | * | `hidden` |

### Rationale

SigilPanel modernizes PTDL_v2 by replacing Laravel-style validation strings with structured validation that Zod can validate natively. The `visibility` enum replaces two booleans with a single, clearer field. Deferred fields (install scripts, config parsers) are silently ignored — they are out of scope for R8 and will be considered in future roadmap items.

### Alternatives considered

- **Keep PTDL_v2 as-is**: Rejected — Laravel rules strings are fragile, `field_type` is always "text", two booleans for visibility is confusing.
- **Support PTDL_v1**: Rejected — legacy format, not worth the complexity. Pterodactyl itself converts v1 to v2.

## R2: YAML Parsing in the API (Bun runtime)

### Decision

Use Bun's built-in `Bun.YAML.parse()` and `Bun.YAML.stringify()` APIs. No external dependency needed.

### Rationale

- Bun has native YAML support since Bun 1.2 (`Bun.YAML` namespace).
- Parser is written in Rust, passes 90%+ of the official YAML test suite.
- Supports YAML 1.2: scalars, collections, anchors/aliases, tags, multi-line strings (`|`, `>`), comments, directives.
- `Bun.YAML.parse(yamlString)` → JavaScript object. `Bun.YAML.stringify(obj, space)` → YAML string.
- Zod validates the parsed object — the format (YAML vs JSON) is irrelevant to validation.
- Also supports `import config from "./config.yaml"` natively, useful for loading template files.

### Alternatives considered

- **`yaml` npm package**: Rejected — unnecessary, Bun has native support. Adds a dependency for no benefit.
- **js-yaml**: Rejected — older, less maintained, doesn't support YAML 1.2 fully.

## R3: Registry Index Format and Template Storage

### Decision

Official templates live in the monorepo's `templates/` directory (already in the project structure). No separate repository needed. The directory contains an `index.yaml` manifest and per-template YAML files:

```
templates/
├── index.yaml              # Manifest of all official templates
├── minecraft/
│   ├── paper-mc.yaml
│   └── vanilla-mc.yaml
├── source-engine/
│   └── csgo.yaml
└── rust/
    └── rust.yaml
```

`templates/index.yaml`:
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

The index is lean — only metadata needed to detect changes (`sha256`) and locate the template file (`file`). Changelog lives inside each template YAML file (see R8).

CI path filters ensure that changes to `templates/` only trigger template-related jobs, not the full API/panel/daemon CI pipeline. This is the standard monorepo pattern — no need for repo splitting.

### Rationale

- The monorepo already has `templates/` in its structure (per AGENTS.md).
- Keeping templates in the same repo means: atomic commits (template + API change together if needed), single PR workflow, single issue tracker, no cross-repo coordination.
- CI path filters (GitHub Actions `paths` filter or `dorny/paths-filter` action) prevent unnecessary job runs.
- The `index.yaml` + `sha256` pattern allows the panel to detect changes without downloading every file.
- Community registries remain external — the panel supports both local (monorepo) and remote registries.

### Alternatives considered

- **Separate `sigilpanel/templates` repo**: Rejected — unnecessary repo splitting. Modern monorepo CI practices (path filters, selective job execution) handle this cleanly. Atomic commits across template + code are valuable.
- **JSON index**: Rejected — YAML is the native format, consistency.
- **No index, scan directory**: Rejected — requires multiple HTTP requests, fragile.

## R4: Registry Fetch with Authentication

### Decision

The panel fetches registry files over HTTP with optional authentication:

| Auth Method | Header | Use Case |
|-------------|--------|----------|
| `none` | — | Public repos (GitHub raw, Gitea public) |
| `token` | `Authorization: Bearer <token>` | GitHub PAT, Gitea token, GitLab token |
| `basic` | `Authorization: Basic <base64(user:pass)>` | Private server with basic auth |

The panel fetches:
1. `index.yaml` at the registry URL root (e.g., `https://raw.githubusercontent.com/sigilpanel/sigilpanel/main/templates/index.yaml`)
2. Individual template files at the `file` path relative to the registry URL

For the official registry, the default URL is:
```
https://raw.githubusercontent.com/sigilpanel/sigilpanel/main/templates
```

The admin configures the full base URL. The panel appends `/index.yaml` for the index and `/<file path>` for templates.

### Rationale

- HTTP fetch is universal — works with GitHub, Gitea, GitLab, any static file server.
- Token auth covers GitHub PAT (most common for private repos).
- Basic auth covers self-hosted servers.
- No git clone — simpler, no git dependency in the panel, works with any HTTP server.

### Alternatives considered

- **git clone**: Rejected — requires git installed in the panel container, more complex, ties to git protocol.
- **GitHub API only**: Rejected — ties to GitHub. Community may use Gitea or self-hosted.

## R5: Background Update Checker

### Decision

Use Bun's built-in `Bun.cron()` API for the background update checker. The API process registers an in-process cron job that checks all configured registries periodically.

```typescript
Bun.cron("@hourly", async () => {
  // Check all registries for template updates
  await checkAllRegistries();
});
```

- Default check interval: `@hourly` (configurable via env var or admin settings).
- For each registry, fetch `index.yaml`, compare `sha256` of each template with the locally stored hash.
- If a sha256 differs, fetch the full template YAML file to extract the latest changelog entry (the entry matching the new `version` from the index).
- Emit an SSE event `template.update_available` to admin subscribers with: old version, new version, and the structured changelog entry (array of typed changes).
- If registry unreachable or auth fails, log the error and update the registry status in the DB. Do not notify the admin.
- `Bun.cron` is in-process: dies with the process, shares state (DB pools, caches) between invocations. No external cron daemon needed.
- Under `bun --hot`, cron jobs are automatically stopped and re-registered on reload.

### Rationale

- `Bun.cron` is built-in, no external dependency.
- In-process scheduling shares DB connections and module state — no cold starts.
- Cron expressions support nicknames (`@hourly`, `@daily`) and standard 5-field format.
- The check is idempotent — safe to run multiple times.
- SSE notification follows the existing pattern (Principle VI — no polling).
- Registry status is stored in the DB so the admin can see it in the registry list UI.

### Alternatives considered

- **`setInterval`**: Rejected — `Bun.cron` is purpose-built for this, supports cron expressions, and handles `--hot` reloads automatically.
- **`node-cron` / `cron` npm package**: Rejected — unnecessary, Bun has native support.
- **External cron (system crontab)**: Rejected — not portable, requires system access.
- **Redis-based scheduler**: Rejected — overkill for a single periodic task.

## R6: Template Seeding on Fresh Deploy

### Decision

On first boot (detected by checking if the `templates` table is empty), the API:
1. Creates the official registry entry in the DB, pointing to the monorepo's `templates/` directory via GitHub raw URL.
2. Fetches `templates/index.yaml` from the official registry URL.
3. Installs all templates from the official registry with `active: true`, `customized: false`.
4. Copies the `tags` array from each registry index entry onto the installed template (registry metadata is the source of truth for tags on registry-installed templates).

### Rationale

- Fresh deployments should be useful immediately — the admin sees a populated catalog.
- `active: true` for seeded templates because they are known and tested.
- Detection via empty `templates` table is simple and reliable.
- The official registry URL points to the monorepo's `templates/` directory — no separate repo to maintain.

### Alternatives considered

- **Seed from local filesystem (templates/ dir in the panel container)**: Rejected — the panel container may not have the templates directory. Fetching from the registry URL is consistent with how community registries work.
- **Manual install on first boot**: Rejected — poor UX for a fresh deployment.

## R7: Credential Storage for Private Registries

### Decision

Registry credentials (token, username/password) are stored in the `registries` table in the database. They are encrypted at rest using the same approach as node credentials (if encryption is used there) or stored as plaintext in the DB with access restricted to admin-only API routes.

Credentials are redacted in:
- All API responses (never returned to the frontend — only `hasCredentials: boolean`)
- All log output (Constitution Principle III, rule 4)

The admin can update credentials but never view them back — only see whether they are set.

### Rationale

- Following the existing pattern for node credentials in the codebase.
- Redaction in logs and API responses is a non-negotiable security rule.
- Admin-only access to registry management routes.

### Alternatives considered

- **Environment variables**: Rejected — doesn't scale to N registries, requires restart to change.
- **External secret manager**: Rejected — overkill for R8.

## R8: Resource Limits Range (Min/Max/Recommended)

### Decision

Templates define both default resource limits AND a range that constrains user overrides when creating a server (R9). The template model includes:

```yaml
resourceLimits:          # defaults applied at server creation
  memoryMb: 1024
  cpuLimit: 1.0
  pidsLimit: 512
resourceLimitsRange:     # min/max the user can adjust within (R9 enforces)
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
```

When R9 creates a server from a template, the user can adjust memory/CPU/PIDs within the range. The `recommended` value is shown as a suggestion in the UI. If the user doesn't override, the `resourceLimits` defaults are used.

### Rationale

- Templates are blueprints — they should define both sensible defaults AND safe boundaries.
- Without a range, every server from the same template gets identical resources, or the admin has no control over what users can set.
- `recommended` gives the admin a way to suggest a value without forcing it.
- R9 enforces the range at server creation time. R8 only defines it in the template.

### Alternatives considered

- **Fixed resources only (no range)**: Rejected — inflexible. Users can't adjust for their needs.
- **Range without recommended**: Rejected — the admin has no way to suggest a sensible default.
- **Per-server override without limits**: Rejected — dangerous. A user could set 0.1 CPU and crash the server, or 64GB and OOM the node.

## R9: Changelog Format and History

### Decision

Changelog lives inside each template YAML file as a structured array of version entries. The index (`index.yaml`) does NOT contain changelogs — it only has `version` and `sha256` for change detection.

Template YAML includes a `changelog` field:

```yaml
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
```

Change types follow the [Keep a Changelog](https://keepachangelog.com/) convention:
- `added` — new feature or variable
- `changed` — existing field modified
- `deprecated` — field will be removed in a future version
- `removed` — field removed in this version
- `fixed` — bug fix
- `security` — security-related fix

The panel renders each change with a colored badge:
- `added` → green
- `changed` → blue
- `deprecated` → yellow
- `removed` → red
- `fixed` → purple
- `security` → orange

When the background checker detects a sha256 change, it fetches the template YAML, finds the changelog entry matching the new `version` from the index, and sends that entry's `changes` array in the SSE notification. The admin sees the formatted diff. Clicking "view full history" shows all changelog entries stored in the DB.

The full changelog array is stored in the `templates.changelog` jsonb column when a template is installed or updated. This means the panel always has the complete history without re-fetching from the registry.

### Rationale

- **History in the template file, not the index**: The index stays lean (just sha256 for detection). The template file is the source of truth for everything including changelog.
- **Structured, not free text**: Typed changes with descriptions let the panel render formatted badges. Plain text is ugly and inconsistent.
- **Keep a Changelog convention**: Widely understood, standard types. No need to invent a custom taxonomy.
- **Stored in DB**: The panel doesn't need to re-fetch the registry to show history. The changelog is persisted at install/update time.
- **SSE includes latest entry only**: Keeps the notification payload small. Full history is available in the template detail view.

### Alternatives considered

- **Free-text changelog in index**: Rejected — bloats the index, no structure, ugly in the UI, no history (only latest).
- **Markdown changelog**: Rejected — requires a markdown renderer in the panel, inconsistent structure, harder to parse programmatically. Structured YAML with typed changes is cleaner.
- **Separate CHANGELOG.md file per template**: Rejected — extra HTTP fetch, separate file to maintain, no structured parsing. Embedding in the template YAML keeps everything in one place.
- **No changelog, rely on git log**: Rejected — git log is not accessible from the panel, not structured, includes noise (merge commits, formatting fixes).
