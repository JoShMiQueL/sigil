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
  │  (actions: CRUD, login, power)   │  PostgreSQL + Redis           │
  │                                  └──────────────┬───────────────┘
  │  SSE (server→browser)                           │ REST (node token)
  │  (state: node health, counts,                                  │
  │   audit log, server status)                                     ▼
  │                                  ┌──────────────────────────────┐
  │  WSS console/SFTP                │  DAEMON (Go)                 │
  │  (short JWT signed by the API)    │  SFTP :2022                  │
  │  (browser→daemon direct)          │  Docker Engine API → containers
  └────────────────────────────────▶└──────────────────────────────┘
                                           /var/lib/sigilpanel/volumes/<uuid>
```

### Protocol selection (Constitution Principle VI)

| Protocol | Direction | Use for |
|----------|-----------|---------|
| **HTTP** | Request/response | Actions: CRUD, login, token generation, power actions, initial page load |
| **SSE** | Server → browser | State: node health/metrics, region counts, audit log, server status, user list |
| **WebSocket** | Browser ↔ daemon | Interactive: live console (stdin/stdout), SFTP, terminal |

- **No polling for state.** `refetchInterval` for state data is a bug. Use SSE.
- **Auto-reconnect** with exponential backoff. No page reloads on network blips.
- **HTTP for actions.** SSE/WS are not for commands.

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

## CI (GitHub Actions)

The repo has a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on push and PR to `main`. It uses the same `pnpm` commands you run locally — no separate CI script to maintain.

Jobs:
1. **Lint & Typecheck** — `pnpm check` + `pnpm typecheck`
2. **Unit & Integration** — `pnpm --filter @sigilpanel/db db:generate` + `pnpm test` (Testcontainers auto-starts PostgreSQL, no external services needed)
3. **E2E** — `pnpm --filter @sigilpanel/db db:generate` + `pnpm test:e2e` (Testcontainers auto-starts PostgreSQL + Redis, no external services needed)

The E2E job uses the same `scripts/run-e2e.ts` Testcontainers orchestrator as local development — no GitHub Actions service containers, no separate CI setup. The Playwright config detects `CI` env var and uses Playwright's bundled Chromium instead of system Chromium.

CI caching (all jobs):
- **pnpm store** — cached by `pnpm/setup@v2` (keyed on `pnpm-lock.yaml`)
- **Turborepo** — `.turbo/` cached via `actions/cache@v6` (keyed per job + commit SHA)
- **Playwright browsers** — `~/.cache/ms-playwright` cached via `actions/cache@v6` (keyed on Playwright version); on cache hit only system deps are reinstalled with `playwright install-deps`

To run the same checks locally:

```bash
make ci         # all checks (lint, typecheck, test, e2e)
make check      # lint only
make typecheck  # type checking only
make test       # unit + integration only
make test-e2e   # E2E only (needs Docker running for Testcontainers)
```

The `Makefile` targets mirror the workflow steps exactly. Requires Docker running.

## E2E verification workflow

**Verify E2E what can be verified at each step.** Do not wait until the end to test. If the API is running, test it with curl. If the panel has a page, open it in the browser and interact with it. If something cannot be verified yet, note it and move on.

### Prerequisites: chrome-devtools MCP

The MCP-first methodology requires the `chrome-devtools` MCP server. If it is not already configured, install it:

```bash
npx chrome-devtools-mcp@latest install
```

Or manually add it to your MCP config (`~/.config/devin/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

Verify it is available by listing tools:

```
mcp_list_tools("chrome-devtools")
```

You should see: `navigate_page`, `take_snapshot`, `click`, `fill`, `fill_form`, `evaluate_script`, `take_screenshot`, `wait_for`, `handle_dialog`, `list_pages`, etc.

**Requirements**: Chromium/Chrome installed on the system. The MCP server launches a headless browser instance automatically.

### MCP-first verification methodology

The verification flow is **MCP-first, Playwright-last**. This means:

