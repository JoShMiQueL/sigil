# Implementation Plan: User Authentication & Management

**Branch**: `001-user-auth` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-user-auth/spec.md`

## Summary

User authentication and management for the SigilPanel control plane. Covers login/logout (P1), admin user management (P2), password reset via email (P3), TOTP 2FA (P4), and scoped API keys (P5). The panel owns all auth — the daemon is not involved in authentication.

## Technical Context

**Language/Version**: TypeScript 7.0 on Node 24 LTS

**Primary Dependencies**: Hono (API), better-auth (auth framework), Drizzle ORM (PostgreSQL), Zod 4 (validation), Argon2 (password hashing), jose (JWT if needed)

**Storage**: PostgreSQL 18 (users, sessions, api_keys, password_reset_tokens)

**Testing**: Vitest 5 (unit), Testcontainers 12 (integration with real PostgreSQL), Playwright 1.62 (E2E login flow)

**Target Platform**: Linux server (panel API + UI), any modern browser (UI)

**Project Type**: web-service (Hono API + React SPA)

**Performance Goals**: login < 10s, 100 concurrent logins < 2s response, API key auth < 50ms overhead

**Constraints**: no `any` in TypeScript, Zod validation at all boundaries, Argon2id for passwords, no secrets in logs, session cookie-based with configurable expiration

**Scale/Scope**: 5 user stories, 4 entities, ~15 API endpoints, 1 React module

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Control Plane / Execution Plane Separation | ✅ PASS | Auth is panel-only. Daemon is not involved. No Docker imports, no DB imports in daemon. |
| II. Shared Contracts as Source of Truth | ✅ PASS | All auth-related Zod schemas (login request, user, session, API key) live in `packages/shared`. Both API and panel UI import from there. |
| III. Security-First Container Isolation | ✅ N/A | Auth does not involve containers or filesystem access. Password hashing (Argon2id) and no-secrets-in-logs rules apply. |
| IV. Test Against Real Infrastructure | ✅ PASS | Unit tests for password hashing, token generation, permission checks. Integration tests with Testcontainers (real PostgreSQL). E2E with Playwright for login flow. |
| V. Spec-Driven Development | ✅ PASS | Spec written and validated before this plan. |
| VI. Browser-Direct Realtime | ✅ N/A | Auth does not involve realtime console/stats. |

**Gate result**: All principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── auth-api.md      # Login, logout, session, 2FA, password reset
│   ├── user-admin-api.md # User CRUD by admins
│   └── api-keys-api.md  # API key CRUD
└── tasks.md             # Phase 2 output (not created by this command)
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── index.ts              # Hono app entry
│       ├── middleware/
│       │   ├── auth.ts           # Session + API key auth middleware
│       │   └── rate-limit.ts     # Login rate limiting
│       ├── routes/
│       │   ├── auth.ts           # /api/auth/* (login, logout, me, 2FA, reset)
│       │   ├── users.ts          # /api/admin/users/* (CRUD)
│       │   └── api-keys.ts       # /api/api-keys/* (CRUD)
│       ├── services/
│       │   ├── auth.service.ts   # Login, logout, session management
│       │   ├── user.service.ts   # User CRUD, suspension
│       │   ├── password.service.ts # Reset tokens, hashing
│       │   ├── totp.service.ts   # 2FA enable/verify
│       │   └── api-key.service.ts # API key generation, verification
│       └── lib/
│           ├── argon2.ts         # Argon2id wrapper
│           └── token.ts          # Secure random token generation
├── panel/
│   └── src/
│       ├── routes/
│       │   ├── login.tsx         # Login page
│       │   ├── dashboard.tsx     # Admin dashboard
│       │   ├── users.tsx         # User management page
│       │   ├── security.tsx      # 2FA settings page
│       │   └── api-keys.tsx      # API keys page
│       ├── components/
│       │   ├── LoginForm.tsx
│       │   ├── UserTable.tsx
│       │   ├── CreateUserForm.tsx
│       │   ├── TotpSetup.tsx
│       │   └── ApiKeyManager.tsx
│       └── hooks/
│           ├── useAuth.ts        # Auth state hook
│           └── useCurrentUser.ts # Current user data
packages/
├── shared/
│   └── src/
│       ├── auth/
│       │   ├── login.ts          # LoginRequest, LoginResponse schemas
│       │   ├── user.ts           # User, UserCreate, UserUpdate schemas
│       │   ├── session.ts        # Session schema
│       │   ├── api-key.ts        # ApiKey, ApiKeyCreate schemas
│       │   ├── password-reset.ts # PasswordResetRequest, PasswordReset schemas
│       │   ├── totp.ts           # TotpEnable, TotpVerify schemas
│       │   └── permissions.ts    # API key scopes, user roles
│       └── index.ts              # Re-exports all auth schemas
└── db/
    └── src/
        ├── schema/
        │   ├── users.ts          # users table
        │   ├── sessions.ts       # sessions table
        │   ├── api-keys.ts       # api_keys table
        │   └── password-reset-tokens.ts # password_reset_tokens table
        ├── migrations/           # Drizzle migrations
        └── index.ts              # DB client + schema exports
```

**Structure Decision**: Monorepo with Hono API in `apps/api`, React UI in `apps/panel`, shared Zod schemas in `packages/shared`, and Drizzle schema/migrations in `packages/db`. The API imports `@sigilpanel/shared` for request/response validation and `@sigilpanel/db` for database access. The panel imports `@sigilpanel/shared` for type-safe API calls.
