# Data Model: Allocations

## New Table: `allocations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Unique allocation ID |
| `node_id` | UUID | NOT NULL, FK → `nodes(id)` ON DELETE CASCADE | Node this allocation belongs to |
| `ip` | TEXT | NOT NULL | IPv4 or IPv6 address |
| `port` | INTEGER | NOT NULL, CHECK (1-65535) | Port number |
| `protocol` | TEXT | NOT NULL, default `'tcp'`, CHECK (`tcp` or `udp`) | Protocol |
| `status` | TEXT | NOT NULL, default `'available'`, CHECK (`available` or `assigned`) | Assignment status |
| `server_id` | UUID | NULLABLE, FK → (future servers table) | Server this allocation is assigned to |
| `is_primary` | BOOLEAN | NOT NULL, default `false` | Whether this is the server's primary allocation |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Last update timestamp |

**Unique constraint**: `(node_id, ip, port, protocol)` — no duplicate allocations on the same node.

**Indexes**:
- `(node_id, status)` — fast status filtering
- `(node_id, ip)` — fast IP filtering
- `(node_id, port)` — fast port search
- `(server_id)` — fast lookup by server (for release on delete)

## Modified Table: `nodes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `primary_ip` | TEXT | NULLABLE | Preferred IP for auto-assignment. NULL = use any available. |

**Migration**: Add `primary_ip` column to existing `nodes` table.

## State Transitions

```
                    ┌──────────┐
                    │ available │
                    └─────┬────┘
                          │ assign(serverId)
                          ▼
                    ┌──────────┐
                    │ assigned │
                    └─────┬────┘
                          │ release()
                          ▼
                    ┌──────────┐
                    │ available │
                    └──────────┘
```

- `available` → `assigned`: when an admin assigns an allocation to a server (sets `server_id`, `is_primary`, `status = 'assigned'`)
- `assigned` → `available`: when a server is deleted or an allocation is unassigned (sets `server_id = NULL`, `is_primary = false`, `status = 'available'`)
- Allocations cannot be "partially assigned" — an allocation is either available or assigned to exactly one server.

## Validation Rules

- `ip`: valid IPv4 or IPv6 format (Zod refinement)
- `port`: integer 1-65535
- `protocol`: `tcp` or `udp`
- `status`: `available` or `assigned`
- When `status = 'available'`, `server_id` MUST be NULL
- When `status = 'assigned'`, `server_id` MUST NOT be NULL
- `is_primary` can only be `true` when `status = 'assigned'`
- At most one `is_primary = true` allocation per server

## Relationships

```
nodes 1 ──────── ∞ allocations
                    │
                    └──── 0..1 servers (via server_id, future R9)
```

- A node has zero or more allocations.
- An allocation belongs to exactly one node.
- An allocation is assigned to zero or one server.
- A server (R9) can have zero or more allocations (one primary, rest secondary).
- Deleting a node cascades to delete its allocations (ON DELETE CASCADE).
- Deleting a server (R9) releases its allocations (application-level, sets `server_id = NULL`).
