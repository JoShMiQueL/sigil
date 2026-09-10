# Quickstart: User Authentication & Management

**Feature**: 001-user-auth
**Date**: 2026-09-09

## Prerequisites

- Bun 1.4, Bun 1.4, Go 1.27 (daemon not needed for this feature)
- Docker (for Testcontainers integration tests)
- PostgreSQL 18 and Redis 8 running via `bun dev:services`

## Setup

```bash
# Install dependencies
bun install

# Start PostgreSQL + Redis
bun dev:services

# Run database migrations
bun --filter @sigil/db db:generate
bun --filter @sigil/db db:migrate

# Seed initial admin account
bun --filter @sigil/api db:seed
# Output: Admin credentials printed to console
```

## Validation Scenarios

### Scenario 1: Login flow (P1)

```bash
# Start the API
bun --filter @sigil/api dev

# Login with seeded admin
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}'

# Expected: 200 with {"status":"ok","user":{...}}
# Cookie file should contain session token

# Verify session
curl -b cookies.txt http://localhost:3000/api/auth/me
# Expected: 200 with user object

# Logout
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
# Expected: 200 with {"status":"ok"}
```

### Scenario 2: User management (P2)

```bash
# Login as admin (get cookie)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}'

# Create a user
curl -b cookies.txt -X POST http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","username":"testuser","password":"testpass123","role":"user"}'
# Expected: 201 with user object

# List users
curl -b cookies.txt http://localhost:3000/api/admin/users
# Expected: 200 with array containing both admin and new user

# Suspend the user
curl -b cookies.txt -X PATCH http://localhost:3000/api/admin/users/<user_id> \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
# Expected: 200 with status "suspended"

# Try to login as suspended user (should fail)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"testpass123"}'
# Expected: 401 with "Account suspended"

# Try to suspend self (should fail)
curl -b cookies.txt -X PATCH http://localhost:3000/api/admin/users/<admin_id> \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
# Expected: 403 with error message
```

### Scenario 3: API key creation and usage (P5)

```bash
# Login as admin
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}'

# Create API key
curl -b cookies.txt -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name":"test-key","scopes":["read"]}'
# Expected: 201 with full key string (save it)

# Use API key
curl -H "Authorization: Bearer sigil_..." http://localhost:3000/api/auth/me
# Expected: 200 with user object

# Revoke key
curl -b cookies.txt -X DELETE http://localhost:3000/api/api-keys/<key_id>
# Expected: 200

# Use revoked key (should fail)
curl -H "Authorization: Bearer sigil_..." http://localhost:3000/api/auth/me
# Expected: 401
```

### Scenario 4: Rate limiting (edge case)

```bash
# Make 5 failed login attempts
for i in 1 2 3 4 5; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@sigil.local","password":"wrong"}'
done
# Expected: first 4 return 401, 5th returns 429

# 6th attempt should also be rate limited
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"wrong"}'
# Expected: 429
```

## Running Tests

See `AGENTS.md` for the full test guide. Quick reference:

```bash
make ci         # all checks (lint, typecheck, unit/integration, E2E)
make test       # unit + integration only
make test-e2e   # E2E only
```

## Expected Outcomes

- Admin can log in and see the dashboard
- Admin can create, list, suspend, and unsuspend users
- Suspended users cannot log in
- Admin cannot suspend themselves or the last admin
- API keys can be created with scopes and used for authentication
- Revoked API keys immediately stop working
- Rate limiting activates after 5 failed login attempts
- Password reset flow works end-to-end (requires SMTP configuration)
- 2FA enrollment and verification works with standard authenticator apps
