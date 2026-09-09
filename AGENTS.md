# SigilPanel

Modern game server management panel. A reimagining of Pterodactyl with modern technologies.

## Project Overview

SigilPanel is a self-hosted game server management panel that runs game servers in isolated Docker containers. It consists of a web panel for management and a daemon that runs on each node to control Docker containers.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm 11 workspaces + Turborepo 2.10 |
| Panel UI | React 19.2 + Vite 8 + TanStack Router 1.170 + shadcn/ui 4.21 + Tailwind CSS 4.3 |
| API | Hono 4.13 (Node 24 LTS) |
| Daemon | Go 1.27 (Docker Engine API) |
| Database | PostgreSQL 18 + Drizzle ORM 0.45 |
| Cache | Redis 8 |
| Storage | Local filesystem + S3-compatible (MinIO/R2/B2/AWS S3) |
| Auth | better-auth 1.7 + JWT scoped tokens |
| Testing | Vitest 5 (unit) + Testcontainers 12 (integration) + Playwright 1.62 (E2E) |
| Validation | Zod 4.5 |
| TypeScript | 7.0 (native Go port, 10x faster) |
| Package manager | pnpm 11.25 |
| Spec framework | GitHub Spec Kit 0.12 (specify-cli) |

## Monorepo Structure

```
sigilpanel/
├── apps/
│   ├── panel/          # React 19 + Vite frontend (panel UI)
│   ├── api/            # Hono API (auth, server CRUD, JWT mint, schedules)
│   └── daemon/         # Go daemon (Docker, SFTP, backups, WebSocket, filesystem)
├── packages/
│   ├── shared/         # Zod schemas, types, error codes (source of truth for contracts)
│   ├── db/             # Drizzle schema + migrations
│   └── ui/             # Shared UI primitives (cards, sidebar, dialog)
├── templates/          # Game server templates (equivalent to Pterodactyl eggs)
├── images/             # Docker base images (equivalent to Pterodactyl yolks)
├── infra/
│   ├── docker/         # Dev compose stack (Postgres, Redis, MinIO)
│   └── scripts/        # Bootstrap + seed scripts
├── docs/               # Project documentation
├── .specify/           # Spec Kit artifacts (constitution, specs, plans, tasks)
└── .devin/             # Devin skills (Spec Kit integration)
```

## Architecture

```
Browser
  │  HTTPS (REST)                    ┌──────────────────────────────┐
  ├─────────────────────────────────▶│  API (Hono)                  │
  │                                  │  PostgreSQL + Redis           │
  │  WSS console/stats               └──────────────┬───────────────┘
  │  (short JWT signed by the API)                  │ REST (node token)
  │                                                 ▼
  └────────────────────────────────▶┌──────────────────────────────┐
                                    │  DAEMON (Go)                 │
                                    │  SFTP :2022                  │
                                    │  Docker Engine API → containers
                                    └──────────────────────────────┘
                                           /var/lib/sigilpanel/volumes/<uuid>
```

- The **API** holds the database, authentication, and business logic. Never talks to Docker.
- The **daemon** runs on each node, drives Docker and the filesystem. Never touches the database.
- The browser opens a WebSocket **directly to the daemon** with a short-lived JWT signed by the API. The API never becomes a bottleneck for live console/stats.
- The daemon reports state changes back to the API via HTTP signed with HMAC.

## Vocabulary

This project uses neutral, descriptive names instead of Pterodactyl's branded vocabulary.

### Infrastructure
| Concept | Name | Description |
|---------|------|-------------|
| Web management interface | `panel` | The web UI for managing everything |
| Node agent | `daemon` | Runs on each node, manages Docker containers |
| Physical/virtual server | `node` | A machine that runs the daemon |
| Node grouping | `region` | Geographic/logical grouping of nodes |

### Game configuration
| Concept | Name | Description |
|---------|------|-------------|
| Template category | `group` | Groups related templates (e.g. "Minecraft") |
| Game server config | `template` | Defines how a game is installed and run (e.g. "Paper") |
| Template parameter | `variable` | Editable parameter exposed to users |
| Docker base images | `images` | Base Docker images (Java, Python, Wine, etc.) |