1. **Build the feature** (API + panel code).
2. **Verify with chrome-devtools MCP** — act as a real user: navigate, click, fill forms, send API calls from the browser, inspect snapshots. Catch bugs that unit/integration tests miss (UI rendering, real HTTP roundtrips, state transitions, polling, visual indicators).
3. **Fix anything broken** found during MCP verification.
4. **Only then write Playwright E2E tests** — these are permanent regression tests that codify the already-verified behavior. They should not be the primary discovery mechanism for bugs.

**Why MCP-first?** Integration tests verify the API in isolation. Playwright tests verify the UI but are slow to write and hard to debug interactively. chrome-devtools MCP lets you click through the real UI in real time, catching issues like "regenerate credentials doesn't invalidate old ones" or "the region node count doesn't refresh" that unit tests structurally cannot find because they don't exercise the full user flow.

### Tools

1. **chrome-devtools MCP (primary, during development)** — Control Chromium directly: navigate, click, fill forms, take screenshots, evaluate scripts, inspect snapshots. Use this to verify the panel works as a user would, in real time, while building. This is the primary verification tool — use it BEFORE writing Playwright tests.

2. **Playwright (secondary, regression)** — Write E2E tests in `apps/panel/tests/e2e/` that run in CI. These codify behavior already verified via MCP. They are permanent regression tests, not the primary discovery mechanism.

### Verification flow per feature

```
1. Implement API endpoint + service
2. Run pnpm test (unit/integration) — must pass
3. Start dev services (pnpm dev:services + db:migrate + db:seed + pnpm dev)
4. Open chrome-devtools MCP → navigate to panel
5. Exercise the full user flow as a real user would:
   - Login, navigate to the relevant page
   - Create/edit/delete resources through the UI
   - Send API calls from the browser console (evaluate_script) for daemon-side actions
   - Verify visual indicators, polling, state transitions
   - Check that error cases produce the right UI feedback
6. Fix any bugs found
7. Re-verify with MCP
8. Write Playwright E2E test codifying the verified flow
9. Run pnpm test:e2e — must pass
10. Commit
```

### Starting dev services for MCP verification

```bash
pnpm dev:services          # PostgreSQL + Redis via Docker Compose
pnpm --filter @sigilpanel/db db:generate  # Generate Drizzle migrations
pnpm --filter @sigilpanel/db db:migrate   # Run migrations
pnpm --filter @sigilpanel/api db:seed       # Seed admin user
RATE_LIMIT_DISABLED=1 pnpm --filter @sigilpanel/api dev &  # API on :3000
pnpm --filter @sigilpanel/panel dev &        # Panel on :5173
```

Or simply:

```bash
pnpm dev:services
pnpm --filter @sigilpanel/db db:migrate
pnpm --filter @sigilpanel/api db:seed
pnpm dev
```

### MCP verification checklist

When verifying a feature with chrome-devtools MCP, cover at minimum:

- **Happy path**: the normal user flow end-to-end (login → navigate → action → verify result)
- **Error paths**: duplicate names, invalid inputs, permission denied, not-found
- **State transitions**: status changes, polling refreshes, data propagation between views
- **Security-sensitive flows**: credential regeneration invalidates old creds, revocation blocks auth, deleted resources can't be accessed
- **Visual indicators**: status colors, disabled buttons, error messages, success messages

## Automated tests

All tests are fully automatic — no manual server startup, seeding, or Redis flushing required. The only prerequisite is Docker running (for Testcontainers and the dev PostgreSQL/Redis).

### Unit + integration tests (`pnpm test`)

- **Vitest** runs all `*.spec.ts` files under `apps/api/src/`.
- **Testcontainers** automatically starts an isolated PostgreSQL Docker container, applies Drizzle migrations, and tears it down after the run. No dev database needed.
- The API is imported as a Hono app in-process (no HTTP server started) thanks to the `NODE_ENV !== "test"` guard in `apps/api/src/index.ts`.
- The rate limiter is mocked in integration tests to avoid Redis state interference.
- Tests run sequentially (`fileParallelism: false`) because they share the Testcontainer database and clean up between tests.

