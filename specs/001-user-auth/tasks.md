# Tasks: User Authentication & Management

**Input**: Design documents from `/specs/001-user-auth/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included for this feature — security-sensitive auth code requires coverage per Constitution Principle IV.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Monorepo: `apps/api/src/` (Hono API), `apps/panel/src/` (React UI), `packages/shared/src/` (Zod schemas), `packages/db/src/` (Drizzle schema)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create Hono app entry in `apps/api/src/index.ts` with basic routing skeleton
- [X] T002 [P] Configure Drizzle ORM client in `packages/db/src/index.ts` with PostgreSQL connection
- [X] T003 [P] Configure Vite + React entry in `apps/panel/src/main.tsx` with TanStack Router skeleton
- [X] T004 [P] Create shared package entry in `packages/shared/src/index.ts` re-exporting all schemas
- [X] T005 [P] Configure Vitest in `apps/api/vitest.config.ts` with Testcontainers setup
- [X] T006 [P] Configure Vitest in `apps/panel/vitest.config.ts` with jsdom environment
- [X] T007 [P] Create Docker Compose dev services file in `infra/docker/docker-compose.dev.yml` with PostgreSQL 18 and Redis 8
- [X] T008 [P] Configure Biome (linter + formatter) in root `biome.json` with TypeScript rules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create `users` table schema in `packages/db/src/schema/users.ts` with all fields from data-model.md
- [X] T010 [P] Create `sessions` table schema in `packages/db/src/schema/sessions.ts` with all fields from data-model.md
- [X] T011 [P] Create `api_keys` table schema in `packages/db/src/schema/api-keys.ts` with all fields from data-model.md
- [X] T012 [P] Create `password_reset_tokens` table schema in `packages/db/src/schema/password-reset-tokens.ts` with all fields from data-model.md
- [X] T013 Export all schemas from `packages/db/src/index.ts` and generate initial Drizzle migration
- [X] T014 [P] Create Argon2id wrapper in `apps/api/src/lib/argon2.ts` with OWASP-recommended parameters (memory 19456 KiB, time 2, parallelism 1)
- [X] T015 [P] Create secure random token generator in `apps/api/src/lib/token.ts` (32-byte base64url tokens)
- [X] T016 [P] Create Zod schemas for User, UserCreate, UserUpdate, UserRole in `packages/shared/src/auth/user.ts`
- [X] T017 [P] Create Zod schemas for Session in `packages/shared/src/auth/session.ts`
- [X] T018 [P] Create Zod schemas for ApiKey, ApiKeyCreate, ApiKeyScopes in `packages/shared/src/auth/api-key.ts`
- [X] T019 [P] Create Zod schemas for LoginRequest, LoginResponse in `packages/shared/src/auth/login.ts`
- [X] T020 [P] Create Zod schemas for PasswordResetRequest, PasswordReset in `packages/shared/src/auth/password-reset.ts`
- [X] T021 [P] Create Zod schemas for TotpEnable, TotpVerify, TotpDisable in `packages/shared/src/auth/totp.ts`
- [X] T022 [P] Create permissions constants and Zod enums for roles and scopes in `packages/shared/src/auth/permissions.ts`
- [X] T023 Re-export all auth schemas from `packages/shared/src/auth/index.ts` and update `packages/shared/src/index.ts`
- [X] T024 Install and configure better-auth with Hono adapter and Drizzle adapter in `apps/api/src/lib/auth.ts`
- [X] T025 Create auth middleware in `apps/api/src/middleware/auth.ts` supporting both session cookie and API key Bearer token
- [X] T026 [P] Create rate limit middleware in `apps/api/src/middleware/rate-limit.ts` using Redis sliding window (5 attempts/15min per email+IP)
- [X] T027 Create Hono app with global error handler, Zod validation, and middleware chain in `apps/api/src/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Admin Login (Priority: P1) 🎯 MVP

**Goal**: An admin can log in with email/password, see the dashboard, and log out.

**Independent Test**: Navigate to panel URL, enter admin credentials, verify dashboard access, log out.

### Tests for User Story 1

