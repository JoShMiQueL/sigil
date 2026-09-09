<!--
Sync Impact Report
- Version change: 0.0.0 (template) → 1.2.0
  - 1.0.0: Initial constitution with principles I-VI
  - 1.1.0: Principle IV updated — MCP-first verification methodology added
  - 1.2.0: Principle VI rewritten — Real-time Protocol Selection (HTTP/SSE/WS matrix)
- Added principles:
  - I. Control Plane / Execution Plane Separation
  - II. Shared Contracts as Source of Truth
  - III. Security-First Container Isolation (NON-NEGOTIABLE)
  - IV. Test Against Real Infrastructure (NON-NEGOTIABLE) — updated v1.1: MCP-first verification order
  - V. Spec-Driven Development
  - VI. Real-time Protocol Selection — updated v1.2: HTTP/SSE/WS matrix, no-polling rule, auto-reconnect
- Added sections:
  - Technology Stack Constraints
  - Development Workflow
- v1.1 changes:
  - Principle IV now includes chrome-devtools MCP as the primary interactive verification tool
  - Verification order is now NON-NEGOTIABLE: MCP-first, Playwright-last
  - Playwright repositioned as regression codification, not primary bug discovery
- v1.2 changes:
  - Principle VI expanded from "Browser-Direct Realtime" to "Real-time Protocol Selection"
  - Added HTTP/SSE/WebSocket protocol matrix with clear use-case boundaries
  - Added 6 rules: HTTP for actions, SSE for panel updates, WS for console/SFTP, no polling, auto-reconnect, graceful degradation
  - Polling for state data is now explicitly a bug
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ compatible (Constitution Check section is generic)
  - .specify/templates/spec-template.md — ✅ compatible (user stories + requirements align with principles)
  - .specify/templates/tasks-template.md — ✅ compatible (phase structure supports independent story delivery)
- Follow-up TODOs:
  - R17 spec must reference Principle VI protocol matrix
  - R1/R4 specs must note polling as tech debt to be retrofitted by R17
-->

# SigilPanel Constitution

## Core Principles

### I. Control Plane / Execution Plane Separation

The system has two distinct runtime components with hard boundaries:

- **Panel** (API + web UI): holds the database, authentication, and business logic. It NEVER talks to Docker directly.
- **Daemon**: runs on each node, drives Docker and the filesystem. It NEVER touches the database.

The daemon receives server configuration as JSON from the panel and calls back to the panel via HTTP to report state changes. The database is the panel's exclusive responsibility. This separation MUST be enforced at the code level: no database imports in the daemon, no Docker imports in the panel.

Rationale: a compromised daemon cannot exfiltrate the database; a panel bug cannot crash game servers. This is the same architecture used by Pterodactyl, Hopper, and StellarStack, proven at scale.

### II. Shared Contracts as Source of Truth

Every shape of data that travels between the panel, the daemon, or the browser MUST be defined exactly once in `packages/shared` as a Zod schema. Both sides import the inferred TypeScript types and the runtime validator.

If you are about to duplicate an interface, stop and put it in `packages/shared`. If a type exists only on one side, it is a bug waiting to happen. The shared package is the contract; the contract is the law.

Rationale: drift between panel and daemon expectations is the #1 source of runtime failures in distributed game server panels. A single source of truth eliminates it.

### III. Security-First Container Isolation (NON-NEGOTIABLE)

Game servers run arbitrary code. Security is not a feature; it is a prerequisite.

1. **No access to a server's filesystem outside a jailed filesystem abstraction.** No direct `fs.readFile` on a path that came from a request, not even "just for a test". The jail resolves `realpath`, rejects symlinks that escape, and blocks zip-slip.
2. **No string concatenation handed to a shell.** Startup commands are templates with validated variables. No `sh -c` with user input.
3. **No privileged containers.** `cap_drop: ALL`, `no-new-privileges`, PID limits, never `--privileged`. The Docker socket is NEVER mounted into a server container.
4. **No secrets in logs.** Tokens, passwords, and keys are redacted by the logger before output.
5. **A security fix ships with a regression test** that fails without the fix.

These rules block a PR without discussion. No exceptions, no "just this once".

### IV. Test Against Real Infrastructure (NON-NEGOTIABLE)

