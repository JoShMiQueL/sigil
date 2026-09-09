# Feature Specification: User Authentication & Management

**Feature Branch**: `001-user-auth`

**Created**: 2026-09-09

**Status**: Draft

**Input**: Parent roadmap: `ROADMAP.md` → entry **R1**. Authentication and user management — login, registration, roles, sessions

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Login (Priority: P1)

An administrator opens the panel URL in their browser, enters their email and password, and is authenticated into the panel. They see the admin dashboard with system statistics (total servers, users, nodes). They can log out from any page.

**Why this priority**: Without authentication, no other feature can be accessed. This is the absolute foundation — the panel is useless if nobody can log in.

**Independent Test**: Can be fully tested by navigating to the panel URL, entering admin credentials, and verifying access to the dashboard. Delivers a working login flow.

**Acceptance Scenarios**:

1. **Given** the panel is installed and an admin account exists, **When** the admin navigates to the panel URL, **Then** they see a login form with email and password fields.
2. **Given** the login form is displayed, **When** the admin enters valid credentials and submits, **Then** they are redirected to the admin dashboard and a session is established.
3. **Given** the admin enters invalid credentials, **When** they submit the form, **Then** they see an error message "Invalid email or password" without revealing which field is wrong.
4. **Given** the admin is logged in, **When** they click "Log out", **Then** their session is destroyed and they are redirected to the login form.
5. **Given** the admin is logged in, **When** they close the browser and reopen it, **Then** their session persists (cookie-based, with expiration).

---

### User Story 2 - Admin Creates User Accounts (Priority: P2)

An administrator creates a new user account from the admin panel. They enter the user's email, username, and initial password. The user receives their credentials and can log in. The admin can list all users, view their details, and deactivate accounts.

**Why this priority**: A panel with only one admin is limited. Multi-user support is needed before servers can be assigned to owners.

**Independent Test**: Can be tested by logging in as admin, creating a user, logging out, and logging in as the new user.

**Acceptance Scenarios**:

1. **Given** the admin is logged in, **When** they navigate to Users and click "Create user", **Then** they see a form with email, username, and password fields.
2. **Given** the create user form is displayed, **When** the admin fills it with valid data and submits, **Then** a new user account is created and appears in the user list.
3. **Given** a user exists, **When** the admin clicks "Deactivate" on that user, **Then** the user can no longer log in but their data is preserved.
4. **Given** a deactivated user, **When** they try to log in, **Then** they see "Account suspended" and are not authenticated.
5. **Given** the admin is logged in, **When** they view the user list, **Then** they see all users with their status (active/suspended), role, and server count.

---

### User Story 3 - Password Reset (Priority: P3)

A user who forgot their password can request a reset via email. They receive a link with a time-limited token, click it, and set a new password. The old password stops working immediately.

**Why this priority**: Password resets are essential for production use but not required for the initial MVP. Users can be given their password by an admin in the earliest stage.

**Independent Test**: Can be tested by requesting a reset, following the email link, setting a new password, and logging in with it.

**Acceptance Scenarios**:

1. **Given** the login form is displayed, **When** the user clicks "Forgot password", **Then** they see a form to enter their email.
2. **Given** the user enters their email, **When** they submit, **Then** a reset email is sent and they see "Check your email for a reset link."
3. **Given** the user receives the email, **When** they click the reset link within the validity period, **Then** they see a form to enter a new password.
4. **Given** the user enters a new password, **When** they submit, **Then** their password is updated and all existing sessions for that user are revoked.
5. **Given** the reset link has expired, **When** the user clicks it, **Then** they see "This link has expired" and can request a new one.

---

### User Story 4 - Two-Factor Authentication (Priority: P4)

A user can enable TOTP-based 2FA on their account. After enabling, login requires both password and a 6-digit code from their authenticator app. Recovery codes are provided for backup access.

**Why this priority**: 2FA is important for security but is not required for the initial MVP. It becomes critical when the panel is exposed to the internet with multiple admins.

**Independent Test**: Can be tested by enabling 2FA, logging out, and verifying that login requires the TOTP code.

**Acceptance Scenarios**:

1. **Given** the user is logged in, **When** they navigate to Security settings and click "Enable 2FA", **Then** a QR code is displayed for their authenticator app.
2. **Given** the QR code is displayed, **When** the user scans it and enters a valid 6-digit code to confirm, **Then** 2FA is enabled and recovery codes are displayed once.
3. **Given** 2FA is enabled, **When** the user logs in with valid email and password, **Then** they are prompted for a 6-digit TOTP code before being authenticated.
4. **Given** 2FA is enabled and the user enters a valid TOTP code at login, **When** they submit, **Then** they are authenticated and redirected to the dashboard.
5. **Given** the user loses their device, **When** they use a recovery code at the TOTP prompt, **Then** they are authenticated and that recovery code is consumed.

---

### User Story 5 - API Keys with Scoped Permissions (Priority: P5)

