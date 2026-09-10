# Tasks: Templates & Groups

**Input**: Design documents from `/specs/005-templates-groups/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per Constitution Principle IV (Test Against Real Infrastructure). Unit tests use Vitest, integration tests use Testcontainers PostgreSQL, E2E tests use Playwright after MCP verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared schemas**: `packages/shared/src/template/`
- **DB schema**: `packages/db/src/schema/`
- **API routes**: `apps/api/src/routes/`
- **API services**: `apps/api/src/services/`
- **API lib**: `apps/api/src/lib/`
- **Panel pages**: `apps/panel/src/routes/`
- **Panel components**: `apps/panel/src/components/`
- **Panel hooks**: `apps/panel/src/hooks/`
- **Official templates**: `templates/`
- **E2E tests**: `apps/panel/tests/e2e/`
- **API tests**: `apps/api/src/services/*.spec.ts` and `apps/api/src/routes/*.spec.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared schemas, DB tables, and official template files that all user stories depend on.

- [ ] T001 [P] Create GroupSchema in `packages/shared/src/template/group.ts`
- [ ] T002 [P] Create VariableSchema, VariableDataTypeSchema, VariableVisibilitySchema in `packages/shared/src/template/variable.ts`
- [ ] T003 [P] Create ChangelogSchema, ChangelogEntrySchema, ChangeSchema, ChangeTypeSchema in `packages/shared/src/template/changelog.ts`
- [ ] T004 [P] Create ResourceLimitsRangeSchema in `packages/shared/src/template/template.ts` (alongside TemplateSchema)
- [ ] T005 Create TemplateSchema (includes changelog, resourceLimitsRange, variables) in `packages/shared/src/template/template.ts` (depends on T001-T004)
- [ ] T006 [P] Create RegistrySchema, RegistryIndexSchema, RegistryIndexEntrySchema, RegistryAuthMethodSchema, RegistryStatusSchema in `packages/shared/src/template/registry.ts`
- [ ] T007 [P] Create PTDLv2EggSchema, PTDLv2VariableSchema in `packages/shared/src/template/ptdlv2.ts`
- [ ] T008 Create `packages/shared/src/template/index.ts` re-exporting all template schemas (depends on T001-T007)
- [ ] T009 Update `packages/shared/src/index.ts` to export from `./template/index` (depends on T008)
- [ ] T010 Update `packages/shared/src/sse/events.ts` to add new SSE event types (template.create, template.update, template.delete, template.update_available, template.update_applied, group.create, group.update, group.delete) and payload schemas (depends on T003, T005)
- [ ] T011 [P] Create groups table in `packages/db/src/schema/groups.ts`
- [ ] T012 [P] Create templates table (includes resourceLimitsRange, changelog jsonb fields) in `packages/db/src/schema/templates.ts`
- [ ] T013 [P] Create variables table in `packages/db/src/schema/variables.ts`
- [ ] T014 [P] Create registries table in `packages/db/src/schema/registries.ts`
- [ ] T015 Update `packages/db/src/schema/index.ts` to export groups, templates, variables, registries (depends on T011-T014)
- [ ] T016 Generate Drizzle migration for groups, templates, variables, registries tables (depends on T015)
- [ ] T017 [P] Create official templates directory structure: `templates/index.yaml`, `templates/minecraft/paper-mc.yaml`, `templates/minecraft/vanilla-mc.yaml`, `templates/source-engine/csgo.yaml`, `templates/rust/rust.yaml`
- [ ] T018 [P] Write `templates/index.yaml` with entries for all official templates (id, name, description, group, author, version, file, sha256)

**Checkpoint**: Shared schemas, DB tables, and official template files are ready. User story implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core services and utilities that multiple user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T019 Create registry HTTP fetch utility in `apps/api/src/lib/registry-fetch.ts` — fetch index.yaml and template files with none/token/basic auth, redact credentials in logs (depends on T006)
- [ ] T020 Create PTDL_v2 rules parser in `apps/api/src/lib/ptdlv2-converter.ts` — parse Laravel pipe-delimited rules strings into structured validation, map field_type to dataType, map user_viewable/user_editable to visibility (depends on T007)
- [ ] T021 Create YAML serialization utility using `Bun.YAML.parse()` and `Bun.YAML.stringify()` in `apps/api/src/lib/yaml-utils.ts` — parse template YAML files, serialize templates to YAML for export (depends on T005)
- [ ] T022 Create template seed service in `apps/api/src/services/template-seed.service.ts` — on first boot (empty templates table), create official registry entry, fetch index, install all official templates with active=true (depends on T016, T019)
- [ ] T023 Hook template seed service into API startup in `apps/api/src/index.ts` — run seed after DB connection is established, before server starts (depends on T022)

**Checkpoint**: Foundation ready — registry fetch, PTDL_v2 conversion, YAML utils, and seeding are operational. User story implementation can now begin.

---

## Phase 3: User Story 1 - Admin Manages Template Groups (Priority: P1) 🎯 MVP

**Goal**: Admin can create, edit, list, and delete template groups. Groups are the organizational foundation for templates.

**Independent Test**: Create a group named "Minecraft", verify it appears in the group list, edit its description, delete it when empty, and verify deletion is rejected when it contains templates.

### Tests for User Story 1

- [ ] T024 [P] [US1] Integration test for group CRUD in `apps/api/src/routes/groups.spec.ts` — create, list, get, edit, delete, duplicate name rejection, non-empty deletion rejection (Testcontainers PostgreSQL)

### Implementation for User Story 1

- [ ] T025 [US1] Create group service in `apps/api/src/services/group.service.ts` — createGroup, listGroups, getGroupById, updateGroup, deleteGroup (reject if templates exist), audit log on all mutations (depends on T011)
- [ ] T026 [US1] Create groups API routes in `apps/api/src/routes/groups.ts` — POST /api/groups, GET /api/groups, GET /api/groups/:id, PATCH /api/groups/:id, DELETE /api/groups/:id, admin-only guard, zValidator with GroupSchema (depends on T001, T025)
- [ ] T027 [US1] Register groups routes in `apps/api/src/index.ts` (depends on T026)
- [ ] T028 [P] [US1] Create useGroups hook in `apps/panel/src/hooks/use-groups.ts` — fetch groups, SSE subscription for group.create/group.update/group.delete
- [ ] T029 [P] [US1] Create GroupForm component in `apps/panel/src/components/groups/group-form.tsx` — create/edit form with name, description, icon fields
- [ ] T030 [US1] Create groups management page in `apps/panel/src/routes/groups.tsx` — list groups, create/edit/delete via GroupForm, SSE real-time updates (depends on T028, T029)
- [ ] T031 [US1] Add groups route to panel navigation in `apps/panel/src/routes/__root.tsx` (depends on T030)

**Checkpoint**: User Story 1 is fully functional. Admin can manage groups through the UI with real-time SSE updates.

---

## Phase 4: User Story 2 - Admin Manages Registries and Installs Templates (Priority: P2)

**Goal**: Admin can configure registries (official pre-configured), browse available templates, and install them. Private registries support token/basic auth with redacted credentials.

**Independent Test**: Add a community registry URL, verify its templates appear in "Available", install one, confirm it appears in "Installed" as inactive. Verify official registry is pre-configured and seeded.

### Tests for User Story 2

- [ ] T032 [P] [US2] Integration test for registry CRUD in `apps/api/src/routes/registries.spec.ts` — create, list, edit, delete, credential redaction in responses, auth method validation (Testcontainers PostgreSQL)
- [ ] T033 [P] [US2] Integration test for registry fetch and install in `apps/api/src/services/registry.service.spec.ts` — fetch index, list available templates, install template, duplicate install handling, unreachable registry handling (Testcontainers + mock HTTP server)

### Implementation for User Story 2

- [ ] T034 [US2] Create registry service in `apps/api/src/services/registry.service.ts` — createRegistry, listRegistries (redact credentials), updateRegistry, deleteRegistry (set templates.registryId to null), getRegistryById, fetchIndex, listAvailableTemplates, installTemplate (depends on T014, T019)
- [ ] T035 [US2] Create registries API routes in `apps/api/src/routes/registries.ts` — POST /api/registries, GET /api/registries, PATCH /api/registries/:id, DELETE /api/registries/:id, POST /api/registries/:id/check, GET /api/registries/:id/available, POST /api/registries/:id/install, admin-only guard, credential redaction (depends on T006, T034)
- [ ] T036 [US2] Register registries routes in `apps/api/src/index.ts` (depends on T035)
- [ ] T037 [P] [US2] Create useRegistries hook in `apps/panel/src/hooks/use-registries.ts` — fetch registries, available templates, install action, SSE subscription
- [ ] T038 [P] [US2] Create RegistryForm component in `apps/panel/src/components/registries/registry-form.tsx` — URL, name, auth method (none/token/basic), credential fields (password type, never displayed back)
- [ ] T039 [P] [US2] Create AvailableTemplates component in `apps/panel/src/components/registries/available-templates.tsx` — list available templates from a registry with install buttons
- [ ] T040 [US2] Create registries management page in `apps/panel/src/routes/registries.tsx` — list registries with status, add/edit/delete via RegistryForm, view available templates, install templates (depends on T037, T038, T039)
- [ ] T041 [US2] Add registries route to panel navigation in `apps/panel/src/routes/__root.tsx` (depends on T040)

**Checkpoint**: User Story 2 is fully functional. Admin can manage registries and install templates. Official registry is pre-seeded.

---

## Phase 5: User Story 3 - Admin Activates, Edits, and Manages Installed Templates (Priority: P3)

**Goal**: Admin can activate/deactivate templates, edit them (marking as customized), reset to upstream, delete them, and filter by group. Users see only active templates.

**Independent Test**: Install a template, verify it is inactive, activate it, verify a user can see it, deactivate it, verify user can no longer see it. Edit a template and verify customized=true. Reset to upstream and verify customized=false.

### Tests for User Story 3

- [ ] T042 [P] [US3] Integration test for template CRUD and lifecycle in `apps/api/src/routes/templates.spec.ts` — create, list, get, edit, delete, activate, deactivate, reset, customized flag, active filtering for users, group filter, delete rejection when servers use it (NOTE: servers table is R9, so in R8 delete always succeeds — test the rejection logic structure for when R9 adds the FK) (Testcontainers PostgreSQL)

### Implementation for User Story 3

- [ ] T043 [US3] Create template service in `apps/api/src/services/template.service.ts` — createTemplate, listTemplates (admin sees all, user sees active only), getTemplateById, updateTemplate (set customized=true if registryId exists), deleteTemplate (reject if servers use it — NOTE: servers table is R9, so in R8 this check always passes; the FK constraint is added in R9), activateTemplate, deactivateTemplate, resetToUpstream (re-fetch from registry, set customized=false) (depends on T012, T019)
- [ ] T044 [US3] Create templates API routes in `apps/api/src/routes/templates.ts` — POST /api/templates, GET /api/templates (with groupId and active filters), GET /api/templates/:id, PATCH /api/templates/:id, DELETE /api/templates/:id, POST /api/templates/:id/activate, POST /api/templates/:id/deactivate, POST /api/templates/:id/reset, admin-only for mutations, user-accessible for list/get (depends on T005, T043)
- [ ] T045 [US3] Register templates routes in `apps/api/src/index.ts` (depends on T044)
- [ ] T046 [P] [US3] Create useTemplates hook in `apps/panel/src/hooks/use-templates.ts` — fetch templates (admin/user modes), activate/deactivate/edit/delete actions, SSE subscription for template events
- [ ] T047 [P] [US3] Create TemplateForm component in `apps/panel/src/components/templates/template-form.tsx` — all template fields including resourceLimits, resourceLimitsRange, changelog editor, variables editor
- [ ] T048 [P] [US3] Create TemplateList component in `apps/panel/src/components/templates/template-list.tsx` — list with group filter, active/inactive badges, customized indicator, activate/deactivate/delete actions
- [ ] T049 [P] [US3] Create ChangelogView component in `apps/panel/src/components/templates/changelog-view.tsx` — render changelog entries with typed change badges (added=green, changed=blue, deprecated=yellow, removed=red, fixed=purple, security=orange)
- [ ] T050 [US3] Create templates management page in `apps/panel/src/routes/templates.tsx` — list templates, create/edit via TemplateForm, activate/deactivate, reset to upstream, view changelog, filter by group (depends on T046, T047, T048, T049)
- [ ] T051 [US3] Add templates route to panel navigation in `apps/panel/src/routes/__root.tsx` (depends on T050)

**Checkpoint**: User Story 3 is fully functional. Admin can manage the full template lifecycle. Users see only active templates.

---

## Phase 6: User Story 4 - Admin Defines Variables for Templates (Priority: P4)

**Goal**: Admin can define typed variables (string, integer, boolean, select) with validation rules, visibility levels, and sort order. Variables are nested in the template create/edit form.

**Independent Test**: Create a template with a variable "Max Players" (integer, default 20, min 1, max 100, visibility: editable), verify it appears with correct validation. Test select type with allowed values. Test regex validation. Test required without default value rejection.

### Tests for User Story 4

- [ ] T052 [P] [US4] Unit test for variable validation in `apps/api/src/services/template.service.spec.ts` — validate variable default values against their own rules (required without default, min/max, regex, allowed values for select, dataType coercion)

### Implementation for User Story 4

- [ ] T053 [US4] Add variable validation logic to template service in `apps/api/src/services/template.service.ts` — validate default values against rules, reject required variables without defaults, reject conflicting envVar names within a template, validate regex patterns are valid (depends on T043, T002)
- [ ] T054 [US4] Create VariableEditor component in `apps/panel/src/components/templates/variable-editor.tsx` — add/edit/remove/reorder variables, type-specific fields (min/max for integer, regex for string, allowed values for select), visibility dropdown, sort order drag (depends on T047)
- [ ] T055 [US4] Integrate VariableEditor into TemplateForm in `apps/panel/src/components/templates/template-form.tsx` (depends on T054)

**Checkpoint**: User Story 4 is fully functional. Admin can define and validate typed variables within templates.

---

## Phase 7: User Story 5 - Admin Imports PTDL_v2 Eggs (Priority: P5)

**Goal**: Admin can upload PTDL_v2 egg JSON files and have them converted to native SigilPanel templates. Deferred fields are silently ignored with a report of skipped fields.

**Independent Test**: Import a sample PTDL_v2 egg JSON, verify the created template has correct image, startup, and variables with structured validation (not Laravel rules strings). Verify skipped fields are reported.

### Tests for User Story 5

- [ ] T056 [P] [US5] Unit test for PTDL_v2 rules parser in `apps/api/src/lib/ptdlv2-converter.spec.ts` — parse "required|integer|min:1|max:100", parse "required|string|regex:/^a-z+$/", parse "in:easy,normal,hard", visibility mapping, dataType inference
- [ ] T057 [P] [US5] Integration test for PTDL_v2 import in `apps/api/src/routes/templates.spec.ts` — upload valid egg, verify converted fields, upload invalid JSON, verify rejection, upload egg with skipped fields, verify skippedFields report, overwrite vs skip conflict handling

### Implementation for User Story 5

- [ ] T058 [US5] Create template import service in `apps/api/src/services/template-import.service.ts` — parse uploaded file (JSON or YAML), detect format, validate with PTDLv2EggSchema or native TemplateSchema, convert PTDL_v2 fields to native, return skippedFields list, handle conflict (overwrite/skip) (depends on T020, T021)
- [ ] T059 [US5] Add import endpoint to templates API routes in `apps/api/src/routes/templates.ts` — POST /api/templates/import, multipart/form-data file upload, groupId and conflict params, return created template + skippedFields (depends on T058, T044)
- [ ] T060 [P] [US5] Create ImportDialog component in `apps/panel/src/components/templates/import-dialog.tsx` — file upload, group selection, conflict strategy (overwrite/skip), display skipped fields after import
- [ ] T061 [US5] Integrate ImportDialog into templates management page in `apps/panel/src/routes/templates.tsx` — "Import Template" button opens dialog (depends on T060, T050)

**Checkpoint**: User Story 5 is fully functional. Admin can import Pterodactyl eggs with automatic field conversion.

---

## Phase 8: User Story 6 - Admin Exports Templates (Priority: P6)

**Goal**: Admin can export a template as a YAML file in SigilPanel's native format. The exported file can be re-imported into another instance.

**Independent Test**: Export a template to YAML, verify the file contains correct native structure (image, startup, variables, resourceLimits, resourceLimitsRange, changelog), import it back into a different group, verify all fields match.

### Tests for User Story 6

- [ ] T062 [P] [US6] Unit test for YAML export in `apps/api/src/lib/yaml-utils.spec.ts` — serialize a template to YAML, parse it back, verify round-trip fidelity for all fields including changelog and resourceLimitsRange

### Implementation for User Story 6

- [ ] T063 [US6] Create template export service in `apps/api/src/services/template-export.service.ts` — serialize template to native YAML using Bun.YAML.stringify, include all fields (image, startup, environment, portMappings, resourceLimits, resourceLimitsRange, changelog, variables, stopSignal) (depends on T021)
- [ ] T064 [US6] Add export endpoint to templates API routes in `apps/api/src/routes/templates.ts` — GET /api/templates/:id/export, return Content-Type: application/x-yaml, body is YAML file (depends on T063, T044)
- [ ] T065 [P] [US6] Create ExportButton component in `apps/panel/src/components/templates/export-button.tsx` — triggers download of YAML file from export endpoint
- [ ] T066 [US6] Integrate ExportButton into TemplateList and template detail view in `apps/panel/src/routes/templates.tsx` (depends on T065, T050)

**Checkpoint**: User Story 6 is fully functional. Templates are portable via YAML export/import round-trip.

---

## Phase 9: User Story 7 - Panel Auto-Detects Template Updates from Registries (Priority: P7)

**Goal**: Background checker detects upstream template changes, sends SSE notifications with structured changelog, admin can apply or dismiss updates. Customized templates are protected.

**Independent Test**: Point panel to a test registry, update a template YAML upstream, wait for check cycle (or trigger manually), verify SSE notification with changelog, apply update, verify template reflects new version. Test customized template protection and reset.

### Tests for User Story 7

- [ ] T067 [P] [US7] Integration test for background checker in `apps/api/src/services/registry-checker.service.spec.ts` — detect sha256 change, emit SSE event, fetch template YAML for changelog, handle unreachable registry, handle auth failure, customized template not overwritten
- [ ] T068 [P] [US7] Integration test for update apply/dismiss in `apps/api/src/routes/templates.spec.ts` — apply update on non-customized template, apply on customized (with warning), dismiss notification, verify template reflects new version and changelog

### Implementation for User Story 7

- [ ] T069 [US7] Create registry checker service in `apps/api/src/services/registry-checker.service.ts` — Bun.cron("@hourly") job, fetch all registry indexes, compare sha256 with templates.sourceHash, fetch template YAML on change, extract latest changelog entry, emit SSE template.update_available, update registry status on failure (depends on T019, T022, T010)
- [ ] T070 [US7] Start background checker in API startup in `apps/api/src/index.ts` — register Bun.cron job after seed, skip in test environment (depends on T069, T023)
- [ ] T071 [US7] Add apply/dismiss update endpoints to templates API routes in `apps/api/src/routes/templates.ts` — POST /api/templates/:id/apply-update (fetch latest from registry, overwrite local, set customized=false, emit SSE template.update_applied; NOTE: does NOT modify existing servers — that is R9 scope, no "servers need updating" indicator in R8), POST /api/templates/:id/dismiss-update (mark as seen, no change) (depends on T044, T069)
- [ ] T072 [P] [US7] Create UpdateNotification component in `apps/panel/src/components/templates/update-notification.tsx` — SSE-driven toast/card showing oldVersion → newVersion, structured changes with badges, Apply/Dismiss buttons, warning for customized templates
- [ ] T073 [US7] Integrate UpdateNotification into templates management page in `apps/panel/src/routes/templates.tsx` — listen for template.update_available SSE events, show notification, handle apply/dismiss (depends on T072, T050)

**Checkpoint**: User Story 7 is fully functional. Admin receives real-time update notifications with structured changelogs and can apply or dismiss them.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, CI integration, and final validation across all user stories.

- [ ] T074 [P] Write E2E test for group CRUD in `apps/panel/tests/e2e/templates-crud.spec.ts` — login as admin, create group, edit, delete, verify SSE updates (after MCP verification)
- [ ] T075 [P] Write E2E test for template lifecycle in `apps/panel/tests/e2e/templates-crud.spec.ts` — create template, add variables, activate, verify user visibility, deactivate, edit (customized), reset to upstream, delete (after MCP verification)
- [ ] T076 [P] Write E2E test for import/export in `apps/panel/tests/e2e/template-import-export.spec.ts` — import PTDL_v2 egg, verify skipped fields, export as YAML, re-import, verify round-trip (after MCP verification)
- [ ] T077 [P] Write E2E test for registry management in `apps/panel/tests/e2e/registry-management.spec.ts` — view official registry, add community registry, list available, install template, verify inactive, delete registry, verify templates remain (after MCP verification)
- [ ] T078 [P] Write E2E test for update detection in `apps/panel/tests/e2e/registry-management.spec.ts` — trigger manual check, verify SSE notification with changelog badges, apply update, verify template updated, test customized protection (after MCP verification)
- [ ] T079 Update CI workflow in `.github/workflows/ci.yml` — add path filter for `templates/` directory to only run template validation job when templates change, ensure template YAML files are validated against schema in CI
- [ ] T080 [P] Add template YAML schema validation script in `apps/api/src/lib/validate-templates.ts` — validate all files in `templates/` against RegistryIndexSchema and TemplateSchema, run as part of CI
- [ ] T081 Run `bun run check` and `bun run typecheck` — fix any lint or type errors across all new files
- [ ] T082 Run `bun run test` — ensure all unit and integration tests pass
- [ ] T083 Run `bun run test:e2e` — ensure all E2E tests pass (after MCP verification of all flows)
- [ ] T084 Run quickstart.md validation scenarios 1-7 manually with curl and chrome-devtools MCP
- [ ] T085 Update `ROADMAP.md` — mark R8 status as complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. Creates shared schemas, DB tables, official template files.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. Creates registry fetch, PTDL_v2 converter, YAML utils, seed service.
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion.
  - US1 (Groups) has no dependencies on other stories — can start immediately after Foundational.
  - US2 (Registries) depends on US1 for group creation during install (group from registry index).
  - US3 (Template lifecycle) depends on US2 for installed templates to manage.
  - US4 (Variables) depends on US3 for template create/edit form.
  - US5 (PTDL_v2 import) depends on US3 for template creation, US4 for variable validation.
  - US6 (Export) depends on US3 for template existence.
  - US7 (Update detection) depends on US2 for registry fetch, US3 for template management.
- **Polish (Phase 10)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Foundational → US1 (no other story dependencies)
- **US2 (P2)**: Foundational → US1 → US2 (registry install creates groups)
- **US3 (P3)**: Foundational → US2 → US3 (manages installed templates)
- **US4 (P4)**: Foundational → US3 → US4 (variables are part of template form)
- **US5 (P5)**: Foundational → US3 → US5 (import creates templates)
- **US6 (P6)**: Foundational → US3 → US6 (export serializes templates)
- **US7 (P7)**: Foundational → US2, US3 → US7 (checker fetches registries, updates templates)

### Within Each User Story

- Tests written before implementation (TDD where applicable)
- Shared schemas before DB tables before services before routes
- Services before API routes before panel hooks before panel components before panel pages
- API routes registered in index.ts before panel pages added to navigation
- MCP verification before E2E tests (Polish phase)

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T001-T007, T011-T014, T017-T018)
- Foundational tasks T019-T021 can run in parallel (different lib files)
- Within US1: T028, T029 can run in parallel (hook + component, different files)
- Within US2: T037, T038, T039 can run in parallel (hook + 2 components)
- Within US3: T046, T047, T048, T049 can run in parallel (hook + 3 components)
- Within US5: T060 can run in parallel with T056, T057 (test + component)
- Within US6: T065 can run in parallel with T062 (test + component)
- Within US7: T072 can run in parallel with T067, T068 (tests + component)
- Polish E2E tests T074-T078 can all run in parallel (different test files)

---

## Parallel Example: User Story 3

```bash
# Launch all panel components for User Story 3 together:
Task: "Create useTemplates hook in apps/panel/src/hooks/use-templates.ts"
Task: "Create TemplateForm component in apps/panel/src/components/templates/template-form.tsx"
Task: "Create TemplateList component in apps/panel/src/components/templates/template-list.tsx"
Task: "Create ChangelogView component in apps/panel/src/components/templates/changelog-view.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared schemas, DB tables, official templates)
2. Complete Phase 2: Foundational (registry fetch, PTDL_v2 converter, YAML utils, seed)
3. Complete Phase 3: User Story 1 (Groups)
4. **STOP and VALIDATE**: Test group CRUD independently with curl + MCP
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready, official templates seeded
2. Add US1 (Groups) → Test independently → Demo (MVP!)
3. Add US2 (Registries) → Test independently → Demo (admin can install templates)
4. Add US3 (Template lifecycle) → Test independently → Demo (admin manages templates)
5. Add US4 (Variables) → Test independently → Demo (templates have typed variables)
6. Add US5 (PTDL_v2 import) → Test independently → Demo (Pterodactyl migration path)
7. Add US6 (Export) → Test independently → Demo (templates are portable)
8. Add US7 (Update detection) → Test independently → Demo (auto-update notifications)
9. Polish → E2E tests, CI integration, final validation

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US2 → US7 (registry chain)
   - Developer B: US3 → US4 → US5 → US6 (template chain)
3. Stories integrate at US3 (templates need groups from US1 and registries from US2)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD where applicable)
- Commit after each task or logical group, following AGENTS.md commit format: `<type>(<scope>): <description> [R8]`
- Stop at any checkpoint to validate story independently
- MCP verification (chrome-devtools) before writing Playwright E2E tests
- Use curl for API verification, MCP for UI verification
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
