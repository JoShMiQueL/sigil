# Quickstart: Members & Permissions

## Prerequisites

- Docker running (for Testcontainers)
- Dev services started: `bun dev:services`
- Database migrated: `bun --filter @sigil/db db:migrate`
- Admin seeded: `bun --filter @sigil/api db:seed`
- API + panel running: `bun dev`

## Scenario 1: Add a member to a server

```bash
# 1. Create a test user (non-admin)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"subuser@test.local","username":"subuser","password":"subuser123"}'

# 2. Login as admin
ADMIN_COOKIE=$(curl -s -c - http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigil.local","password":"admin12345"}' | grep sigil_session | awk '{print $NF}')

# 3. Create a server (or use existing serverId)
SERVER_ID=$(curl -s http://localhost:3000/api/admin/servers \
  -H "Content-Type: application/json" \
  -H "Cookie: $ADMIN_COOKIE" \
  -d '{"name":"test-server","nodeId":"<node-id>","templateId":"<template-id>","variables":{}}' | jq -r '.id')

# 4. Add subuser as member with console + files permissions
curl -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/members \
  -H "Content-Type: application/json" \
  -H "Cookie: $ADMIN_COOKIE" \
  -d '{
    "email": "subuser@test.local",
    "permissions": {
      "console": true, "files": true,
      "backups": false, "power": false,
      "settings": false, "members": false,
      "allocations": false, "databases": false
    }
  }'

# Expected: 201 with member object including permissions
```

## Scenario 2: Subuser accesses server

```bash
# 1. Login as subuser
SUBUSER_COOKIE=$(curl -s -c - http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"subuser@test.local","password":"subuser123"}' | grep sigil_session | awk '{print $NF}')

# 2. List servers — should only see assigned server
curl http://localhost:3000/api/admin/servers \
  -H "Cookie: $SUBUSER_COOKIE"
# Expected: 200 with only the server the subuser is a member of

# 3. Try to access backups (no permission) — should get 403
curl http://localhost:3000/api/admin/servers/$SERVER_ID/backups \
  -H "Cookie: $SUBUSER_COOKIE"
# Expected: 403 FORBIDDEN
```

## Scenario 3: Update and remove permissions

```bash
# 1. Grant backups permission
MEMBER_ID="<from scenario 1>"
curl -X PUT http://localhost:3000/api/admin/servers/$SERVER_ID/members/$MEMBER_ID \
  -H "Content-Type: application/json" \
  -H "Cookie: $ADMIN_COOKIE" \
  -d '{"permissions":{"console":true,"files":true,"backups":true,"power":false,"settings":false,"members":false,"allocations":false,"databases":false}}'

# 2. Verify subuser can now access backups
curl http://localhost:3000/api/admin/servers/$SERVER_ID/backups \
  -H "Cookie: $SUBUSER_COOKIE"
# Expected: 200

# 3. Remove member
curl -X DELETE http://localhost:3000/api/admin/servers/$SERVER_ID/members/$MEMBER_ID \
  -H "Cookie: $ADMIN_COOKIE"
# Expected: 204

# 4. Verify subuser can no longer see the server
curl http://localhost:3000/api/admin/servers \
  -H "Cookie: $SUBUSER_COOKIE"
# Expected: 200 with empty server list
```

## Scenario 4: Transfer ownership

```bash
# 1. Add a new member
curl -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/members \
  -H "Content-Type: application/json" \
  -H "Cookie: $ADMIN_COOKIE" \
  -d '{"email":"subuser@test.local","permissions":{"console":true,"files":true,"backups":true,"power":true,"settings":true,"members":true,"allocations":true,"databases":true}}'

# 2. Transfer ownership
MEMBER_ID="<from step 1>"
curl -X POST http://localhost:3000/api/admin/servers/$SERVER_ID/members/transfer \
  -H "Content-Type: application/json" \
  -H "Cookie: $ADMIN_COOKIE" \
  -d '{"newOwnerId":"<member-user-id>"}'
# Expected: 200

# 3. Verify new owner cannot be removed
curl -X DELETE http://localhost:3000/api/admin/servers/$SERVER_ID/members/$MEMBER_ID \
  -H "Cookie: $ADMIN_COOKIE"
# Expected: 403 CANNOT_REMOVE_OWNER
```

## MCP Browser Verification

1. Login as admin at http://localhost:5173
2. Navigate to a server detail page
3. Verify "Members" section appears
4. Add a member by entering their email and selecting permissions
5. Verify the member appears in the list with correct permissions
6. Update permissions and verify changes persist
7. Remove the member and verify they disappear from the list
8. Login as the subuser and verify they only see their assigned server
9. Verify the subuser can only see tabs/actions they have permission for
