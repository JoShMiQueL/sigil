# Feature Specification: Templates & Groups

**Feature Branch**: `005-templates-groups`

**Created**: 2026-09-10

**Status**: Draft

**Input**: Parent roadmap: `ROADMAP.md` -> entry **R8**. Templates & Groups — game catalog, template schema, PTDL_v2 egg import. Depends on R2 (Images), R4 (Node Management).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Manages Template Groups (Priority: P1)

An admin creates, edits, and deletes template groups to organize the game catalog. Groups are categories that collect related templates — for example "Minecraft", "Source Engine", "Rust". Each group has a name, an optional description, and an optional icon. Groups are visible to all admins. A group cannot be deleted if it still contains templates; the admin must reassign or delete its templates first.

**Why this priority**: Groups are the organizational foundation. Without groups, templates are a flat list with no way to browse or filter by game. This must exist before templates can be created.

**Independent Test**: Can be tested by creating a group named "Minecraft", verifying it appears in the group list, editing its description, and deleting it when empty.

**Acceptance Scenarios**:

1. **Given** the admin is logged in, **When** they create a group with name "Minecraft" and description "Java and Bedrock servers", **Then** the group appears in the group list with the correct name and description.
2. **Given** a group named "Minecraft" exists, **When** the admin edits its name to "Minecraft Java", **Then** the group list reflects the new name.
3. **Given** a group exists with no templates, **When** the admin deletes it, **Then** the group is removed from the list.
4. **Given** a group contains one or more templates, **When** the admin attempts to delete it, **Then** the deletion is rejected with a message indicating the group is not empty.
5. **Given** the admin is viewing the group list, **When** they navigate to a group, **Then** they see all templates within that group.

---

### User Story 2 - Admin Manages Registries and Installs Templates (Priority: P2)

An admin configures one or more template registries — git repositories served via HTTP that contain YAML template files and an index. The official SigilPanel registry is pre-configured by default and its templates are pre-installed (seeded) on a fresh panel deployment. The admin can add additional registries: community public repos or private hosting repos with authentication (token or basic auth). The panel fetches the registry index and displays available templates that are not yet installed. The admin installs templates from any configured registry. Installed templates live in the panel's database. Private registries store credentials securely (redacted in logs).

**Why this priority**: Registries are the distribution mechanism. Without them, the admin can only create templates manually. The official registry must be pre-configured so the panel is useful out of the box.

**Independent Test**: Can be tested by adding a second registry URL, verifying its templates appear in the "Available" section, installing one, and confirming it appears in "Installed" and is active for users.

**Acceptance Scenarios**:

1. **Given** a fresh panel deployment, **When** the admin views registries, **Then** the official SigilPanel registry is listed and its templates are already installed and active.
2. **Given** the admin adds a public community registry URL, **When** the panel fetches its index, **Then** the registry's templates appear in the "Available templates" section with name, description, group, and author.
3. **Given** the admin adds a private registry requiring a token, **When** the panel fetches its index using the provided token, **Then** the registry's templates appear in "Available templates". If the token is invalid, the fetch fails with a descriptive error.
4. **Given** templates are listed in "Available", **When** the admin clicks "Install" on a template, **Then** the template is copied to the panel database and appears in "Installed templates" with `active: false`.
5. **Given** the admin removes a configured registry, **When** the removal is confirmed, **Then** the registry is removed from the list. Templates already installed from that registry remain in the database and continue to function.
6. **Given** a registry is unreachable, **When** the panel attempts to fetch its index, **Then** the fetch fails silently, logs the error, and does not crash or remove the registry.

---

### User Story 3 - Admin Activates, Edits, and Manages Installed Templates (Priority: P3)