A user can create API keys to automate interactions with the panel. Each key has a scope (e.g., "read servers", "control power") and can be revoked at any time. API keys authenticate via Bearer token.

**Why this priority**: API keys enable automation and integrations (billing systems, monitoring). Important for production but not needed for the initial MVP.

**Independent Test**: Can be tested by creating an API key, making a curl request with it, and verifying the response.

**Acceptance Scenarios**:

1. **Given** the user is logged in, **When** they navigate to API Keys and click "Create key", **Then** they see a form to name the key and select scopes.
2. **Given** the create key form is displayed, **When** the user selects scopes and submits, **Then** an API key is generated and displayed once (not shown again).
3. **Given** an API key exists, **When** a request is made with `Authorization: Bearer <key>`, **Then** the request is authenticated and scoped to the key's permissions.
4. **Given** an API key exists, **When** the user clicks "Revoke", **Then** the key immediately stops working for all future requests.
5. **Given** an API key with "read" scope only, **When** a write request is made with that key, **Then** the request is rejected with "Insufficient permissions."

---

### Edge Cases

- What happens when a user enters the wrong password 5 times in a row? Rate limiting kicks in — the account is temporarily locked for 15 minutes.
- What happens when an admin tries to deactivate their own account? The action is refused — an admin cannot deactivate themselves.
- What happens when the last admin tries to deactivate themselves? The action is refused — there must always be at least one active admin.
- What happens when a session token is tampered with? The token is rejected and the request is treated as unauthenticated.
- What happens when a user's email is already in use during creation? The form shows "This email is already registered."
- What happens when 2FA is enabled but the user enters an invalid TOTP code 5 times? Rate limiting kicks in — the account is temporarily locked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users with email and password.
- **FR-002**: System MUST establish a session cookie upon successful authentication, with a configurable expiration.
- **FR-003**: System MUST destroy the session upon logout.
- **FR-004**: System MUST reject login attempts with invalid credentials without revealing which field is incorrect.
- **FR-005**: System MUST support three user roles: `admin` (full panel access), `user` (server owner), and `member` (limited access to specific servers).
- **FR-006**: System MUST allow admins to create, list, view, suspend, and unsuspend user accounts.
- **FR-007**: System MUST prevent the last active admin from being suspended or deleted.
- **FR-008**: System MUST prevent an admin from suspending their own account.
- **FR-009**: System MUST support password reset via time-limited email tokens (single-use, expiring after 1 hour).
- **FR-010**: System MUST revoke all existing sessions for a user when their password is reset or changed.
- **FR-011**: System MUST support TOTP-based two-factor authentication using standard authenticator apps.
- **FR-012**: System MUST provide one-time recovery codes when 2FA is enabled, consumable individually at the TOTP prompt.
- **FR-013**: System MUST support API key creation with scoped permissions (read, control, files, databases, backups, allocations, settings, users).
- **FR-014**: System MUST authenticate API key requests via Bearer token and enforce the key's scope.
- **FR-015**: System MUST allow immediate revocation of any API key.
- **FR-016**: System MUST rate-limit login attempts: maximum 5 failed attempts per account per 15 minutes.
- **FR-017**: System MUST hash passwords using a modern memory-hard algorithm (Argon2).
- **FR-018**: System MUST redact passwords, tokens, and recovery codes from all logs.

### Key Entities *(include if feature involves data)*

- **User**: A registered person with email, username, hashed password, role (admin/user), status (active/suspended), 2FA secret, and timestamps. Owns servers and API keys.
- **Session**: An active authentication session for a user, with a token, IP address, user agent, creation time, and expiration.
- **ApiKey**: A scoped authentication token for API access, with a name, scopes, hashed key, owner, creation time, and last-used time.
- **PasswordResetToken**: A single-use token for password recovery, with the user reference, token hash, creation time, and expiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete login in under 10 seconds (enter credentials + submit + redirect).
- **SC-002**: Admin can create a new user account in under 30 seconds.
- **SC-003**: Password reset flow completes in under 2 minutes (request + email + new password).
- **SC-004**: 2FA enrollment completes in under 1 minute (QR scan + verify).
- **SC-005**: 100 concurrent login attempts do not degrade response time beyond 2 seconds.
- **SC-006**: Brute-force protection activates after 5 failed attempts, blocking further attempts for 15 minutes.
- **SC-007**: API key authentication adds less than 50ms overhead to request processing.

## Assumptions

- The panel is deployed behind HTTPS (TLS termination at reverse proxy). The application does not handle TLS itself.
- Email delivery is handled by an external SMTP service (configurable via environment variables).
- The initial admin account is created during installation (via installer script or seed), not via self-registration.
- Self-registration is disabled by default. Admins create all user accounts. This can be changed in settings.
- Passwords must be at least 8 characters. No complexity rules enforced — length is the primary requirement.
- Session expiration defaults to 24 hours of inactivity, configurable in panel settings.
- API keys are prefixed with `sigil_` for identification.
- Recovery codes are 10 single-use codes, each 24 characters, displayed once at 2FA enrollment.