```bash
pnpm test                                          # All workspace tests
pnpm --filter @sigilpanel/api test                 # API tests only
```

### E2E tests (`pnpm test:e2e`)

- **Playwright** runs browser tests in `apps/panel/tests/e2e/`.
- `scripts/run-e2e.ts` is the single orchestrator for both local and CI. It:
  1. Builds the panel for production (`vite build`)
  2. Starts isolated PostgreSQL + Redis Testcontainers (random ports, no host conflicts)
  3. Applies Drizzle migrations to the testcontainer
  4. Seeds the admin user
  5. Launches Playwright with `DATABASE_URL` + `REDIS_URL` pointing to the testcontainers
  6. Stops the testcontainers on exit (success or failure)
- The Playwright config `webServer` starts the API (`pnpm --filter @sigilpanel/api start` — `tsx` without watch, no hot reload) and the panel (`pnpm --filter @sigilpanel/panel preview` — serves the production build).
- `NODE_ENV=development` enables the test-cleanup endpoint between tests.
- `RATE_LIMIT_DISABLED=1` prevents login throttling during tests.
- Each test cleans up after itself via `afterEach` → `POST /test/cleanup` (only registered when `NODE_ENV !== "production"`, never in real production). Truncates all tables except the admin user.
- Each test is self-contained — creates what it needs, doesn't depend on previous tests.
- Playwright uses its bundled Chromium in CI (`process.env.CI`), system Chromium locally (`/usr/bin/chromium-browser`).
- **Local and CI are identical**: same command (`pnpm test:e2e`), same orchestrator, same Testcontainers. No separate CI setup.

```bash
pnpm test:e2e                                      # Playwright E2E tests
```

### Test structure

```
apps/api/src/
├── lib/
│   ├── argon2.spec.ts        # Argon2id hash/verify
│   ├── credentials.spec.ts   # Node credential generation, HMAC signing
│   ├── crypto.spec.ts        # AES-256-GCM encrypt/decrypt
│   └── token.spec.ts         # Token generation
├── middleware/
│   ├── node-auth.spec.ts     # Node HMAC auth (X-Node-Id/Signature/Timestamp)
│   └── rate-limit.spec.ts    # Rate limiter (in-memory Redis mock)
├── services/
│   ├── password.spec.ts      # Reset token gen/hash
│   └── totp.spec.ts          # TOTP + recovery codes
├── routes/
│   ├── auth.spec.ts          # Login, logout, /me, password reset, 2FA
│   ├── users.spec.ts         # User CRUD, suspension, guards
│   ├── api-keys.spec.ts      # API key create/list/revoke/auth
│   ├── regions.spec.ts       # Region CRUD (US1)
│   ├── pairing.spec.ts       # Pairing tokens, daemon registration (US2)
│   ├── heartbeat.spec.ts     # Heartbeat processing, offline sweep (US3)
│   ├── nodes.spec.ts         # Node CRUD, credential management (US4)
│   └── test-cleanup.ts       # Test-only DB cleanup endpoint (E2E mode)
└── test/
    ├── global-setup.ts       # Testcontainers PostgreSQL + migrations
    ├── setup.ts              # Env var propagation
    └── helpers.ts            # DB cleanup, user/node/region factories, request helpers

apps/panel/tests/e2e/
├── helpers.ts                # cleanupDatabase() helper
├── login.spec.ts             # Admin login, invalid creds, logout
├── users.spec.ts             # User creation, suspension
├── regions.spec.ts           # Region create, delete, duplicate name (US1)
├── pairing.spec.ts           # Pairing token generation, daemon registration (US2)
├── heartbeat.spec.ts         # Heartbeat sends, online status verification (US3)
├── node-lifecycle.spec.ts    # Node edit, regenerate creds, delete (US4)
└── real-time.spec.ts         # SSE: region/node updates, no polling (R17)

scripts/
└── run-e2e.ts                # Testcontainers orchestrator (PostgreSQL + Redis → Playwright)
```

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