Installed templates are inactive by default (except the official seeded ones, which are active). The admin reviews a template, optionally edits it, and activates it so users can see it when creating servers. An active template is visible to users in the server creation flow. An inactive template is only visible to admins. The admin can deactivate a template without deleting it — existing servers created from it continue to run, but no new servers can be created from it while inactive. When the admin edits an installed template, it is marked as `customized: true` and future registry updates will notify but not overwrite it. The admin can "Reset to upstream" to discard local changes and restore the registry version. The admin can delete a template only if no servers use it.

**Why this priority**: Activation is the gate between admin setup and user availability. Without it, every installed template would be immediately visible to users, including untested or private ones.

**Independent Test**: Can be tested by installing a template from a registry, verifying it is inactive, activating it, verifying a user can see it, deactivating it, and verifying the user can no longer see it but existing servers still run.

**Acceptance Scenarios**:

1. **Given** a template is installed from a registry, **When** the admin views it, **Then** it shows as "Inactive" and `customized: false`.
2. **Given** an inactive template, **When** the admin clicks "Activate", **Then** the template becomes active and users can see it in the server creation flow.
3. **Given** an active template, **When** the admin clicks "Deactivate", **Then** the template becomes inactive. Users can no longer see it, but existing servers created from it continue to run.
4. **Given** an installed template, **When** the admin edits any field (image, startup, variables, resources), **Then** the template is marked `customized: true`.
5. **Given** a customized template, **When** a registry update is detected, **Then** the admin receives a notification but the local template is not overwritten. The admin sees a diff and can choose "Apply upstream" (overwrites local changes) or "Keep local".
6. **Given** a customized template, **When** the admin clicks "Reset to upstream", **Then** the local changes are discarded and the template reverts to the registry version, `customized: false`.
7. **Given** a template with no servers using it, **When** the admin deletes it, **Then** the template is removed from the database.
8. **Given** a template with one or more servers using it, **When** the admin attempts to delete it, **Then** the deletion is rejected with a message indicating the template is in use.
9. **Given** the admin is viewing the installed template list, **When** they filter by group "Minecraft", **Then** only templates in that group are shown.

---

### User Story 4 - Admin Defines Variables for Templates (Priority: P4)

An admin defines variables for a template. Variables are editable parameters exposed to users when they create a server from that template — for example "Server Name", "Max Players", "Difficulty", "EULA Accepted". Each variable has a name, a display label, a data type (string, integer, boolean, select), a default value, validation rules (required, min/max, regex pattern, allowed values for select), a visibility level (hidden, viewable, editable), and a sort order. Variables are resolved into environment variables and startup command arguments when a server is created.

**Why this priority**: Variables make templates reusable. Without variables, every server from the same template is identical. Variables allow customization per server instance.

**Independent Test**: Can be tested by creating a template with a variable "Max Players" (type integer, default 20, min 1, max 100, visibility: editable), and verifying the variable appears in the template's variable list with correct validation rules.

**Acceptance Scenarios**:

1. **Given** a template "Paper MC" exists, **When** the admin adds a variable "Max Players" (integer, default 20, min 1, max 100, visibility: editable), **Then** the variable appears in the template's variable list.
2. **Given** a template has a variable of type "select" with allowed values ["easy", "normal", "hard"], **When** the admin views the variable, **Then** the allowed values are displayed.
3. **Given** a template has a variable with a regex validation pattern, **When** the admin enters a value that does not match, **Then** validation fails with a descriptive error.
4. **Given** a template has variables, **When** the admin reorders them, **Then** the variables are stored in the new order and displayed accordingly.
5. **Given** a template has a variable marked as required, **When** the admin attempts to save the template without a default value for that variable, **Then** the save is rejected with a validation error.
6. **Given** a template has a variable with visibility "hidden", **When** a user creates a server from that template, **Then** the variable is not shown in the creation form but its default value is applied.

---

### User Story 5 - Admin Imports PTDL_v2 Eggs (Priority: P5)

