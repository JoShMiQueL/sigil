# Implementation Plan: Templates & Tags

**Branch**: `005-templates-groups` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-templates-groups/spec.md`

## Summary

R8 implements the template catalog system for SigilPanel: templates with inline tags (no separate group entity), variables, registry management with multiple sources (official + community + private), PTDL_v2 egg import with field conversion, YAML export, background update detection with SSE notifications, and template activation/deactivation for user visibility control. Templates are stored in PostgreSQL, use YAML as the native file format, and are distributed via git repos served over HTTP. The official registry is pre-seeded on fresh deployments. Tags are free-form strings on each template (`tags: string[]`); the source of truth for registry-installed templates is the registry index entry's `tags` field, while locally created templates have user-defined tags. The panel filters by tag instead of by group.

## Technical Context

**Language/Version**: TypeScript 7.0 (API + panel), Go 1.27 (daemon — not modified in R8)

**Primary Dependencies**: Hono 4.13 (API), React 19.2 + Vite 8 (panel), Drizzle ORM 0.45 (DB), Zod 4.5 (validation), `Bun.YAML` (built-in YAML parsing/serialization), `Bun.cron` (built-in cron scheduler)

**Storage**: PostgreSQL 18 (templates, variables, registries tables — templates includes `tags text[]` column), Redis 8 (SSE pub/sub — existing)

**Testing**: Vitest 5 (unit/integration under Bun), Testcontainers 12 (PostgreSQL integration), Playwright 1.62 (E2E)

**Target Platform**: Linux server (API + panel), any modern browser (UI)

**Project Type**: Web service (API) + web application (panel)

**Performance Goals**: Template list renders <200ms for 500 templates. Registry index fetch <5s. Import <10s per egg.

**Constraints**: No polling for state (SSE only). Credentials redacted in logs and API responses. No Docker imports in panel. No DB imports in daemon.

**Scale/Scope**: 500+ templates, 10+ registries. 7 user stories, 34 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Control Plane / Execution Plane Separation — PASS

R8 is entirely panel-side (API + DB + UI). The daemon is not modified. Templates are stored in PostgreSQL (panel's domain). The daemon receives rendered server configuration from templates in R9, not in R8. No Docker imports in the panel, no DB imports in the daemon.

### Principle II: Shared Contracts as Source of Truth — PASS

All template, variable, and registry data shapes are defined as Zod schemas in `packages/shared/src/template/`. Both API and panel import from shared. The PTDL_v2 import schema and registry index schema also live in shared. See [contracts/shared-schemas.md](./contracts/shared-schemas.md).

### Principle III: Security-First Container Isolation — PASS

- Registry credentials (token, username, password) are stored in DB, never returned in API responses, redacted in logs.
- PTDL_v2 import validates all fields with Zod before creating templates — no untrusted data enters the DB unvalidated.
- Template startup commands use `{{VARIABLE}}` placeholders, not string concatenation — Constitution rule 2 (no shell injection).
- File denylist from PTDL_v2 is dropped — the jail (R6) handles filesystem security.
- No install scripts are executed in R8 — deferred fields are silently ignored.

### Principle IV: Test Against Real Infrastructure — PASS

- Unit tests: PTDL_v2 rules parsing, variable validation, YAML serialization, registry index parsing.
- Integration tests: Template/variable/registry CRUD against Testcontainers PostgreSQL.
- MCP verification: Full UI flows (create template with tags, activate, import egg, export, registry management, tag filtering).
- E2E tests: Playwright regression for critical flows.
- Test isolation: Each test creates its own data and cleans up. No test depends on another.

### Principle V: Spec-Driven Development — PASS

This plan follows the spec at `specs/005-templates-groups/spec.md`. Research, data model, contracts, and quickstart are generated before implementation.

### Principle VI: Real-time Protocol Selection — PASS

- HTTP for all CRUD actions (templates, registries, import, export).
- SSE for template CRUD notifications and template update availability notifications.
- No polling. The background checker runs server-side and pushes via SSE.
- No WebSocket needed in R8 (no console, no SFTP).

### Post-Design Re-check — PASS

All principles hold after data model and contract design. No violations found.

## Project Structure

### Documentation (this feature)

```text
specs/005-templates-groups/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── api.md           # API endpoint contracts
│   └── shared-schemas.md # Zod schemas in packages/shared
└── tasks.md             # Phase 2 output (speckit-tasks — not created yet)
```

### Source Code (repository root)

```text
packages/shared/src/template/
├── variable.ts          # VariableSchema, VariableDataTypeSchema, VariableVisibilitySchema
├── changelog.ts         # ChangelogSchema, ChangelogEntrySchema, ChangeSchema, ChangeTypeSchema
├── template.ts          # TemplateSchema, TemplateCreateSchema, TemplateUpdateSchema, TemplateYAMLSchema, ResourceLimitsRangeSchema (includes changelog + tags)
├── registry.ts          # RegistrySchema, RegistryIndexSchema, RegistryAuthMethodSchema
├── ptdlv2.ts            # PTDLv2EggSchema, PTDLv2VariableSchema
└── index.ts             # re-export all

packages/shared/src/sse/
└── events.ts            # Updated: new SSE event types and payloads

packages/db/src/schema/
├── templates.ts         # templates table (includes tags text[] column with GIN index)
├── variables.ts         # variables table
└── registries.ts        # registries table

apps/api/src/routes/
├── templates.ts         # Template CRUD, activate/deactivate, import/export, reset
└── registries.ts        # Registry CRUD, available, install, check

apps/api/src/services/
├── template.service.ts       # Template business logic (includes tag filtering)
├── template-import.service.ts # PTDL_v2 import + conversion
├── template-export.service.ts # YAML export
├── registry.service.ts       # Registry CRUD + fetch
├── registry-checker.service.ts # Background update checker
└── template-seed.service.ts  # Official template seeding on first boot

apps/api/src/lib/
└── ptdlv2-converter.ts  # PTDL_v2 rules parsing + field conversion

apps/panel/src/
├── routes/
│   ├── templates.tsx    # Template management page (admin) — includes tag filter
│   └── registries.tsx  # Registry management page (admin)
├── components/
│   ├── templates/
│   │   ├── template-form.tsx
│   │   ├── tag-input.tsx
│   │   ├── variable-editor.tsx
│   │   ├── template-list.tsx
│   │   ├── changelog-view.tsx
│   │   ├── import-dialog.tsx
│   │   └── export-button.tsx
│   └── registries/
│       ├── registry-form.tsx
│       └── available-templates.tsx
└── hooks/
    ├── use-templates.ts
    └── use-registries.ts

apps/panel/tests/e2e/
├── templates-crud.spec.ts
├── template-import-export.spec.ts
└── registry-management.spec.ts

templates/                         # Official templates (in monorepo, not separate repo)
├── index.yaml                     # Registry index manifest (entries have tags: string[])
├── minecraft/
│   ├── paper-mc.yaml
│   └── vanilla-mc.yaml
├── source-engine/
│   └── csgo.yaml
└── rust/
    └── rust.yaml
```

**Structure Decision**: Monorepo with changes in `packages/shared` (schemas), `packages/db` (tables + migration), `apps/api` (routes + services), `apps/panel` (UI + E2E), and `templates/` (official template YAML files). The daemon (`apps/daemon`) is not modified in R8. No new dependencies — uses built-in `Bun.YAML` for parsing/serialization and `Bun.cron` for the background update checker. CI path filters ensure changes to `templates/` only trigger template-related validation, not the full API/panel/daemon pipeline.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
