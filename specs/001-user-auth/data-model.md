# Data Model: User Authentication & Management

**Feature**: 001-user-auth
**Date**: 2026-09-09

## Entities

### User

The core account entity. A user can be an admin (full panel access) or a regular user (server owner). Members (subusers with access to specific servers) are users with a server-specific relationship defined in a later feature.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| email | text | unique, not null, max 255 | Lowercased on insert |
| username | text | unique, not null, max 64, `^[a-zA-Z0-9_.-]+$` | |
| password_hash | text | not null | Argon2id hash |
| role | enum | not null, default `'user'` | Values: `admin`, `user` |
| status | enum | not null, default `'active'` | Values: `active`, `suspended` |
| totp_secret | text | nullable | AES-256-GCM encrypted, null if 2FA disabled |
| totp_enabled | boolean | not null, default `false` | |
| recovery_codes | jsonb | nullable | Array of Argon2id hashes, null if 2FA disabled |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | Updated on every change |

**Indexes**:
- `users_email_idx` on `email` (unique)
- `users_username_idx` on `username` (unique)

**Validation rules** (enforced via Zod in `packages/shared`):
- Email: valid email format, max 255 chars
- Username: 3-64 chars, alphanumeric + `_.-`
- Password (on create/reset): min 8 chars, no max (Argon2id handles length safely)

**State transitions** (status field):
- `active` → `suspended` (admin suspends)
- `suspended` → `active` (admin unsuspends)
- Cannot suspend self
- Cannot suspend last active admin

### Session

An active authentication session. Created on login, destroyed on logout or expiration.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| user_id | uuid | FK → users.id, not null, on delete cascade | |
| token | text | unique, not null | Opaque random token, 32 bytes base64url |
| ip_address | inet | not null | Client IP at creation |
| user_agent | text | nullable | Browser user agent |
| expires_at | timestamptz | not null | Default: now() + 24h (configurable) |
| created_at | timestamptz | not null, default `now()` | |

**Indexes**:
- `sessions_token_idx` on `token` (unique)
- `sessions_user_id_idx` on `user_id`

**Lifecycle**:
- Created on successful login (after 2FA if enabled)
- Deleted on explicit logout
- Deleted when `expires_at` < `now()` (checked on read, cleaned up periodically)
- All sessions for a user deleted on password change/reset

### ApiKey

A scoped API key for programmatic access.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| user_id | uuid | FK → users.id, not null, on delete cascade | |
| name | text | not null, max 64 | Human-readable label |
| key_hash | text | unique, not null | SHA-256 of the full key |
| key_prefix | text | not null | First 12 chars of the key, for identification |
| scopes | text[] | not null, default `'{}'` | Array of scope strings |
| last_used_at | timestamptz | nullable | Updated on each API key auth |
| created_at | timestamptz | not null, default `now()` | |

**Indexes**:
- `api_keys_key_hash_idx` on `key_hash` (unique)
- `api_keys_user_id_idx` on `user_id`

**Scopes** (enum-like, validated via Zod):
- `read` — read access to resources
- `control` — start/stop/restart servers
- `files` — file manager access
- `databases` — database management
- `backups` — backup management
- `allocations` — allocation management
- `settings` — server settings
- `users` — user management (admin only)

**Key format**: `sigil_<base64url(32 bytes)>`. Full key shown once at creation. `key_prefix` stores the first 12 chars for display in the UI (e.g., `sigil_abc1...`).

### PasswordResetToken

A single-use token for password recovery.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| user_id | uuid | FK → users.id, not null, on delete cascade | |
| token_hash | text | unique, not null | SHA-256 of the token |
| expires_at | timestamptz | not null | now() + 1 hour |
| used_at | timestamptz | nullable | Set when the token is consumed |
| created_at | timestamptz | not null, default `now()` | |

**Indexes**:
- `password_reset_tokens_token_hash_idx` on `token_hash` (unique)
- `password_reset_tokens_user_id_idx` on `user_id`

**Lifecycle**:
- Created on password reset request
- Consumed (used_at set) on successful password change
- Invalid if `used_at` is not null or `expires_at` < `now()`
- Old tokens for a user are invalidated when a new one is created

## Entity Relationships

```text
User 1───* Session
User 1───* ApiKey
User 1───* PasswordResetToken
```

A user has many sessions (one per device/browser). A user has many API keys. A user has many password reset tokens over time (but only one active at a time).

## Validation Schemas Location

All Zod schemas for these entities live in `packages/shared/src/auth/`:

- `user.ts` — `UserSchema`, `UserCreateSchema`, `UserUpdateSchema`, `UserRoleSchema`
- `session.ts` — `SessionSchema`
- `api-key.ts` — `ApiKeySchema`, `ApiKeyCreateSchema`, `ApiKeyScopesSchema`
- `password-reset.ts` — `PasswordResetRequestSchema`, `PasswordResetSchema`
- `totp.ts` — `TotpEnableSchema`, `TotpVerifySchema`, `TotpDisableSchema`
- `permissions.ts` — `UserRole`, `ApiKeyScope` (const arrays + Zod enums)
- `login.ts` — `LoginRequestSchema`, `LoginResponseSchema`