An admin imports Pterodactyl egg files (PTDL_v2 format, JSON) to create templates. The import parses the JSON egg file, extracts the image, startup command, environment variables, and variable definitions, and creates a template with all fields populated in SigilPanel's native format. The admin selects which group to import into. If a template with the same name already exists in the group, the admin chooses to overwrite or skip. Invalid egg files are rejected with a descriptive error indicating which field failed validation. The import converts PTDL_v2-specific fields to SigilPanel's modernized equivalents: `rules` strings become structured validation, `field_type` becomes a proper data type, and `user_viewable`/`user_editable` booleans become a single `visibility` enum. Deferred PTDL_v2 fields (install scripts, config file parsers, file denylist, features) are silently ignored and the admin is informed which fields were skipped.

**Why this priority**: Migration from Pterodactyl is a key adoption path. Existing Pterodactyl users have dozens of eggs they want to import without manual re-entry.

**Independent Test**: Can be tested by importing a sample PTDL_v2 egg JSON file into a group, verifying the created template has the correct image, startup command, and variables extracted from the egg, with PTDL_v2 fields correctly converted to native format.

**Acceptance Scenarios**:

1. **Given** the admin has a valid PTDL_v2 egg file, **When** they upload it and select a group, **Then** a template is created with the egg's name, image, startup command, environment variables, and variable definitions, converted to native format.
2. **Given** a template with the same name already exists in the target group, **When** the admin imports and chooses "overwrite", **Then** the existing template is replaced with the imported one.
3. **Given** a template with the same name already exists in the target group, **When** the admin imports and chooses "skip", **Then** the existing template is left unchanged.
4. **Given** the admin uploads an invalid JSON file, **When** the import is attempted, **Then** the import is rejected with an error indicating the file is not a valid PTDL_v2 egg.
5. **Given** the admin uploads a valid egg with missing required fields (e.g., no startup command), **When** the import is attempted, **Then** the import is rejected with a descriptive error indicating which field is missing.
6. **Given** a PTDL_v2 egg has a variable with `rules: "required|integer|min:1|max:100"`, **When** the egg is imported, **Then** the created template has a variable with type "integer", required: true, min: 1, max: 100.
7. **Given** a PTDL_v2 egg has a variable with `user_viewable: true, user_editable: false`, **When** the egg is imported, **Then** the created template has a variable with visibility "viewable".
8. **Given** a PTDL_v2 egg contains install scripts, config file parsers, file denylist, or features, **When** the egg is imported, **Then** those fields are silently ignored and the admin is informed which fields were skipped.

---

### User Story 6 - Admin Exports Templates (Priority: P6)

An admin exports a template as a YAML file in SigilPanel's native format. The export serializes the template's image, startup command, environment variables, variables, port mappings, resource limits, and stop signal into a human-readable YAML file. The exported file can be imported back into another SigilPanel instance. Export to PTDL_v2 JSON is not supported — SigilPanel's native format is the canonical format for sharing.

**Why this priority**: Export enables sharing and backup of templates. It completes the import/export round-trip and makes templates portable between SigilPanel instances.

**Independent Test**: Can be tested by exporting a template to a YAML file, verifying the file contains the correct native structure, and importing it back into a different group.

**Acceptance Scenarios**:

1. **Given** a template "Paper MC" exists with variables, **When** the admin exports it, **Then** a YAML file is downloaded with the template's name, image, startup command, environment variables, variables, port mappings, resource limits, and stop signal.
2. **Given** an exported YAML file from one instance, **When** the admin imports it into another instance, **Then** the imported template matches the original in all fields.

---

### User Story 7 - Panel Auto-Detects Template Updates from Registries (Priority: P7)

The panel periodically checks all configured registries for changes to installed templates, in the background, without user action. When a template the admin has installed has been updated upstream, the panel sends a real-time SSE notification to the admin. The admin sees the notification, can view the changelog, and decides whether to apply the update. If the template is not customized, applying the update overwrites the local template. If the template is customized, applying the update overwrites local changes (the admin sees a warning). Servers already created from the previous template definition are not automatically modified — applying the update to existing servers is handled by R9 (Server Lifecycle). The admin can dismiss the notification.

