# Contract: Auth API

**Feature**: 001-user-auth
**Base path**: `/api/auth`

All requests and responses are JSON. All request bodies are validated against Zod schemas from `@sigil/shared`. All responses use standard HTTP status codes.

## POST /api/auth/login

Authenticate with email and password. If 2FA is enabled, returns a `2fa_required` status instead of a session.

**Request**: `LoginRequestSchema`
```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

**Response 200** (no 2FA): `LoginResponseSchema`
```json
{
  "status": "ok",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "username": "admin",
    "role": "admin"
  }
}
```

**Response 200** (2FA enabled): `LoginResponseSchema`
```json
{
  "status": "2fa_required",
  "challenge": "uuid"
}
```

**Response 401**: invalid credentials
```json
{
  "error": "Invalid email or password"
}
```

**Response 429**: rate limited
```json
{
  "error": "Too many attempts. Try again in 15 minutes."
}
```

Sets `Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400` on success (no 2FA).

## POST /api/auth/login/2fa

Complete login with TOTP code or recovery code. Uses the challenge from the 2FA login response.

**Request**: `TotpVerifySchema`
```json
{
  "challenge": "uuid",
  "code": "123456"
}
```

**Response 200**: same as login success (sets session cookie)
**Response 401**: invalid code
**Response 429**: rate limited

## POST /api/auth/logout

Destroy the current session. Requires authentication.

**Request**: none (session from cookie)
**Response 200**: `{"status": "ok"}`
**Response 401**: not authenticated

## GET /api/auth/me

Get the currently authenticated user.

**Request**: none (session from cookie)
**Response 200**: `UserSchema` (public fields only)
**Response 401**: not authenticated

## POST /api/auth/forgot-password

Request a password reset email. Always returns 200 regardless of whether the email exists (prevent email enumeration).

**Request**: `PasswordResetRequestSchema`
```json
{
  "email": "user@example.com"
}
```

**Response 200**: `{"status": "ok"}`

## POST /api/auth/reset-password

Set a new password using a reset token. Revokes all sessions for the user.

**Request**: `PasswordResetSchema`
```json
{
  "token": "reset_token_string",
  "password": "newpassword123"
}
```

**Response 200**: `{"status": "ok"}`
**Response 400`: token expired or invalid

## POST /api/auth/2fa/enable

Start 2FA enrollment. Returns a TOTP secret and QR code URI. Requires authentication. Does not activate 2FA until verified.

**Request**: none
**Response 200**:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrUri": "otpauth://totp/SigilPanel:admin@example.com?secret=...",
  "recoveryCodes": ["code1", "code2", ...]
}
```

## POST /api/auth/2fa/verify

Confirm 2FA enrollment with a valid TOTP code. Activates 2FA.

**Request**: `{"code": "123456"}`
**Response 200**: `{"status": "ok"}`
**Response 401`: invalid code

## POST /api/auth/2fa/disable

Disable 2FA. Requires the current password.

**Request**: `{"password": "current_password"}`
**Response 200**: `{"status": "ok"}`
**Response 401`: invalid password