- [X] T028 [P] [US1] Unit test for Argon2id hash+verify in `apps/api/src/lib/argon2.spec.ts`
- [X] T029 [P] [US1] Unit test for token generation in `apps/api/src/lib/token.spec.ts`
- [ ] T030 [P] [US1] Integration test for login with valid credentials in `apps/api/src/routes/auth.spec.ts` (Testcontainers PostgreSQL)
- [ ] T031 [P] [US1] Integration test for login with invalid credentials in `apps/api/src/routes/auth.spec.ts` (Testcontainers PostgreSQL)
- [ ] T032 [P] [US1] Integration test for logout destroying session in `apps/api/src/routes/auth.spec.ts` (Testcontainers PostgreSQL)
- [ ] T033 [P] [US1] Integration test for /me endpoint with valid session in `apps/api/src/routes/auth.spec.ts` (Testcontainers PostgreSQL)
- [ ] T034 [P] [US1] E2E test for full login flow in `apps/panel/tests/e2e/login.spec.ts` (Playwright)

### Implementation for User Story 1

- [X] T035 [US1] Implement auth service login method in `apps/api/src/services/auth.service.ts` (verify password, create session, set cookie)
- [X] T036 [US1] Implement auth service logout method in `apps/api/src/services/auth.service.ts` (delete session, clear cookie)
- [X] T037 [US1] Implement auth service getCurrentUser method in `apps/api/src/services/auth.service.ts` (read session, return user)
- [X] T038 [US1] Create POST /api/auth/login route in `apps/api/src/routes/auth.ts` (validates LoginRequestSchema, calls auth service)
- [X] T039 [US1] Create POST /api/auth/logout route in `apps/api/src/routes/auth.ts` (requires auth, calls auth service)
- [X] T040 [US1] Create GET /api/auth/me route in `apps/api/src/routes/auth.ts` (requires auth, returns current user)
- [X] T041 [US1] Create admin seed script in `apps/api/src/scripts/seed-admin.ts` (creates initial admin, prints credentials)
- [X] T042 [US1] Create LoginForm component in `apps/panel/src/components/LoginForm.tsx` (email, password, submit, error display)
- [X] T043 [US1] Create login route page in `apps/panel/src/routes/login.tsx` (renders LoginForm, redirects on success)
- [X] T044 [US1] Create useAuth hook in `apps/panel/src/hooks/useAuth.ts` (login, logout, current user state via TanStack Query)
- [X] T045 [US1] Create dashboard route page in `apps/panel/src/routes/dashboard.tsx` (requires auth, shows placeholder stats, logout button)
- [X] T046 [US1] Configure TanStack Router with auth guard in `apps/panel/src/router.tsx` (redirect to /login if unauthenticated)

**Checkpoint**: Admin can log in, see dashboard, and log out. MVP is functional.

---

## Phase 4: User Story 2 - Admin Creates User Accounts (Priority: P2)

**Goal**: An admin can create, list, suspend, and unsuspend user accounts.

**Independent Test**: Login as admin, create a user, log out, login as new user, verify access.

### Tests for User Story 2

- [ ] T047 [P] [US2] Integration test for user creation in `apps/api/src/routes/users.spec.ts` (Testcontainers PostgreSQL)
- [ ] T048 [P] [US2] Integration test for user listing with pagination in `apps/api/src/routes/users.spec.ts` (Testcontainers PostgreSQL)
- [ ] T049 [P] [US2] Integration test for user suspension in `apps/api/src/routes/users.spec.ts` (Testcontainers PostgreSQL)
- [ ] T050 [P] [US2] Integration test for preventing self-suspension in `apps/api/src/routes/users.spec.ts` (Testcontainers PostgreSQL)
- [ ] T051 [P] [US2] Integration test for preventing last-admin suspension in `apps/api/src/routes/users.spec.ts` (Testcontainers PostgreSQL)
- [ ] T052 [P] [US2] Integration test for suspended user login rejection in `apps/api/src/routes/auth.spec.ts` (Testcontainers PostgreSQL)
- [ ] T053 [P] [US2] E2E test for user creation flow in `apps/panel/tests/e2e/users.spec.ts` (Playwright)

### Implementation for User Story 2

