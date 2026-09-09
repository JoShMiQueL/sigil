<!--
Sync Impact Report
- Version change: 0.0.0 (template) → 1.0.0
- Added principles:
  - I. Control Plane / Execution Plane Separation
  - II. Shared Contracts as Source of Truth
  - III. Security-First Container Isolation (NON-NEGOTIABLE)
  - IV. Test Against Real Infrastructure (NON-NEGOTIABLE)
  - V. Spec-Driven Development
  - VI. Browser-Direct Realtime
- Added sections:
  - Technology Stack Constraints
  - Development Workflow
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ compatible (Constitution Check section is generic)
  - .specify/templates/spec-template.md — ✅ compatible (user stories + requirements align with principles)
  - .specify/templates/tasks-template.md — ✅ compatible (phase structure supports independent story delivery)
- Follow-up TODOs: none
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
- **Integration tests** (Testcontainers): for anything that touches Docker. The daemon MUST be tested against a real Docker daemon, never a `dockerode` mock. Mocks do not catch network, volume, or runtime errors.
- **E2E tests** (Playwright): for critical user journeys — sign-in, server creation, console interaction.

Code touching file paths, permissions, or tokens MUST be covered by tests, including explicit attack cases (`../../etc/passwd`, a symlink to `/`, an archive containing `../`).

### V. Spec-Driven Development

Every feature starts with a specification. The spec — not the chat history, not a Slack message, not a mental model — is the source of truth that the AI agent builds against.

The workflow is: constitution → specify → plan → tasks → implement. Skipping a phase means skipping its artifact, and the result is unreviewable code built on assumptions.

Rationale: AI-generated code is only as good as the specification it receives. Vague prompts produce vague code. A durable spec keeps the team and every coding agent aligned as the work evolves.

### VI. Browser-Direct Realtime

Live console, stats, and SFTP traffic flow directly from the browser to the daemon via WebSocket, authenticated with a short-lived JWT signed by the panel. The panel is never in the live data path.

Rationale: with 50 consoles open, proxying through the panel creates a bottleneck and adds latency. The panel signs the token; the daemon verifies it; the browser talks direct. The panel's job is authorization, not relay.

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
- **Mark tasks as `[X]` in tasks.md in the same commit** that completes them.
- **Update `ROADMAP.md` status in the same commit** that marks a spec entry as `in-progress` or `done`.
- **Commit message format**: `<type>(<scope>): <description> [R<roadmap-id>]`

Example: `feat(shared): add Zod schemas for user auth [R1]`

### Pull Requests

- One PR, one subject. A bug fix AND a refactor are two PRs.
- Describe **why** the change is needed, not only what it does.
- `pnpm check && pnpm typecheck && pnpm test` MUST pass.
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

**Version**: 1.0.0 | **Created**: 2026-09-09
