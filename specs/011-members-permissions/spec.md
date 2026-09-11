# Feature Specification: Members & Permissions

**Feature Branch**: `011-members-permissions`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "R13 Members & Permissions — Subusers with granular per-server permissions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a subuser to a server (Priority: P1)

An admin or server owner adds a registered user as a member of a specific server with a set of permissions. The invited user appears in the server's member list and can access the server according to their granted permissions.

**Why this priority**: Without the ability to add members, the entire permission system has no users to apply permissions to. This is the foundational action that enables delegation.

**Independent Test**: Can be fully tested by adding a member to a server and verifying they appear in the member list with the correct permissions.

**Acceptance Scenarios**:

1. **Given** an admin is logged in and a server exists, **When** they add a registered user as a member with "console" and "files" permissions, **Then** the user appears in the server's member list with those permissions
2. **Given** an admin is adding a member, **When** they enter an email that doesn't correspond to a registered user, **Then** the system shows an error indicating the user must register first
3. **Given** a server already has a member, **When** the admin tries to add the same user again, **Then** the system rejects the duplicate with a clear error

---

### User Story 2 - Subuser accesses a server according to their permissions (Priority: P2)

A subuser (non-admin) logs in and sees only the servers they have been added to. They can perform only the actions their permissions allow (e.g., view console, edit files, create backups) and cannot perform actions they don't have permission for (e.g., delete the server, manage members).

**Why this priority**: This is the core value of the permission system — restricting what subusers can do. Without enforcement, permissions are just metadata.

**Independent Test**: Can be tested by adding a member with limited permissions, logging in as that member, and verifying they can only see their servers and only perform allowed actions.

**Acceptance Scenarios**:

1. **Given** a subuser with "console" and "files" permissions on a server, **When** they log in, **Then** they see only that server in their server list
2. **Given** a subuser with "console" permission only, **When** they try to access the Files tab, **Then** the system denies access with a clear error
3. **Given** a subuser without "members" permission, **When** they try to view the member management page, **Then** the system denies access
4. **Given** a subuser with no servers assigned, **When** they log in, **Then** they see an empty server list with a helpful message

---

### User Story 3 - Update or remove a member's permissions (Priority: P3)

An admin or server owner updates a member's permissions (grant or revoke individual permissions) or removes the member entirely from the server.

**Why this priority**: Permissions change over time. Without the ability to update or revoke, the system becomes rigid and insecure.

**Independent Test**: Can be tested by adding a member, updating their permissions, verifying the change takes effect, then removing them and verifying they lose access.

**Acceptance Scenarios**:

1. **Given** a member with "console" permission, **When** the admin grants "files" permission, **Then** the member can now access the Files tab
2. **Given** a member with "console" and "files" permissions, **When** the admin revokes "files" permission, **Then** the member can no longer access the Files tab
3. **Given** a member on a server, **When** the admin removes the member, **Then** the member no longer sees the server in their list and cannot access it

---

### User Story 4 - Server owner role (Priority: P4)

The user who created a server (or an admin who takes ownership) is the "owner" of that server. Owners have all permissions by default and cannot be removed by other members. Owners can transfer ownership to another member.

**Why this priority**: Ownership establishes accountability and prevents lockout scenarios. It's important but secondary to the core add/access/remove flows.

**Independent Test**: Can be tested by creating a server as an admin, verifying the admin is the owner, and confirming the owner has all permissions.

**Acceptance Scenarios**:

1. **Given** an admin creates a server, **When** they view the member list, **Then** they see themselves as "owner" with all permissions
2. **Given** an owner, **When** another admin tries to remove the owner, **Then** the system prevents removal
3. **Given** an owner, **When** they transfer ownership to another member, **Then** the new member becomes owner and the previous owner becomes a regular member

---

### Edge Cases

- What happens when a member's account is suspended? They lose access to all servers immediately.
- What happens when a server is deleted? All member associations are removed.
- What happens when a member is removed while they have an active console session? The session is terminated.
- What happens when an admin tries to grant a permission they don't have? Admins have all permissions, so this only applies to subusers who own servers — they can only grant permissions they themselves have.
- What happens when the last owner tries to leave/remove themselves? The system prevents it to avoid orphaned servers.
- What permissions are available? Console (send commands, view output), Files (browse, read, write, upload, download, delete), Backups (create, restore, delete), Power (start, stop, restart), Settings (view/edit server settings), Members (add, remove, update members), Allocations (view, manage allocations), Databases (view, manage databases).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admins to add registered users as members of a specific server with a set of permissions
- **FR-002**: System MUST define a fixed set of permission bits: `console`, `files`, `backups`, `power`, `settings`, `members`, `allocations`, `databases`
- **FR-003**: System MUST enforce permissions on all server-scoped API endpoints — a subuser without the required permission receives 403
- **FR-004**: System MUST show subusers only the servers they have been added to in their server list
- **FR-005**: System MUST allow admins to update a member's permissions (grant or revoke individual bits)
- **FR-006**: System MUST allow admins to remove a member from a server
- **FR-007**: System MUST assign the server creator as "owner" with all permissions
- **FR-008**: System MUST prevent removal of the server owner
- **FR-009**: System MUST allow the owner to transfer ownership to another member
- **FR-010**: System MUST revoke all access immediately when a member is removed or their account is suspended
- **FR-011**: System MUST log all member changes (add, update, remove, transfer) to the audit log
- **FR-012**: System MUST validate that the invited user email corresponds to a registered, active user
- **FR-013**: System MUST prevent duplicate member entries for the same user on the same server
- **FR-014**: Admins MUST have all permissions on all servers implicitly, without needing to be added as members

### Key Entities *(include if feature involves data)*

- **Member**: A user's association with a specific server. Has a role (owner or member) and a set of permission bits. Relationships: belongs to a user, belongs to a server.
- **Permission**: A discrete capability bit (console, files, backups, power, settings, members, allocations, databases). Permissions are per-member per-server.
- **Server Owner**: The member with the "owner" role on a server. Has all permissions and cannot be removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can add a member to a server in under 30 seconds
- **SC-002**: A subuser sees only their assigned servers and only the tabs/actions they have permission for
- **SC-003**: Permission changes take effect immediately — a revoked permission blocks access on the next request
- **SC-004**: All 8 permission bits are individually enforceable and testable
- **SC-005**: An owner cannot be removed, preventing orphaned servers

## Assumptions

- Users must already be registered before they can be added as members (no invite-by-email flow in v1)
- The existing user role system (admin/user) remains unchanged — members are a per-server layer on top
- Admins implicitly have all permissions on all servers without needing member entries
- Permission bits are fixed in v1 — custom permissions are out of scope
- Server ownership is assigned at creation time to the creating admin
- Ownership transfer is available but irreversible without another transfer
- The existing audit log system is reused for member change logging
- No email notifications for member additions/removals in v1
- A subuser's permissions are the union of their member permissions on that server — no role inheritance beyond owner