- [X] T054 [US2] Implement user service create method in `apps/api/src/services/user.service.ts` (validate, hash password, insert)
- [X] T055 [US2] Implement user service list method in `apps/api/src/services/user.service.ts` (paginated, searchable)
- [X] T056 [US2] Implement user service getById method in `apps/api/src/services/user.service.ts`
- [X] T057 [US2] Implement user service update method in `apps/api/src/services/user.service.ts` (status, role, email, username)
- [X] T058 [US2] Implement user service suspend method in `apps/api/src/services/user.service.ts` (with self/last-admin guards)
- [X] T059 [US2] Create POST /api/admin/users route in `apps/api/src/routes/users.ts` (admin-only, validates UserCreateSchema)
- [X] T060 [US2] Create GET /api/admin/users route in `apps/api/src/routes/users.ts` (admin-only, pagination)
- [X] T061 [US2] Create GET /api/admin/users/:id route in `apps/api/src/routes/users.ts` (admin-only)
- [X] T062 [US2] Create PATCH /api/admin/users/:id route in `apps/api/src/routes/users.ts` (admin-only, validates UserUpdateSchema)
- [X] T063 [US2] Create UserTable component in `apps/panel/src/components/UserTable.tsx` (paginated list with status badges)
- [X] T064 [US2] Create CreateUserForm component in `apps/panel/src/components/CreateUserForm.tsx` (email, username, password, role)
- [X] T065 [US2] Create users route page in `apps/panel/src/routes/users.tsx` (admin-only, renders UserTable + CreateUserForm)
- [X] T066 [US2] Add admin role guard to TanStack Router in `apps/panel/src/router.tsx` (redirect non-admins from /users)

**Checkpoint**: Admin can manage users. Users can log in with credentials given by admin.

---

## Phase 5: User Story 3 - Password Reset (Priority: P3)

**Goal**: A user can request a password reset via email and set a new password with a time-limited token.

**Independent Test**: Request reset, follow email link, set new password, login with new password.

### Tests for User Story 3

- [ ] T067 [P] [US3] Unit test for reset token generation and hashing in `apps/api/src/services/password.spec.ts`
- [ ] T068 [P] [US3] Integration test for forgot-password endpoint in `apps/api/src/routes/auth.spec.ts` (always returns 200, Testcontainers)
- [ ] T069 [P] [US3] Integration test for reset-password with valid token in `apps/api/src/routes/auth.spec.ts` (Testcontainers)
- [ ] T070 [P] [US3] Integration test for reset-password with expired token in `apps/api/src/routes/auth.spec.ts` (Testcontainers)
- [ ] T071 [P] [US3] Integration test for session revocation on password change in `apps/api/src/routes/auth.spec.ts` (Testcontainers)

### Implementation for User Story 3

- [X] T072 [US3] Implement password service createResetToken in `apps/api/src/services/password.service.ts` (invalidate old tokens, create new, hash SHA-256)
- [X] T073 [US3] Implement password service verifyResetToken in `apps/api/src/services/password.service.ts` (check hash, expiry, used_at)
- [X] T074 [US3] Implement password service resetPassword in `apps/api/src/services/password.service.ts` (verify token, hash new password, revoke all sessions, mark token used)
- [X] T075 [US3] Create email template for password reset in `apps/api/src/emails/password-reset.ts` (with reset link)
- [X] T076 [US3] Configure nodemailer SMTP client in `apps/api/src/lib/email.ts` (env-configurable)
- [X] T077 [US3] Create POST /api/auth/forgot-password route in `apps/api/src/routes/auth.ts` (always 200, sends email if user exists)
- [X] T078 [US3] Create POST /api/auth/reset-password route in `apps/api/src/routes/auth.ts` (validates PasswordResetSchema)
- [X] T079 [US3] Create ForgotPasswordForm component in `apps/panel/src/components/ForgotPasswordForm.tsx`
- [X] T080 [US3] Create ResetPasswordForm component in `apps/panel/src/components/ResetPasswordForm.tsx` (token from URL param)
- [X] T081 [US3] Create forgot-password route page in `apps/panel/src/routes/forgot-password.tsx`
- [X] T082 [US3] Create reset-password route page in `apps/panel/src/routes/reset-password.tsx`

**Checkpoint**: Password reset flow works end-to-end (requires SMTP configuration).

---

## Phase 6: User Story 4 - Two-Factor Authentication (Priority: P4)

**Goal**: A user can enable TOTP 2FA, requiring a 6-digit code at login.

**Independent Test**: Enable 2FA, log out, verify login requires TOTP code, use recovery code.

### Tests for User Story 4

- [ ] T083 [P] [US4] Unit test for TOTP secret encryption/decryption in `apps/api/src/lib/crypto.spec.ts`
- [ ] T084 [P] [US4] Unit test for recovery code hash/verify in `apps/api/src/services/totp.spec.ts`
- [ ] T085 [P] [US4] Integration test for 2FA enrollment flow in `apps/api/src/routes/auth.spec.ts` (Testcontainers)
- [ ] T086 [P] [US4] Integration test for 2FA login flow in `apps/api/src/routes/auth.spec.ts` (Testcontainers)
- [ ] T087 [P] [US4] Integration test for recovery code login in `apps/api/src/routes/auth.spec.ts` (Testcontainers)
- [ ] T088 [P] [US4] Integration test for 2FA disable in `apps/api/src/routes/auth.spec.ts` (Testcontainers)