- **Unit tests** (Vitest): for pure logic — permissions, template parsing, jailed filesystem, schema validation.
- **Integration tests** (Testcontainers): for anything that touches Docker or PostgreSQL. The daemon MUST be tested against a real Docker daemon, never a `dockerode` mock. Mocks do not catch network, volume, or runtime errors.
- **MCP verification** (chrome-devtools): for interactive user-flow verification during development. Before writing Playwright tests, the agent MUST exercise the feature as a real user via chrome-devtools MCP — navigate, click, fill forms, verify state transitions, check error paths. This catches bugs that unit/integration tests structurally cannot (UI rendering, real HTTP roundtrips, polling, visual indicators, full user flows).
- **E2E tests** (Playwright): for permanent regression coverage of critical user journeys — sign-in, server creation, console interaction. These codify behavior already verified via MCP; they are NOT the primary bug-discovery mechanism.

**Verification order (NON-NEGOTIABLE):** MCP-first, Playwright-last. The agent verifies interactively with chrome-devtools MCP BEFORE writing Playwright tests. Playwright tests codify already-verified behavior. Writing a Playwright test for unverified behavior is a waste — verify first, codify second.

Code touching file paths, permissions, or tokens MUST be covered by tests, including explicit attack cases (`../../etc/passwd`, a symlink to `/`, an archive containing `../`).

**Test/prod isolation (NON-NEGOTIABLE):**

- Test-only endpoints (e.g. DB cleanup) MUST be guarded by `NODE_ENV !== "production"` and MUST NEVER be reachable in production regardless of other env vars.
- `RATE_LIMIT_DISABLED` and similar test flags MUST be no-ops when `NODE_ENV === "production"`.
- E2E tests MUST be self-contained: each test creates what it needs and cleans up after itself. No test may depend on data from a previous test.
- CI MUST use isolated service containers (PostgreSQL, Redis), not shared dev infrastructure.
- See `AGENTS.md` for exact commands and the isolation model.

### V. Spec-Driven Development

Every feature starts with a specification. The spec — not the chat history, not a Slack message, not a mental model — is the source of truth that the AI agent builds against.

The workflow is: constitution → specify → plan → tasks → implement. Skipping a phase means skipping its artifact, and the result is unreviewable code built on assumptions.

Rationale: AI-generated code is only as good as the specification it receives. Vague prompts produce vague code. A durable spec keeps the team and every coding agent aligned as the work evolves.

### VI. Real-time Protocol Selection

The panel is a reactive application. No page reloads, no polling for state that should be pushed. Three protocols, each with a clear role:

| Protocol | Direction | Use for | Examples |
|----------|-----------|---------|----------|
| **HTTP** | Request/response | Discrete actions with a discrete response | CRUD, login, token generation, power actions, initial page load |
| **SSE** | Server → browser | State changes, metrics, streams where the browser only listens | Node status/metrics, region counts, audit log, server state, user list changes |
| **WebSocket** | Browser ↔ daemon | Bidirectional real-time where the browser sends and receives | Live console (stdin/stdout), SFTP, terminal interaction |

**Rules:**

1. **HTTP for actions.** If the user triggers it (create, delete, edit, power action), it's HTTP. SSE and WebSocket are not for commands.
2. **SSE for panel updates.** Any data the panel displays that can change server-side (node health, server status, audit entries, counts) MUST use SSE, not polling. The panel subscribes once; the server pushes deltas.
3. **WebSocket for console/SFTP.** Live console and SFTP flow browser→daemon direct via WebSocket, authenticated with a short-lived JWT signed by the panel. The panel is never in the live data path.
4. **No polling for state.** `refetchInterval`, `setInterval` + fetch, or manual refresh for state data is a bug. Use SSE. The only exception is initial page load (HTTP fetch for first paint, then SSE for updates).
5. **Auto-reconnect.** SSE and WebSocket connections MUST auto-reconnect with exponential backoff. A network blip should not require a page reload. On reconnect, the client resyncs state via HTTP then re-subscribes.
6. **Graceful degradation.** If SSE fails, the UI shows a "reconnecting" indicator, not a blank page. If WebSocket fails, console shows "disconnected" but the rest of the panel keeps working.

