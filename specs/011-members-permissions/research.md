# Research: Members & Permissions

## 1. Permission Model: Bits vs Roles

**Decision**: Individual permission bits (boolean flags per capability)

**Rationale**: 
- Pterodactyl uses permission bits and it works well at scale
- Roles would require predefined role templates, adding complexity
- Bits are simpler to reason about, test, and enforce
- 8 bits cover all server-scoped actions in v1

**Alternatives considered**:
- Role-based (admin, moderator, viewer) — too rigid, doesn't map to fine-grained needs
- Capability-based (ACL per resource) — overkill for v1, adds query complexity

## 2. Permission Storage: Array vs Bitmask vs Columns

**Decision**: PostgreSQL `boolean[]` array with fixed positions, or individual boolean columns

**Rationale**: 
- Individual columns are the most queryable and indexable
- Drizzle ORM handles boolean columns natively
- No need for bitmask parsing logic
- 8 columns is manageable and explicit

**Alternatives considered**:
- `text[]` array of permission names — harder to query, no type safety
- Bitmask integer — requires bitwise operations, harder to debug
- JSONB — overkill for 8 booleans

**Final choice**: Individual boolean columns (`canConsole`, `canFiles`, `canBackups`, `canPower`, `canSettings`, `canMembers`, `canAllocations`, `canDatabases`)

## 3. Owner Role Implementation

**Decision**: `role` column on `server_members` table with values `owner` or `member`

**Rationale**:
- Owner is a special role, not just "all permissions"
- Owner cannot be removed by other members
- Owner can transfer ownership
- Using a `role` column is simpler than a separate `server_owners` table

**Alternatives considered**:
- Separate `server_owners` table — unnecessary complexity
- `isOwner` boolean — less extensible if we add more roles later
- Owner = member with all permissions — doesn't prevent removal

## 4. Permission Middleware Design

**Decision**: Hono middleware that checks server-scoped permissions per route

**Rationale**:
- Current routes use `if (user?.role !== "admin") return 403` — too coarse
- New middleware: `requireServerPermission("files")` — checks admin (bypass) or member permission
- Middleware resolves `serverId` from route param, queries member record, checks permission bit
- Admins bypass all permission checks (implicit all-permissions)

**Alternatives considered**:
- Decorator-based — not idiomatic in Hono
- Per-route inline checks — repetitive, error-prone
- Centralized permission service called manually — easy to forget

## 5. Server List for Subusers

**Decision**: Modify server list query to filter by membership for non-admins

**Rationale**:
- Current `listServers` returns all servers (admin-only)
- For subusers: `SELECT servers.* FROM servers JOIN server_members ON ... WHERE user_id = ?`
- Admins get all servers (no JOIN needed)
- This is a simple query change, no architectural impact

**Alternatives considered**:
- Separate endpoint for "my servers" — unnecessary, same data
- Client-side filtering — insecure, leaks server existence

## 6. Permission Enforcement Granularity

**Decision**: Enforce at the API route level, not at the service level

**Rationale**:
- Routes are the trust boundary — services are called by routes, not directly
- Service-level enforcement would duplicate checks
- Route-level middleware is the established pattern in this codebase

**Alternatives considered**:
- Service-level enforcement — duplicates logic, harder to audit
- Database-level (RLS) — overkill, PostgreSQL RLS adds complexity and debugging difficulty

## 7. Audit Logging

**Decision**: Reuse existing audit log system with new actions

**Rationale**:
- Existing `logAudit` function works well
- New actions: `member_add`, `member_update`, `member_remove`, `member_transfer`
- No changes to audit infrastructure needed

## 8. Panel UI Approach

**Decision**: Members section on server detail page, permission editor as checkbox grid

**Rationale**:
- 8 permissions fit well as a checkbox grid
- Inline editing is simpler than a modal
- Owner badge is a visual indicator, not editable
- "Add member" is a simple email input + permission selection

**Alternatives considered**:
- Separate members page — unnecessary navigation
- Modal-based editing — overkill for a simple form
- Drag-and-drop permission assignment — too complex for v1