### Implementation for User Story 4

- [X] T089 [US4] Create AES-256-GCM crypto wrapper in `apps/api/src/lib/crypto.ts` (encrypt/decrypt TOTP secrets with APP_SECRET)
- [X] T090 [US4] Install and configure @otplib/preset-default for TOTP generation/verification in `apps/api/src/lib/totp.ts`
- [X] T091 [US4] Implement TOTP service enable in `apps/api/src/services/totp.service.ts` (generate secret, encrypt, generate recovery codes, return QR URI)
- [X] T092 [US4] Implement TOTP service verify in `apps/api/src/services/totp.service.ts` (verify code, set totp_enabled=true)
- [X] T093 [US4] Implement TOTP service disable in `apps/api/src/services/totp.service.ts` (require password, clear secret and recovery codes)
- [X] T094 [US4] Implement TOTP service verifyCode in `apps/api/src/services/totp.service.ts` (for login 2FA step)
- [X] T095 [US4] Implement TOTP service verifyRecoveryCode in `apps/api/src/services/totp.service.ts` (consume one recovery code)
- [X] T096 [US4] Update auth service login to return 2fa_required challenge when 2FA enabled in `apps/api/src/services/auth.service.ts`
- [X] T097 [US4] Implement auth service verify2fa method in `apps/api/src/services/auth.service.ts` (verify TOTP or recovery code, create session)
- [X] T098 [US4] Create POST /api/auth/login/2fa route in `apps/api/src/routes/auth.ts`
- [X] T099 [US4] Create POST /api/auth/2fa/enable route in `apps/api/src/routes/auth.ts` (requires auth)
- [X] T100 [US4] Create POST /api/auth/2fa/verify route in `apps/api/src/routes/auth.ts` (requires auth, activates 2FA)
- [X] T101 [US4] Create POST /api/auth/2fa/disable route in `apps/api/src/routes/auth.ts` (requires auth + password)
- [X] T102 [US4] Create TotpSetup component in `apps/panel/src/components/TotpSetup.tsx` (QR code, code input, recovery codes display)
- [X] T103 [US4] Create TwoFactorPrompt component in `apps/panel/src/components/TwoFactorPrompt.tsx` (code input, recovery code option)
- [X] T104 [US4] Create security settings route page in `apps/panel/src/routes/security.tsx` (enable/disable 2FA)
- [X] T105 [US4] Update login flow to handle 2fa_required status in `apps/panel/src/hooks/useAuth.ts`

**Checkpoint**: 2FA enrollment and verification works with standard authenticator apps.

---

## Phase 7: User Story 5 - API Keys with Scoped Permissions (Priority: P5)

**Goal**: A user can create scoped API keys and use them for programmatic access.

**Independent Test**: Create an API key, make a curl request with it, verify response, revoke it, verify rejection.

### Tests for User Story 5

- [ ] T106 [P] [US5] Unit test for API key generation and hashing in `apps/api/src/services/api-key.spec.ts`
- [ ] T107 [P] [US5] Integration test for API key creation in `apps/api/src/routes/api-keys.spec.ts` (Testcontainers)
- [ ] T108 [P] [US5] Integration test for API key listing in `apps/api/src/routes/api-keys.spec.ts` (Testcontainers)
- [ ] T109 [P] [US5] Integration test for API key revocation in `apps/api/src/routes/api-keys.spec.ts` (Testcontainers)
- [ ] T110 [P] [US5] Integration test for API key authentication in `apps/api/src/middleware/auth.spec.ts` (Testcontainers)
- [ ] T111 [P] [US5] Integration test for API key scope enforcement in `apps/api/src/middleware/auth.spec.ts` (Testcontainers)

### Implementation for User Story 5

