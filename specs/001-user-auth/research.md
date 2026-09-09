# Research: User Authentication & Management

**Feature**: 001-user-auth
**Date**: 2026-09-09

## R1: better-auth vs custom auth on Hono

**Decision**: Use better-auth as the auth framework, with Hono integration.

**Rationale**: better-auth provides session management, password hashing, email/password, 2FA (TOTP), API keys, and rate limiting out of the box. It integrates with Drizzle ORM and supports custom session storage in PostgreSQL. Building all of this from scratch would be error-prone and slow.

**Alternatives considered**:
- **Lucia**: Deprecated (author archived the project). Not viable.
- **Custom auth from scratch**: Full control but high risk of security bugs. Reimplements what better-auth already does well.
- **Auth.js (NextAuth)**: Designed for Next.js. Would require adapter for Hono. Not a natural fit.

## R2: Password hashing — Argon2id parameters

**Decision**: Use Argon2id with the following parameters:
- Memory cost: 19456 KiB (19 MB)
- Time cost: 2 iterations
- Parallelism: 1
- These are the OWASP-recommended minimum parameters as of 2025.

**Rationale**: Argon2id is the OWASP-recommended password hashing algorithm. It is memory-hard, resistant to GPU/ASIC attacks, and has a proven track record. The `@node-rs/argon2` package provides native bindings with good performance on Node 24.

**Alternatives considered**:
- **bcrypt**: Still acceptable but not memory-hard. Vulnerable to GPU attacks.
- **scrypt**: Good but less widely adopted in the Node ecosystem.
- **PBKDF2**: Only if FIPS compliance is required. Not our case.

## R3: Session management — cookie vs JWT

**Decision**: Use opaque session tokens stored in an HttpOnly, Secure, SameSite=Lax cookie. Sessions are stored in PostgreSQL.

**Rationale**: Opaque tokens are revocable (delete from DB), unlike stateless JWTs. better-auth uses this approach by default. The cookie is HttpOnly (no JS access), Secure (HTTPS only), and SameSite=Lax (CSRF protection). Session expiration is checked server-side on every request.

**Alternatives considered**:
- **Stateless JWT**: Harder to revoke. Requires short expiry + refresh token complexity. Not worth it for a panel that has direct DB access.
- **Redis-backed sessions**: Faster lookup but adds a dependency for a feature that doesn't need sub-millisecond session checks. PostgreSQL is sufficient.

## R4: API key format and storage

**Decision**: API keys use the format `sigil_<base64url(32 bytes)>`. The full key is shown once at creation. The stored value is `SHA-256(key)` — we never store the raw key.

**Rationale**: The `sigil_` prefix makes keys identifiable in logs and audit trails. SHA-256 hashing means a database leak does not expose usable API keys. Base64url encoding makes the key URL-safe and copy-paste friendly. 32 bytes (256 bits) provides sufficient entropy.

**Alternatives considered**:
- **Storing raw keys**: If the DB leaks, all API keys are compromised.
- **Argon2 for API keys**: Overkill — API keys are high-entropy random values, unlike human passwords. SHA-256 is sufficient.
- **UUID-based keys**: Lower entropy and longer. Not as ergonomic.

## R5: TOTP 2FA implementation

**Decision**: Use the `@otplib/preset-default` package (or equivalent) for TOTP generation/verification. The secret is stored encrypted in the database using AES-256-GCM with a key derived from the panel's `APP_SECRET` environment variable. Recovery codes are stored as Argon2id hashes (like passwords).

**Rationale**: TOTP is a well-defined standard (RFC 6238). The secret must be encrypted (not hashed) because we need to generate the QR code and verify codes. Recovery codes are one-time passwords that the user types in, so they should be hashed like passwords.

**Alternatives considered**:
- **WebAuthn (passkeys)**: More secure but requires device support and more complex UX. Can be added as a future enhancement.
- **SMS 2FA**: Insecure (SIM swapping), costs money, and requires a phone provider. Not suitable.

## R6: Rate limiting for login

**Decision**: Use a sliding window rate limiter keyed by both email and IP address. After 5 failed attempts per email within 15 minutes, the account is locked. After 10 failed attempts per IP within 15 minutes, the IP is blocked. Rate limit state is stored in Redis.

**Rationale**: Keying by both email and IP prevents brute-force attacks on a single account and distributed attacks from a single IP. Redis provides fast atomic counters with TTL. This is the same pattern used by Hopper and Pterodactyl.

**Alternatives considered**:
- **In-memory rate limiting**: Does not work across multiple panel instances.
- **PostgreSQL-based rate limiting**: Works but adds write load to the primary database for every login attempt.

## R7: Password reset token security

**Decision**: Reset tokens are 32-byte random values, base64url-encoded. The stored value is `SHA-256(token)`. Tokens expire after 1 hour, are single-use, and revoking all sessions on password change is mandatory.

**Rationale**: SHA-256 hashing prevents token reuse if the DB leaks. Single-use prevents replay attacks. 1-hour expiry balances security with user convenience. Revoking sessions on password change is critical — if an attacker reset the password, existing sessions (potentially the attacker's) must be killed.

**Alternatives considered**:
- **JWT-based reset tokens**: Stateless but cannot be revoked before expiry. If a user clicks the link and then realizes it was a mistake, they cannot invalidate it.
- **Longer expiry (24h)**: Increases the window for token interception. 1 hour is sufficient for most users.

## R8: better-auth integration with Hono and Drizzle

**Decision**: better-auth's Hono adapter handles session cookie extraction and verification. Drizzle is used as the database adapter for better-auth, storing sessions and users in our PostgreSQL tables. Custom tables (api_keys, password_reset_tokens) are managed directly via Drizzle, not through better-auth's schema.

**Rationale**: better-auth supports custom database schemas via its Drizzle adapter. We keep our existing table structure and let better-auth manage users and sessions. API keys and password reset tokens are custom features beyond better-auth's scope, so we manage them ourselves.

**Alternatives considered**:
- **Using better-auth's built-in API key plugin**: better-auth has an API key plugin in preview. We will evaluate it; if it meets our needs (scoped permissions, revocation), we use it. If not, we build our own as planned.
