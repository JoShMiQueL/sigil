# API Contracts: Members & Permissions

## Panel REST Endpoints

All endpoints require authentication. Admins bypass all permission checks. Non-admin users must be a member of the server with the required permission.

### Member Management

#### List Members
```
GET /api/admin/servers/:serverId/members
Auth: admin OR member with `members` permission
Response 200: { members: Member[], total: number }
Response 403: FORBIDDEN
Response 404: SERVER_NOT_FOUND
```

#### Add Member
```
POST /api/admin/servers/:serverId/members
Auth: admin OR member with `members` permission
Body: AddMemberInputSchema { email, permissions }
Response 201: Member
Response 400: INVALID_EMAIL | USER_NOT_FOUND | DUPLICATE_MEMBER
Response 403: FORBIDDEN
Response 404: SERVER_NOT_FOUND
```

#### Update Member Permissions
```
PUT /api/admin/servers/:serverId/members/:memberId
Auth: admin OR member with `members` permission
Body: UpdateMemberPermissionsInputSchema { permissions }
Response 200: Member
Response 403: FORBIDDEN | CANNOT_MODIFY_OWNER
Response 404: SERVER_NOT_FOUND | MEMBER_NOT_FOUND
```

#### Remove Member
```
DELETE /api/admin/servers/:serverId/members/:memberId
Auth: admin OR member with `members` permission
Response 204: (empty)
Response 403: FORBIDDEN | CANNOT_REMOVE_OWNER
Response 404: SERVER_NOT_FOUND | MEMBER_NOT_FOUND
```

#### Transfer Ownership
```
POST /api/admin/servers/:serverId/members/transfer
Auth: admin OR owner
Body: TransferOwnershipInputSchema { newOwnerId }
Response 200: { message: string }
Response 403: FORBIDDEN | NOT_OWNER
Response 404: SERVER_NOT_FOUND | MEMBER_NOT_FOUND
Response 409: ALREADY_OWNER
```

### Server List (Modified)

#### List Servers
```
GET /api/admin/servers
Auth: any authenticated user
Response 200: { servers: ServerRecord[] }
- Admins: returns all servers
- Non-admins: returns only servers where user is a member
```

### Server Detail (Modified)

#### Get Server
```
GET /api/admin/servers/:serverId
Auth: admin OR member of this server
Response 200: ServerRecord
Response 403: FORBIDDEN
Response 404: SERVER_NOT_FOUND
```

### Permission-Gated Routes (Modified)

The following existing routes change from admin-only to permission-aware:

| Route | Required Permission |
|-------|-------------------|
| `POST /servers/:serverId/console-token` | `console` |
| `POST /servers/:serverId/power` | `power` |
| `GET /servers/:serverId/files` | `files` |
| `POST /servers/:serverId/files/read` | `files` |
| `POST /servers/:serverId/files/write` | `files` |
| `POST /servers/:serverId/files` (upload) | `files` |
| `DELETE /servers/:serverId/files` | `files` |
| `GET /servers/:serverId/backups` | `backups` |
| `POST /servers/:serverId/backups` | `backups` |
| `POST /servers/:serverId/backups/:id/restore` | `backups` |
| `DELETE /servers/:serverId/backups/:id` | `backups` |
| `DELETE /servers/:serverId` (delete server) | admin only (not delegatable) |
| `POST /servers` (create server) | admin only (not delegatable) |

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `FORBIDDEN` | 403 | User lacks required permission |
| `SERVER_NOT_FOUND` | 404 | Server does not exist |
| `MEMBER_NOT_FOUND` | 404 | Member entry does not exist |
| `USER_NOT_FOUND` | 400 | Invited email has no registered user |
| `DUPLICATE_MEMBER` | 400 | User is already a member of this server |
| `INVALID_EMAIL` | 400 | Email format is invalid |
| `CANNOT_REMOVE_OWNER` | 403 | Owner cannot be removed |
| `CANNOT_MODIFY_OWNER` | 403 | Owner permissions cannot be modified |
| `NOT_OWNER` | 403 | Only owner can transfer ownership |
| `ALREADY_OWNER` | 409 | Target user is already the owner |

## Audit Actions

| Action | Trigger |
|--------|---------|
| `member_add` | Member added to server |
| `member_update` | Member permissions updated |
| `member_remove` | Member removed from server |
| `member_transfer` | Ownership transferred |
