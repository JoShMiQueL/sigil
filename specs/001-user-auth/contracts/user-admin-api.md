# Contract: User Admin API

**Feature**: 001-user-auth
**Base path**: `/api/admin/users`

All endpoints require `admin` role. All request bodies validated against Zod schemas from `@sigil/shared`.

## GET /api/admin/users

List all users with pagination.

**Query params**: `page` (default 1), `perPage` (default 20, max 100), `search` (optional, matches email or username)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "username": "user",
      "role": "user",
      "status": "active",
      "totpEnabled": false,
      "createdAt": "2026-09-09T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

## POST /api/admin/users

Create a new user account.

**Request**: `UserCreateSchema`
```json
{
  "email": "new@example.com",
  "username": "newuser",
  "password": "initialpassword",
  "role": "user"
}
```

**Response 201**: `UserSchema` (public fields)
**Response 400**: validation error or email/username already taken
**Response 403**: not admin

## GET /api/admin/users/:id

Get a single user's details.

**Response 200**: `UserSchema` (public fields + server count)
**Response 404`: user not found

## PATCH /api/admin/users/:id

Update a user. Partial update — only provided fields are changed.

**Request**: `UserUpdateSchema`
```json
{
  "status": "suspended",
  "role": "user",
  "email": "newemail@example.com",
  "username": "newusername"
}
```

**Response 200**: updated `UserSchema`
**Response 400**: validation error
**Response 403**: attempting to suspend self or last admin
**Response 404`: user not found

## DELETE /api/admin/users/:id

Delete a user account. Refused if the user is the last admin or if the user owns servers (must transfer or delete servers first).

**Response 200**: `{"status": "ok"}`
**Response 403`: cannot delete (last admin, owns servers, or self)
**Response 404`: user not found