- [X] T112 [US5] Implement API key service generate in `apps/api/src/services/api-key.service.ts` (create sigil_ key, SHA-256 hash, store hash+prefix)
- [X] T113 [US5] Implement API key service list in `apps/api/src/services/api-key.service.ts` (return keys without hash, only prefix)
- [X] T114 [US5] Implement API key service verify in `apps/api/src/services/api-key.service.ts` (hash incoming, lookup, update last_used_at)
- [X] T115 [US5] Implement API key service revoke in `apps/api/src/services/api-key.service.ts` (delete by id+user_id)
- [X] T116 [US5] Create POST /api/api-keys route in `apps/api/src/routes/api-keys.ts` (validates ApiKeyCreateSchema, returns full key once)
- [X] T117 [US5] Create GET /api/api-keys route in `apps/api/src/routes/api-keys.ts` (list current user's keys)
- [X] T118 [US5] Create DELETE /api/api-keys/:id route in `apps/api/src/routes/api-keys.ts` (revoke key)
- [X] T119 [US5] Update auth middleware to support API key Bearer auth in `apps/api/src/middleware/auth.ts` (extract, hash, verify, set ctx.apiKeyScopes)
- [X] T120 [US5] Create scope enforcement helper in `apps/api/src/middleware/require-scopes.ts` (check ctx.apiKeyScopes against required scopes)
- [X] T121 [US5] Create ApiKeyManager component in `apps/panel/src/components/ApiKeyManager.tsx` (create form, list, revoke, one-time key display)
- [X] T122 [US5] Create api-keys route page in `apps/panel/src/routes/api-keys.tsx` (requires auth, renders ApiKeyManager)

**Checkpoint**: API keys can be created, used with scoped permissions, and revoked.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T123 [P] Add audit log entries for all auth events (login, logout, user create, suspend, 2FA enable/disable, API key create/revoke) in `apps/api/src/services/audit.service.ts`
- [X] T124 [P] Add session cleanup job to delete expired sessions in `apps/api/src/scripts/cleanup-sessions.ts`
- [X] T125 [P] Add input sanitization middleware to trim and lowercase emails in `apps/api/src/middleware/sanitize.ts`
- [X] T126 [P] Add security headers middleware (CSP, X-Frame-Options, X-Content-Type-Options) in `apps/api/src/middleware/security-headers.ts`
- [X] T127 [P] Add error response standardization in `apps/api/src/lib/errors.ts` (consistent JSON error format)
- [X] T128 [P] Add loading and error states to all panel pages in `apps/panel/src/components/LoadingState.tsx` and `apps/panel/src/components/ErrorState.tsx`
- [ ] T129 [P] Add form validation with Zod schemas in panel forms (login, create user, forgot password, reset password, 2FA, API keys)
- [ ] T130 Run full test suite and fix any failures: `pnpm test`, `pnpm typecheck`, `pnpm lint`
- [ ] T131 Run quickstart.md validation scenarios and verify all pass
- [X] T132 [P] Add panel layout with navigation sidebar in `apps/panel/src/components/Layout.tsx` (dashboard, users, security, api-keys, logout)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 (P1) blocks nothing - can start immediately after Foundational
  - US2 (P2) depends on US1 (uses auth middleware from US1)
  - US3 (P3) depends on US1 (uses auth service and email config)
  - US4 (P4) depends on US1 (modifies login flow in auth service)
  - US5 (P5) depends on US1 (uses auth middleware)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after US1 - Uses auth middleware and admin role guard from US1
- **User Story 3 (P3)**: Can start after US1 - Uses auth service from US1
- **User Story 4 (P4)**: Can start after US1 - Modifies auth service login flow from US1
- **User Story 5 (P5)**: Can start after US1 - Uses auth middleware from US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/schemas before services
- Services before routes/endpoints
- API routes before UI components
- Core implementation before integration

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002-T008)
- All Foundational schema tasks marked [P] can run in parallel (T010-T012, T016-T022)
- All test tasks within a story marked [P] can run in parallel
- US3, US4, US5 can start in parallel after US1 completes (if team capacity allows)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for Argon2id in apps/api/src/lib/argon2.spec.ts"
Task: "Unit test for token generation in apps/api/src/lib/token.spec.ts"
Task: "Integration test for login in apps/api/src/routes/auth.spec.ts"

# Launch all independent implementation tasks:
Task: "Implement auth service in apps/api/src/services/auth.service.ts"
Task: "Create LoginForm component in apps/panel/src/components/LoginForm.tsx"
Task: "Create useAuth hook in apps/panel/src/hooks/useAuth.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test login flow end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Polish phase → Final hardening

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (blocks others briefly)
3. Once US1 is done:
   - Developer A: User Story 2
   - Developer B: User Story 3
   - Developer C: User Story 4
   - Developer D: User Story 5
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Security-sensitive code (auth, password hashing, tokens) MUST have tests per Constitution Principle IV
