# Data Model: Members & Permissions

## New Table: `server_members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Member entry ID |
| `server_id` | uuid | FK → servers.id, NOT NULL, ON DELETE CASCADE | The server this membership applies to |
| `user_id` | uuid | FK → users.id, NOT NULL, ON DELETE CASCADE | The user who is a member |
| `role` | text | NOT NULL, default `'member'` | `owner` or `member` |
| `can_console` | boolean | NOT NULL, default `false` | Send console commands, view output |
| `can_files` | boolean | NOT NULL, default `false` | Browse, read, write, upload, download, delete files |
| `can_backups` | boolean | NOT NULL, default `false` | Create, restore, delete backups |
| `can_power` | boolean | NOT NULL, default `false` | Start, stop, restart server |
| `can_settings` | boolean | NOT NULL, default `false` | View/edit server settings |
| `can_members` | boolean | NOT NULL, default `false` | Add, remove, update members |
| `can_allocations` | boolean | NOT NULL, default `false` | View, manage allocations |
| `can_databases` | boolean | NOT NULL, default `false` | View, manage databases |
| `created_at` | timestamptz | NOT NULL, default `now()` | When membership was created |
| `updated_at` | timestamptz | NOT NULL, default `now()` | Last permission update |

**Indexes**:
- `UNIQUE (server_id, user_id)` — prevents duplicate memberships
- `INDEX (user_id)` — fast lookup of a user's servers
- `INDEX (server_id)` — fast lookup of a server's members

## State Machine

```text
[No membership] → [Member] → [Owner (via transfer)]
                         ↑                    │
                         └────────────────────┘
                         (owner can demote self after transfer)
```

- Adding a member creates a `member` role entry with the specified permissions
- The server creator gets `owner` role with all permissions at creation time
- Ownership transfer: old owner becomes `member`, new owner becomes `owner`
- Removal: deletes the member entry entirely

## Validation Rules

- `role` must be `owner` or `member`
- At least one `owner` must exist per server at all times
- A user can only be added as a member if they have an active account
- Permission bits are independent — no implicit dependencies
- Owner implicitly has all permissions regardless of bit values

## Shared Schemas (Zod)

```typescript
// Permission bit names
export const PERMISSIONS = [
  "console", "files", "backups", "power",
  "settings", "members", "allocations", "databases"
] as const;

// Member schema
MemberSchema = {
  id: string (uuid),
  serverId: string (uuid),
  userId: string (uuid),
  username: string,
  email: string,
  role: "owner" | "member",
  permissions: {
    console: boolean,
    files: boolean,
    backups: boolean,
    power: boolean,
    settings: boolean,
    members: boolean,
    allocations: boolean,
    databases: boolean,
  },
  createdAt: string (iso),
  updatedAt: string (iso),
}

// Input schemas
AddMemberInputSchema = {
  email: string (email),
  permissions: {
    console: boolean,
    files: boolean,
    backups: boolean,
    power: boolean,
    settings: boolean,
    members: boolean,
    allocations: boolean,
    databases: boolean,
  },
}

UpdateMemberPermissionsInputSchema = {
  permissions: { ...same as above },
}

TransferOwnershipInputSchema = {
  newOwnerId: string (uuid),
}
```

## No Changes to Existing Tables

- `servers` — no changes (owner is tracked via `server_members` with `role = 'owner'`)
- `users` — no changes (role remains `admin` or `user`)
- `audit_logs` — no schema changes (new action types only)