Rationale: polling creates stale data and wasted requests. SSE is simpler than WebSocket for server→client (no framing, automatic reconnection, HTTP fallback). WebSocket is overkill for one-way updates but essential for bidirectional console/SFTP. The browser→daemon direct path (Principle I) keeps the panel out of the live data stream.

## Technology Stack Constraints

The following stack is fixed. Deviations require a constitution amendment:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Monorepo | pnpm 11 + Turborepo | Standard for modern TS monorepos |
| Panel UI | React 19 + Vite 8 + TanStack Router + shadcn/ui + Tailwind 4 | Modern, fast, type-safe |
| API | Hono (Node 24 LTS) | Lightweight, Web Standards, fast |
| Daemon | Go 1.27 + Docker Engine API | Binary deployment, native concurrency, proven by StellarStack |
| Database | PostgreSQL 18 + Drizzle ORM | Type-safe SQL, no proxies, serverless-ready |
| Cache | Redis 8 | Session cache, queue, status |
| Auth | better-auth + JWT scoped tokens | Modern auth with granular permissions |
| Validation | Zod 4 | Shared schemas as source of truth (Principle II) |
| Testing | Vitest 5 + Testcontainers 12 + Playwright 1.62 | Per Principle IV |
| TypeScript | 7.0 (native Go port) | 10x faster compilation |
| Spec framework | GitHub Spec Kit | Per Principle V |

**No Bun.** The runtime is Node 24 LTS. Testcontainers compatibility and ecosystem maturity are non-negotiable.

**No `any` in TypeScript.** Use `unknown` and narrow with a Zod schema. Errors surface typed. No silent `catch {}` on critical paths.

## Development Workflow

### Commits

Conventional Commits with scopes:

```
feat(api): add server creation endpoint
fix(daemon): refuse allocation port already taken on same node
docs(install): spell out nginx WebSocket configuration
```

Scopes: `panel`, `api`, `daemon`, `shared`, `db`, `ui`, `templates`, `images`, `infra`, `ci`, `docs`.

### Commit cadence

- **Commit by logical change, not by phase.** A commit = one coherent idea. "Add Zod schemas for auth" is a commit. "Configure Drizzle" is another. It does not matter which Spec Kit phase they belong to.
- **`pnpm check` MUST always pass before committing.** Lint and format are non-negotiable.
- **`pnpm typecheck` MUST pass when the code is in a functional state.** If you are mid-refactor, do not commit. When the logical change is complete, typecheck must pass.
- **`pnpm test` MUST pass when tests exist for the changed code.** If no tests apply to the change, this requirement does not apply.
- **`make ci` MUST pass before pushing.** This runs the same checks as GitHub Actions (lint, typecheck, unit/integration, E2E).
- **Mark tasks as `[X]` in tasks.md in the same commit** that completes them.
- **Update `ROADMAP.md` status in the same commit** that marks a spec entry as `in-progress` or `done`.
- **Commit message format**: `<type>(<scope>): <description> [R<roadmap-id>]`

Example: `feat(shared): add Zod schemas for user auth [R1]`

### Pull Requests

- One PR, one subject. A bug fix AND a refactor are two PRs.
- Describe **why** the change is needed, not only what it does.
- `pnpm check && pnpm typecheck && pnpm test` MUST pass.
- `make ci` MUST pass (includes E2E).
- If the change touches security, say so explicitly in the description.
- If the change is visible in the UI, attach a screenshot.

### Spec Kit Workflow

1. `/speckit-constitution` — principles (this document)
2. `/speckit-specify` — what to build (user stories, requirements)
3. `/speckit-plan` — how to build it (architecture, data model, contracts)
4. `/speckit-tasks` — actionable tasks decomposed by user story
5. `/speckit-implement` — execute the tasks

Spec artifacts live in `.specify/`. The constitution supersedes all other practices.

## Governance

- This constitution is the highest-authority document in the project. All PRs and reviews MUST verify compliance with its principles.
- Amendments require: (a) a written proposal, (b) explicit approval, (c) a migration plan for any code that violates the amendment.
- Versioning: MAJOR for principle removals/redefinitions, MINOR for new principles/sections, PATCH for clarifications.
- Complexity MUST be justified against the principles. If a change violates a principle, the violation MUST be documented in the plan's Complexity Tracking table with a rationale.

**Version**: 1.2.0 | **Created**: 2026-09-09