**Why this priority**: Keeps the catalog fresh without requiring panel upgrades. The admin stays in control of when to apply changes, but does not need to manually check for updates.

**Independent Test**: Can be tested by configuring the panel to point to a test registry, updating a template YAML in the registry, waiting for the next check cycle, and verifying the admin receives an SSE notification with the changelog.

**Acceptance Scenarios**:

1. **Given** the panel has configured registries, **When** the background checker runs and finds a template that differs from the local version, **Then** the admin receives an SSE notification indicating an update is available.
2. **Given** the admin has received an update notification, **When** they view the notification, **Then** they see the changelog and buttons to "Apply update" or "Dismiss".
3. **Given** the admin clicks "Apply update" on a non-customized template, **When** the update is applied, **Then** the local template is overwritten with the new version from the registry.
4. **Given** the admin clicks "Apply update" on a customized template, **When** the update is applied, **Then** the local changes are overwritten and the admin sees a warning before confirming.
5. **Given** a template has been updated, **When** the admin views the template, **Then** the template reflects the new definition from the registry.
6. **Given** servers exist that were created from the previous template definition, **When** the template is updated, **Then** the servers are not modified and the admin sees an indicator that servers may need updating (handled by R9).
7. **Given** a registry is unreachable, **When** the background checker runs, **Then** the check fails silently and logs the error without crashing or notifying the admin.
8. **Given** the admin dismisses an update notification, **When** they dismiss it, **Then** the notification is removed and will reappear on the next check cycle if the upstream template still differs.

---

### Edge Cases