### Servers
| Concept | Name | Description |
|---------|------|-------------|
| Game server instance | `server` | A running instance on a node |
| IP:port assignment | `allocation` | Network allocation assigned to a server |
| Shared directory | `mount` | Bind mount from host into container |
| Server database | `database` | MySQL/Postgres DB for the game server itself |

### Users and permissions
| Concept | Name | Description |
|---------|------|-------------|
| User account | `user` | A registered user |
| Limited-access user | `member` | User with granular permissions on a specific server |
| Full-access user | `admin` | User with full panel access |
| Granular permissions | `permissions` | Per-server permission system |

### Data and operations
| Concept | Name | Description |
|---------|------|-------------|
| Backup | `backup` | Server backup (local or S3) |
| Scheduled job | `schedule` | Contains tasks, defines when they run |
| Scheduled action | `task` | Individual action within a schedule |
| Action log | `audit log` | Log of user/system actions |
| Startup command | `startup command` | Command to start a game server |

## Non-negotiable security rules

1. **No access to a server's filesystem outside a jailed filesystem abstraction.** No direct `fs.readFile` on a path from a request, not even for a test.
2. **No string concatenation handed to a shell.** Startup commands are templates with validated variables.
3. **No privileged containers**, and never mount the Docker socket into a server container.
4. **No secrets in logs.** Tokens, passwords and keys are redacted by the logger.
5. **A security fix ships with a regression test** that fails without the fix.

## Code conventions

- **TypeScript everywhere** except the daemon (Go). No `any` — use `unknown` and narrow with Zod.
- **Zod schemas in `packages/shared` are the source of truth.** If you're about to duplicate an interface, put it there.
- **Conventional Commits** with scopes: `panel`, `api`, `daemon`, `shared`, `db`, `ui`, `templates`, `images`, `infra`, `ci`, `docs`.
- **Comment the "why", not the "what".** Keep only comments that earn their place.
- **Errors surface typed.** No silent `catch {}` on critical paths.

## Verification and commits

Before any commit, the following MUST pass:

```bash
pnpm check        # Biome lint + format (always required)
pnpm typecheck    # TypeScript type checking (required when code is in a functional state)
pnpm test         # Tests (required when tests exist for the changed code)
```

Commit by logical change, not by Spec Kit phase. One commit = one coherent idea. Mark tasks as `[X]` in `tasks.md` in the same commit that completes them. Update `ROADMAP.md` status in the same commit that changes a spec entry's status.

Commit message format: `<type>(<scope>): <description> [R<roadmap-id>]`

Example: `feat(shared): add Zod schemas for user auth [R1]`

See `.specify/memory/constitution.md` section "Commit cadence" for the full rules.

## Spec Kit workflow

This project uses GitHub Spec Kit for spec-driven development. The project is decomposed into sub-features tracked in `ROADMAP.md` (the "spec of specs" pattern). Each sub-feature runs through its own specify → plan → tasks → implement cycle.

**Before starting any work, read `ROADMAP.md`** to see the full feature breakdown, dependencies, and status. Pick the next entry whose dependencies are `done` (or have none).

**Always read `.specify/memory/constitution.md`** for project principles and governance constraints. The constitution supersedes all other practices.

**Keep specs and code in sync at all times.** When you change code that affects a spec, update the spec. When you change a spec, update the code. Specs and code MUST NOT drift. When scope shifts, update `ROADMAP.md` first, then reconcile affected sub-specs.

**Update roadmap status as you validate.** Mark a roadmap entry `in-progress` when implementation starts. Mark it `done` only when tests pass and quickstart scenarios are validated — not when code is merely written.

The workflow per sub-feature is:

1. `/speckit-specify` — Create baseline specification (what to build)
2. `/speckit-plan` — Create implementation plan (how to build it)
3. `/speckit-tasks` — Generate actionable tasks
4. `/speckit-implement` — Execute implementation

Optional enhancement skills:
- `/speckit-clarify` — Ask structured questions before planning
- `/speckit-analyze` — Cross-artifact consistency report
- `/speckit-checklist` — Generate quality checklists

Spec artifacts live in `.specify/` (constitution) and `specs/<NNN-feature>/` (per-feature spec, plan, tasks). The roadmap links to each sub-spec directory.
