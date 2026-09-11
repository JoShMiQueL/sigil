# Roadmap: Sigil

Sigil is a self-hosted platform for managing game servers across multiple nodes. It is too large for a single spec cycle, so it is decomposed into independently-specifiable sub-features. Each runs through its own `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` cycle.

**Status legend**: planned · in-progress · done

| ID  | Sub-feature              | Intent                                                          | Scope boundary                                                                                          | Depends on         | Status    | Sub-spec               |
|-----|--------------------------|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|--------------------|-----------|------------------------|
| R1  | User Auth                | Login, users, roles, 2FA, API keys                              | In: auth, sessions, users, API keys. Deferred: server members, server permissions.                      | —                  | done      | specs/001-user-auth/   |
| R2  | Images                   | Dockerfiles and runtime images, build pipeline                  | In: image Dockerfiles, build, publish to registry. Deferred: template install scripts.                  | —                  | planned   | —                      |
| R3  | Setup Wizard             | First-run panel setup: create admin, configure URL/SMTP         | In: wizard UI, config persistence. Deferred: node pairing, daemon install.                             | R1                 | planned   | —                      |
| R4  | Node Management          | Register daemons, pairing tokens, regions, health check         | In: nodes, regions, pairing, heartbeat. Deferred: Docker, server lifecycle.                            | R1                 | done      | specs/002-node-management/   |
| R5  | Audit Log                | Record of all admin and user actions                             | In: audit entries, query, filter. Deferred: external SIEM.                                              | R1, R17            | planned   | —                      |
| R6  | Daemon Core              | Docker lifecycle, filesystem jail, container isolation          | In: Docker API, jails, security hardening. Deferred: SFTP, backups, file manager UI.                    | R4                 | done      | specs/004-daemon-core/   |
| R7  | Allocations              | IP/port management per node, assignment to servers              | In: allocations, ports, IP pools. Deferred: server creation.                                            | R4                 | done      | specs/006-allocations/   |
| R8  | Templates & Tags         | Game catalog, template schema, PTDL_v2 egg import              | In: templates, tags, variables, import/export, registry update detection. Deferred: image build, server install.                | R2, R4             | complete   | specs/005-templates-groups/   |
| R9  | Server Lifecycle         | Create/start/stop/restart/delete servers                        | In: server CRUD, power actions, state machine. Deferred: console, files, backups.                      | R4, R6, R7, R8, R17 | done      | —                      |
| R10 | Live Console             | WebSocket browser→daemon, console streaming, stats              | In: WS console, CPU/RAM/disk stats. Deferred: file manager, SFTP.                                       | R9                 | done      | specs/008-live-console/ |
| R11 | File Manager             | Browse, edit, upload, download, SFTP                            | In: file browser, editor, upload, download, create/delete/rename. Deferred: SFTP, backups, archives. | R9                 | done      | —                      |
| R12 | Backups                  | Create, restore, local + S3 storage                             | In: backup create/restore, storage backends. Deferred: scheduling.                                      | R9                 | done      | —                      |
| R13 | Members & Permissions    | Subusers with granular per-server permissions                    | In: members, permission bits, server access. Deferred: API keys (R1).                                  | R9                 | planned   | —                      |
| R14 | Databases                | Provision MySQL/PostgreSQL DBs for servers                       | In: DB provisioning, credentials, rotation. Deferred: backups.                                          | R9                 | planned   | —                      |
| R15 | Mounts                   | Shared host→container directories                               | In: mount create/list/delete, path validation. Deferred: backups.                                      | R9                 | planned   | —                      |
| R16 | Schedules & Tasks        | Cron-like scheduled operations on servers                        | In: schedules, tasks, execution. Deferred: backups.                                                      | R9                 | planned   | —                      |
| R17 | Real-time Panel          | SSE infrastructure, replace polling, reactive panel              | In: SSE endpoints, panel hooks, auto-reconnect, retrofit R1/R4. Deferred: WS console (R10), daemon→panel push. | R1                 | done      | specs/003-real-time-panel/ |

## Execution layers

The dependencies above define natural layers. Within a layer, entries can be specified in parallel:

| Layer | Entries  | Description                          |
|-------|----------|--------------------------------------|
| 0     | R1       | Foundation: auth                     |
| 1     | R2, R3, R4, R5, R17 | Building blocks: images, setup, nodes, audit, real-time |
| 2     | R6, R7, R8 | Node capabilities: daemon, allocations, templates |
| 3     | R9       | Core feature: server lifecycle       |
| 4     | R10-R16  | Server features: console, files, backups, members, databases, mounts, schedules |

## MVP path

The minimum viable product follows this critical path:

```
R1 (auth) → R4 (nodes) → R6 (daemon) → R8 (templates) → R7 (allocations) → R9 (server lifecycle)
```

R2 (images) runs in parallel — for development, the daemon and server lifecycle can test with public images (`alpine`, `eclipse-temurin`). Production requires our own images.

R17 (real-time panel) runs in parallel from R1 — establishes SSE infrastructure and retrofits polling in R1/R4. All future features (R5, R9, R10) use SSE for panel updates instead of polling.

## Handling cross-spec changes

When working on a spec, you may discover that you need to change something in a previous spec or anticipate something from a future one. Follow these rules:

**Needing something from a future spec:**
- Use a stub or public equivalent for testing (e.g., `alpine` instead of our custom Java image).
- Document the dependency in the current spec's `spec.md` under Assumptions.
- Do NOT block the current spec on the future one — the stub is sufficient.

**Needing to change a previous spec:**
- If it's a code change only (refactor, bug fix): make the change and update tests in the previous spec's scope.
- If it's a scope change (new requirements, changed behavior): update `ROADMAP.md` first, then update the affected spec's `spec.md`.
- If the change violates the constitution: propose an amendment (see Governance in `.specify/memory/constitution.md`).

**Discovering overlap between specs:**
- If two specs overlap more than expected: merge them in the roadmap, or split the overlapping part into its own entry.
- Update the `Scope boundary` column of affected entries to make the boundary explicit.

## Maintenance rules

- **Keep specs in sync.** When you change code that affects a spec, update the spec. When you change a spec, update the code. Specs and code MUST NOT drift.
- **Update status as you validate.** When a spec's implementation is validated (tests pass, quickstart scenarios pass), mark its roadmap entry as `done`. When implementation starts, mark it `in-progress`.
- **Update the roadmap first.** When scope shifts, update `ROADMAP.md` before updating sub-specs. The roadmap is the source of truth for how the epic is divided.
- **Keep IDs immutable.** Once a sub-spec references a roadmap ID, that ID MUST NOT change. Add new entries at the end if needed.
- **Fill in Sub-spec links.** When you create a sub-spec directory, fill in the `Sub-spec` column with the path.

## Cross-cutting infrastructure

Infrastructure that spans all specs, not tied to a single roadmap entry:

| Infra | Status | Where to find it |
|-------|--------|-------------------|
| CI (GitHub Actions) | done | `.github/workflows/ci.yml`, `Makefile`, `AGENTS.md` |
| Test isolation (E2E cleanup, test/prod guards) | done | `AGENTS.md`, `.specify/memory/constitution.md` § IV |
| Bun 1.4 workspaces monorepo | done | `bun.lock`, `AGENTS.md` |
| PostgreSQL + Redis dev services | done | `infra/docker/docker-compose.dev.yml`, `AGENTS.md` |

When updating CI or test infrastructure, update `AGENTS.md` (commands) and `constitution.md` (principles) in the same commit. Specs reference these, they don't duplicate them.