- What happens when an admin creates a group with a duplicate name? The system rejects it with a validation error — group names must be unique within the panel.
- What happens when an admin uploads a file that is valid JSON but not a PTDL_v2 egg (missing the `meta` field with `version`)? The import is rejected with a descriptive error.
- What happens when a template's referenced Docker image no longer exists in the registry? The template remains valid — image existence is checked at server creation time (R9), not at template creation time.
- What happens when a variable's default value violates its own validation rules (e.g., default 0 when min is 1)? The save is rejected with a validation error.
- What happens when an admin imports an egg with variables that have conflicting environment variable names? The import is rejected with a descriptive error indicating the conflict.
- What happens when the registry contains a template with a name that does not match any locally installed template? The update check ignores it — the registry only notifies about updates to templates the admin has already installed.
- What happens when two admins apply an update to the same template simultaneously? The last write wins; the template reflects whichever update was applied last. Both admins receive SSE confirmation of the final state.
- What happens when an admin deactivates a template that has running servers? The servers continue to run. The template is only hidden from the server creation flow, not from existing server management.
- What happens when an admin removes a registry that was the source of active templates? The templates remain in the database and continue to function. They stop receiving update notifications from that registry. Their `source` field retains the original registry identifier for reference.
- What happens when a private registry's token expires? The background checker fails silently, logs the auth error, and does not notify the admin. The admin sees the registry status as "Auth failed" in the registry list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admins to create template groups with a unique name, optional description, and optional icon.
- **FR-002**: System MUST allow admins to edit group name and description.
- **FR-003**: System MUST prevent deletion of a group that contains templates.
- **FR-004**: System MUST pre-configure the official SigilPanel registry on fresh deployments and seed its templates as installed and active.
- **FR-005**: System MUST allow admins to add additional registries with a URL and optional authentication (token or basic auth).
- **FR-006**: System MUST store registry credentials securely and redact them in logs (Constitution Principle III, rule 4).
- **FR-007**: System MUST fetch a registry's index and display available templates (not yet installed) with name, description, group, and author.
- **FR-008**: System MUST allow admins to install a template from any configured registry, copying it to the panel database with `active: false` and `customized: false`.
- **FR-009**: System MUST allow admins to remove a configured registry. Templates already installed from that registry remain in the database and continue to function.
- **FR-010**: System MUST allow admins to activate or deactivate an installed template. Active templates are visible to users in the server creation flow. Inactive templates are only visible to admins.
- **FR-011**: System MUST allow admins to create and edit templates within a group, specifying: name, description, Docker image, startup command, environment variables, port mappings, resource limits (memory, CPU, PIDs), resource limits range (min/max/recommended per resource, optional), stop signal, and changelog (structured array of version entries with typed changes: added/changed/deprecated/removed/fixed/security).
- **FR-012**: System MUST mark a template as `customized: true` when the admin edits any field of an installed template.
- **FR-013**: System MUST allow admins to "Reset to upstream" on a customized template, discarding local changes and restoring the registry version, setting `customized: false`.
- **FR-014**: System MUST prevent deletion of a template that is in use by one or more servers.
- **FR-015**: System MUST allow admins to define variables for a template with: name, display label, data type (string, integer, boolean, select), default value, validation rules (required, min, max, regex, allowed values), visibility level (hidden, viewable, editable), and sort order.
- **FR-016**: System MUST validate that a variable's default value satisfies its own validation rules.
- **FR-017**: System MUST allow admins to reorder variables within a template.
- **FR-018**: System MUST allow admins to import PTDL_v2 egg files (JSON), parsing the egg and creating a template with all supported fields populated in native format.
- **FR-019**: System MUST convert PTDL_v2 `rules` strings (e.g., `required|integer|min:1|max:100`) into structured validation (type, required, min, max).
- **FR-020**: System MUST convert PTDL_v2 `user_viewable`/`user_editable` booleans into a single `visibility` enum (hidden, viewable, editable).
- **FR-021**: System MUST silently ignore deferred PTDL_v2 fields (install scripts, config file parsers, file denylist, features) and inform the admin which fields were skipped.
- **FR-022**: System MUST support overwrite and skip conflict resolution when importing an egg with a name that already exists in the target group.
- **FR-023**: System MUST reject invalid PTDL_v2 egg files with a descriptive error indicating which field failed validation.
- **FR-024**: System MUST allow admins to export a template as a YAML file in SigilPanel's native format.
- **FR-025**: System MUST display groups, templates, and registries in the panel UI with real-time updates via SSE (no polling).
- **FR-026**: System MUST enforce that group names are unique across the panel.
- **FR-027**: System MUST enforce that template names are unique within a group.
- **FR-028**: System MUST periodically check all configured registries for updates to installed templates, in the background, without user action.
- **FR-029**: System MUST send an SSE notification to the admin when a template update is detected from a registry, including the old version, new version, and a structured changelog (array of typed changes: added/changed/deprecated/removed/fixed/security with descriptions).
- **FR-030**: System MUST allow the admin to apply or dismiss a template update notification. Applying overwrites the local template (with a warning if customized).
- **FR-030a**: System MUST store the full changelog history in the database when a template is installed or updated, and display it in the template detail view with typed change badges (added=green, changed=blue, deprecated=yellow, removed=red, fixed=purple, security=orange).
- **FR-031**: System MUST NOT automatically modify existing servers when a template is updated. The admin sees an indicator that servers may need updating (handled by R9).
- **FR-032**: System MUST fail silently and log the error when a registry is unreachable, without crashing or notifying the admin.
- **FR-033**: System MUST show the registry status (e.g., "OK", "Auth failed", "Unreachable") in the registry list.
- **FR-034**: All template, group, variable, and registry data shapes MUST be defined as Zod schemas in `packages/shared` (Constitution Principle II).

### Key Entities *(include if feature involves data)*

- **Group**: A category that collects related templates. Key attributes: unique name, description, icon, creation timestamp. Has many templates.
- **Template**: A blueprint for creating game servers. Key attributes: name, description, version, Docker image, startup command, environment variables, port mappings, resource limits (defaults), resource limits range (min/max/recommended per resource, optional), stop signal, changelog (structured array of version entries with typed changes), active (boolean), customized (boolean), registryId (FK to registries, nullable — null for locally created templates), sourceId (stable ID from the registry index, nullable). Belongs to one group. Has many variables. Has many servers (via R9). One version installed at a time — git history of the monorepo or external registry serves as version history.
- **Variable**: An editable parameter exposed when creating a server from a template. Key attributes: name, display label, data type (string, integer, boolean, select), default value, validation rules (required, min, max, regex, allowed values), visibility (hidden, viewable, editable), sort order. Belongs to one template. Maps to an environment variable or startup command argument.
- **Registry**: An HTTP endpoint serving YAML template files and an index. The official registry points to the monorepo's `templates/` directory via GitHub raw URLs. Community and private registries can point to any external HTTP endpoint. Key attributes: URL, name, authentication method (none, token, basic), credentials (redacted), status, isOfficial (boolean). Has many available templates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can create a template group in under 30 seconds (name + description).
- **SC-002**: Admins can create a complete template with 5 variables in under 2 minutes.
- **SC-003**: Admins can import a PTDL_v2 egg file and have a ready-to-use template in under 10 seconds.
- **SC-004**: The template catalog supports at least 50 groups and 500 templates with template list rendering in under 200ms.
- **SC-005**: 95% of valid PTDL_v2 egg files from the Pterodactyl ecosystem import successfully without manual correction.
- **SC-006**: Exported templates round-trip: export → import produces an identical template in all fields.
- **SC-007**: Template update notifications from registries are delivered to the admin within 1 hour of the upstream change.
- **SC-008**: Admins can apply a template update from a registry in under 5 seconds (excluding server re-deployment, which is R9).
- **SC-009**: A fresh panel deployment has the official templates seeded and active within 30 seconds of first boot.

## Assumptions

- Admins have basic knowledge of Docker images and startup commands for the games they want to host.
- Templates are edited both through the admin UI and by hand (YAML files in the `templates/` directory of the monorepo for official templates, or in external registries for community/private). YAML is chosen as the native format for its readability with multiline strings and comments. Bun's built-in `Bun.YAML` API is used for parsing and serialization — no external YAML dependency.
- The PTDL_v2 format is well-documented and stable; SigilPanel does not need to support PTDL_v1 (legacy format).
- Template variables map to environment variables and startup command arguments — complex variable interpolation (conditionals, loops) is out of scope for R8 and deferred to a future enhancement.
- Docker image building (R2) is a separate feature; R8 only references existing images by name.
- Server creation from templates (R9) is a separate feature; R8 only defines the template blueprint.
- Applying template updates to existing servers (re-render config, preserve user variables, restart) is handled by R9, not R8. R8 only updates the template definition and notifies the admin that servers may need updating.
- Install scripts and config file parsers (present in PTDL_v2) are deferred — R8 does not implement them. Import silently ignores these fields.
- The panel UI is the primary interface for template management; no CLI or API-only workflow is required for R8.
- The official registry lives in the monorepo's `templates/` directory and is served via GitHub raw URLs. Community and private registries are external HTTP endpoints (GitHub, Gitea, GitLab, any static file server). SigilPanel does not host registries — it only consumes them. CI path filters ensure changes to `templates/` only trigger template-related validation jobs.
- Registry credentials are stored in the panel database and used only for fetching template indexes and files. They are never exposed to users or logged.
- Existing authentication (R1) and node management (R4) are available and functional.
- One version of a template is active at a time. There is no version history or rollback within the panel — git history of the monorepo (for official templates) or the external registry serves as the version history.
- Official seeded templates come `active: true`. Templates installed by the admin from a registry come `active: false` by default — the admin reviews and activates them.
- The background update checker uses Bun's built-in `Bun.cron()` API for in-process scheduling. No external cron daemon or npm dependency is required. The default check interval is `@hourly` (configurable).
