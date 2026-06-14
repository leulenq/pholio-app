# Agency RBAC — Role & Permission System

**Date:** 2026-06-07  
**Status:** Approved — implementation in progress  
**Replaces:** coarse `agency_memberships.membership_role` checks (`OWNER` | `ADMIN` | `MEMBER`) with a least-privilege, agency-scoped, auditable permission model.

---

## 1. Problem

Today Pholio has two authorization layers:

| Layer | Storage | Values | Enforcement |
|-------|---------|--------|-------------|
| Account type | `users.role` | `TALENT`, `AGENCY` | `requireRole('AGENCY')` on agency APIs |
| Membership seat | `agency_memberships.membership_role` | `OWNER`, `ADMIN`, `MEMBER` | `requireAgencyMembershipRole('OWNER','ADMIN')` on **7 settings/team routes only** |

Everything else (accept/decline, casting CRUD, messaging, interviews, discover invite, export) is open to **any** agency member. Frontend gates settings/team UI only; pipeline pages are unrestricted.

This is not least-privilege, not auditable for access changes, and cannot express “scout who can shortlist but not sign” or “agent who can book but not change house branding.”

---

## 2. Goals & non-goals

### Goals

1. **Explicit permission catalog** — every agency action maps to a stable permission key.
2. **Preset roles** — industry-aligned seats (Owner, Admin, Agent, Scout, Viewer) ship with curated defaults.
3. **Custom grants** — Owner/Admin can add or revoke individual permissions when a preset is wrong.
4. **Least privilege by default** — new members get the most restrictive sensible preset (`SCOUT`); promotions are deliberate.
5. **Agency-scoped** — permissions never cross `agency_id`; membership is the unit of authorization.
6. **Fully auditable** — who changed access, when, from what, with before/after snapshots.
7. **Defense in depth** — backend is source of truth; frontend hides/disables by effective permissions.

### Non-goals (v1)

- Multi-agency membership switcher (keep current “first active membership” behavior).
- Email invite / account provisioning flow (unchanged — add existing agency login).
- Talent-side RBAC (separate concern).
- Billing/subscription permissions (no billing backend yet).
- Divisions/representation persistence (settings placeholders stay “Soon”).
- ABAC / row-level filters (e.g. “only my assigned applications”) — future phase.

---

## 3. Industry research → preset roles

Research sources: modeling/casting agency operations (mother-agent/placement split, New Faces → Development → Main Board ladder), SaaS RBAC patterns (preset + override grants), and Pholio’s existing seat copy in Settings/Team UI.

| Preset role | UI label | Typical agency seat | Default posture |
|-------------|----------|---------------------|-----------------|
| `OWNER` | Principal | Agency principal / legal owner | Full access; one immutable seat per agency |
| `ADMIN` | Managing Agent | Partner, head booker, office lead | Full operational access; can manage team & permissions; cannot transfer ownership |
| `AGENT` | Agent · Booker | Signing agent, booker | Pipeline, casting, roster, comms; **no** org settings or team management |
| `SCOUT` | Scout · Junior | Scout, junior, intern | Discover + review + shortlist + notes; **no** sign/decline/archive/export |
| `VIEWER` | Observer | Finance, legal, guest | Read-only across dashboard |

**Legacy migration mapping**

| Old `membership_role` | New preset | Rationale |
|----------------------|------------|-----------|
| `OWNER` | `OWNER` | unchanged |
| `ADMIN` | `ADMIN` | unchanged |
| `MEMBER` | `SCOUT` | matches existing “Scout · Junior” copy and intended least privilege |

---

## 4. Permission model

### 4.1 Permission key format

Namespaced dot notation: `{domain}.{action}`

Examples: `applications.accept`, `team.grant_permission`, `boards.delete`

Stable strings stored in DB and referenced in code — never derive from route paths at runtime.

### 4.2 Evaluation algorithm

For membership `M` at agency `A`, effective permissions =

```
effective(M) = (PRESET[M.role] ∪ M.allow_grants) \ M.deny_grants
```

Rules:

1. **Preset bundle** — defined in code (`src/domains/agency/lib/permissions.js`), versioned with migrations when presets change.
2. **Allow grants** — additive overrides stored in `agency_membership_permissions` where `effect = 'ALLOW'`.
3. **Deny grants** — subtractive overrides where `effect = 'DENY'`; **deny wins** over preset and allow grants.
4. **Owner immutability** — `OWNER` always receives full catalog; deny grants cannot be applied to `OWNER`.
5. **Grant authority** — only principals with `team.assign_role` **and** `team.grant_permission` may change roles/grants; `ADMIN` has both; custom grants cannot elevate above grantor’s own permissions (see §6.3).

### 4.3 Permission catalog

Grouped by product surface. **Required** = enforced on matching API route in v1.

#### Organization (`org.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `org.view` | View agency profile (`GET /me`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org.edit_profile` | Update identity fields | ✓ | ✓ | | | |
| `org.edit_branding` | Logo, brand color | ✓ | ✓ | | | |
| `org.edit_settings` | Notifications, default view | ✓ | ✓ | | | |
| `org.complete_onboarding` | Mark onboarding complete | ✓ | ✓ | | | |
| `org.export_data` | CSV/JSON export | ✓ | ✓ | | | |
| `org.view_analytics` | Analytics page/API | ✓ | ✓ | ✓ | | ✓ |
| `org.view_activity` | Global activity feed | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org.transfer_ownership` | Transfer OWNER seat | ✓ | | | | |

#### Team & access (`team.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `team.view` | List members | ✓ | ✓ | ✓ | ✓ | ✓ |
| `team.invite` | Add existing agency login | ✓ | ✓ | | | |
| `team.assign_role` | Change member preset role | ✓ | ✓ | | | |
| `team.deactivate` | Soft-remove member | ✓ | ✓ | | | |
| `team.grant_permission` | Add allow/deny overrides | ✓ | ✓ | | | |
| `team.revoke_permission` | Remove overrides | ✓ | ✓ | | | |
| `team.view_audit` | View access audit log | ✓ | ✓ | | | |

#### Discover & scouting (`discover.*`, `talent.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `discover.search` | Hybrid discover search | ✓ | ✓ | ✓ | ✓ | ✓ |
| `discover.view_preview` | Profile preview card | ✓ | ✓ | ✓ | ✓ | ✓ |
| `discover.view_details` | Full profile details | ✓ | ✓ | ✓ | ✓ | ✓ |
| `discover.invite` | Invite talent to apply | ✓ | ✓ | ✓ | ✓ | |
| `talent.claim` | Legacy claim endpoint | ✓ | ✓ | | | |
| `talent.download_comp_card` | Download comp card PDF | ✓ | ✓ | ✓ | | |

#### Applicants & pipeline (`applications.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `applications.view_list` | List/filter applicants | ✓ | ✓ | ✓ | ✓ | ✓ |
| `applications.view_detail` | Application detail | ✓ | ✓ | ✓ | ✓ | ✓ |
| `applications.view_timeline` | Activity timeline | ✓ | ✓ | ✓ | ✓ | ✓ |
| `applications.update_status` | Shortlist / stage moves | ✓ | ✓ | ✓ | ✓ | |
| `applications.accept` | Accept / sign talent | ✓ | ✓ | ✓ | | |
| `applications.decline` | Decline | ✓ | ✓ | ✓ | | |
| `applications.archive` | Archive | ✓ | ✓ | ✓ | | |
| `applications.bulk_accept` | Bulk accept | ✓ | ✓ | ✓ | | |
| `applications.bulk_decline` | Bulk decline | ✓ | ✓ | ✓ | | |
| `applications.bulk_archive` | Bulk archive | ✓ | ✓ | ✓ | | |
| `applications.bulk_update_status` | Bulk stage update | ✓ | ✓ | ✓ | ✓ | |

#### Casting / boards (`boards.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `boards.view` | List/view boards | ✓ | ✓ | ✓ | ✓ | ✓ |
| `boards.create` | Create board | ✓ | ✓ | ✓ | | |
| `boards.edit` | Update board metadata | ✓ | ✓ | ✓ | | |
| `boards.delete` | Delete board | ✓ | ✓ | | | |
| `boards.duplicate` | Duplicate board | ✓ | ✓ | ✓ | | |
| `boards.edit_requirements` | Requirements | ✓ | ✓ | ✓ | | |
| `boards.edit_weights` | Scoring weights | ✓ | ✓ | | | |
| `boards.recalculate_scores` | Recalculate matches | ✓ | ✓ | ✓ | | |
| `boards.view_pipeline` | Board candidates | ✓ | ✓ | ✓ | ✓ | ✓ |
| `boards.assign_application` | Assign app to board | ✓ | ✓ | ✓ | ✓ | |
| `boards.move_stage` | Casting stage transitions | ✓ | ✓ | ✓ | ✓ | |

#### Roster (`roster.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `roster.view` | List signed roster | ✓ | ✓ | ✓ | ✓ | ✓ |
| `roster.view_profile` | Roster profile detail | ✓ | ✓ | ✓ | ✓ | ✓ |
| `roster.manage_status` | Availability/booking status | ✓ | ✓ | ✓ | | |
| `roster.message` | Message roster talent | ✓ | ✓ | ✓ | | |

#### Collaboration (`notes.*`, `tags.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `notes.view` | Read notes | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notes.create` | Add notes | ✓ | ✓ | ✓ | ✓ | |
| `notes.edit` | Edit notes | ✓ | ✓ | ✓ | | |
| `notes.delete` | Delete notes | ✓ | ✓ | ✓ | | |
| `tags.view` | View tags | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tags.add` | Add tags | ✓ | ✓ | ✓ | ✓ | |
| `tags.remove` | Remove tags | ✓ | ✓ | ✓ | | |
| `tags.bulk_add` | Bulk tag | ✓ | ✓ | ✓ | ✓ | |
| `tags.bulk_remove` | Bulk untag | ✓ | ✓ | ✓ | | |

#### Messaging (`messages.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `messages.view_threads` | Inbox threads | ✓ | ✓ | ✓ | ✓ | ✓ |
| `messages.view` | Read conversation | ✓ | ✓ | ✓ | ✓ | ✓ |
| `messages.send` | Send messages | ✓ | ✓ | ✓ | | |
| `messages.mark_read` | Mark read | ✓ | ✓ | ✓ | ✓ | ✓ |

#### Interviews (`interviews.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `interviews.view` | List interviews | ✓ | ✓ | ✓ | ✓ | ✓ |
| `interviews.schedule` | Schedule | ✓ | ✓ | ✓ | ✓ | |
| `interviews.update` | Reschedule / edit | ✓ | ✓ | ✓ | ✓ | |
| `interviews.complete` | Mark complete | ✓ | ✓ | ✓ | | |
| `interviews.cancel` | Cancel | ✓ | ✓ | ✓ | | |

#### Reminders (`reminders.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `reminders.view` | List reminders | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reminders.create` | Create | ✓ | ✓ | ✓ | ✓ | |
| `reminders.update` | Edit | ✓ | ✓ | ✓ | ✓ | |
| `reminders.complete` | Complete | ✓ | ✓ | ✓ | ✓ | |
| `reminders.snooze` | Snooze | ✓ | ✓ | ✓ | ✓ | |
| `reminders.delete` | Delete | ✓ | ✓ | ✓ | | |

#### Notifications (`notifications.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `notifications.view` | List | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notifications.mark_read` | Mark one read | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notifications.mark_all_read` | Mark all read | ✓ | ✓ | ✓ | ✓ | ✓ |

#### Workspace (`filters.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `filters.view` | List presets | ✓ | ✓ | ✓ | ✓ | ✓ |
| `filters.create` | Create preset | ✓ | ✓ | ✓ | ✓ | |
| `filters.edit` | Update preset | ✓ | ✓ | ✓ | | |
| `filters.delete` | Delete preset | ✓ | ✓ | | | |
| `filters.set_default` | Set agency default | ✓ | ✓ | | | |

#### Overview (`overview.*`)

| Key | Description | OWNER | ADMIN | AGENT | SCOUT | VIEWER |
|-----|-------------|:-----:|:-----:|:-----:|:-----:|:------:|
| `overview.view` | Overview KPIs | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 5. Architecture

### 5.1 Approach comparison

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Preset roles + DB grant overrides** | Matches agency mental model; easy Team UI; auditable | Two concepts (role + grants) | **Recommended** |
| **B. Pure permission sets (no named roles)** | Maximum flexibility | Poor UX for team management; hard to explain | Reject for v1 |
| **C. External auth (Auth0 FGA, SpiceDB)** | Enterprise-grade | Overkill; latency; cost | Reject for v1 |

### 5.2 Data model

#### Extend `agency_memberships`

```sql
-- membership_role enum expands: OWNER | ADMIN | AGENT | SCOUT | VIEWER
-- (MEMBER deprecated; migrated to SCOUT)
ALTER TABLE agency_memberships
  ADD COLUMN preset_role VARCHAR(20) NOT NULL DEFAULT 'SCOUT';
-- Backfill: preset_role = membership_role with MEMBER → SCOUT
-- Deprecate membership_role column after migration window (keep synced in v1)
```

#### New: `agency_membership_permissions`

```sql
CREATE TABLE agency_membership_permissions (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES agency_memberships(id) ON DELETE CASCADE,
  permission_key VARCHAR(80) NOT NULL,
  effect VARCHAR(5) NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  reason TEXT,
  granted_by_membership_id UUID REFERENCES agency_memberships(id),
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (membership_id, permission_key, effect)
);
CREATE INDEX idx_amp_agency ON agency_membership_permissions(agency_id);
CREATE INDEX idx_amp_membership ON agency_membership_permissions(membership_id);
```

#### New: `agency_audit_events`

Append-only, agency-scoped audit trail for **access control** and sensitive org actions.

```sql
CREATE TABLE agency_audit_events (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  actor_membership_id UUID REFERENCES agency_memberships(id),
  actor_user_id UUID REFERENCES users(id),
  event_type VARCHAR(60) NOT NULL,
  -- e.g. team.member_added, team.role_changed, team.permission_granted,
  --     team.permission_revoked, team.member_deactivated, org.settings_updated
  target_type VARCHAR(40),  -- membership | agency | application | ...
  target_id UUID,
  summary TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_aae_agency_created ON agency_audit_events(agency_id, created_at DESC);
CREATE INDEX idx_aae_type ON agency_audit_events(event_type);
```

#### Fix: `application_activities.user_id`

Continue writing **`memberUserId`** (human actor), not `agencyId`, for all new activity rows. Backfill not required for v1.

### 5.3 Backend modules

| Module | Path | Responsibility |
|--------|------|----------------|
| Permission catalog | `src/domains/agency/lib/permissions.js` | All keys, preset matrices, helpers |
| Effective permissions | `src/domains/agency/services/permissions.js` | `resolveEffectivePermissions(membershipId)` |
| Middleware | `src/domains/auth/middleware/require-auth.js` | Add `requireAgencyPermission(...keys)` |
| Audit writer | `src/domains/agency/services/audit.js` | `recordAuditEvent({...})` |
| Route guards | All `src/domains/agency/routes/*.js` | Replace role checks with permission checks |

**`requireAgencyPermission('applications.accept')`**

1. Ensure session has `agencyId`, `memberUserId`, `membershipId` (new session field).
2. Load effective permissions (DB + preset; cache in `req.permissions` per request).
3. 403 JSON with `{ error, requiredPermissions, missingPermissions }` if fail.

**Session bootstrap (`GET /api/session`)**

Return:

```json
{
  "role": "AGENCY",
  "agencyId": "...",
  "memberUserId": "...",
  "membershipId": "...",
  "presetRole": "AGENT",
  "permissions": ["applications.view_list", "..."]
}
```

Frontend caches permissions in React context (`AgencyPermissionsProvider`).

### 5.4 API route → permission map (representative)

| Route | Permission(s) |
|-------|---------------|
| `PUT /api/agency/profile` | `org.edit_profile` |
| `POST /api/agency/branding` | `org.edit_branding` |
| `PUT /api/agency/settings` | `org.edit_settings` |
| `GET /api/agency/export` | `org.export_data` |
| `POST /api/agency/team` | `team.invite` |
| `PATCH /api/agency/team/:id` | `team.assign_role` |
| `DELETE /api/agency/team/:id` | `team.deactivate` |
| `GET /api/agency/applications` | `applications.view_list` |
| `POST /api/agency/applications/:id/accept` | `applications.accept` |
| `POST /api/agency/boards` | `boards.create` |
| `DELETE /api/agency/boards/:id` | `boards.delete` |
| `POST /api/agency/discover/:id/invite` | `discover.invite` |
| `POST /api/agency/applications/:id/messages` | `messages.send` |
| `POST /api/agency/applications/:id/interviews` | `interviews.schedule` |
| … | (full map in implementation plan) |

New team permission endpoints:

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/agency/team/:membershipId/permissions` | `team.view` |
| PUT | `/api/agency/team/:membershipId/permissions` | `team.grant_permission` |
| DELETE | `/api/agency/team/:membershipId/permissions/:permissionKey` | `team.revoke_permission` |
| GET | `/api/agency/audit` | `team.view_audit` |

---

## 6. Custom permission rules

### 6.1 When to use

Use custom grants when:

- A **SCOUT** needs `applications.accept` for a trusted junior booker without promoting to **AGENT**.
- An **AGENT** must not delete boards → add `DENY boards.delete` without changing role.
- Temporary access → set `expires_at` on allow grant.

### 6.2 UI (Team page extension)

On `TeamMemberCard` kebab (managers only, not OWNER row):

- **Change role** → preset selector (ADMIN, AGENT, SCOUT, VIEWER).
- **Custom access…** → modal listing permission groups with toggles:
  - Toggle ON → create/update `ALLOW` grant (only for permissions not already in preset).
  - Toggle OFF on preset permission → create `DENY` grant.
  - Show “Inherited from Agent · Booker” vs “Custom allow” vs “Custom deny” chips.

### 6.3 Grant elevation guard

When grantor `G` assigns permission `P` to target `T`:

```
require P ∈ effective(G)
require T.preset_role != 'OWNER'
require G cannot modify G's own permissions (except OWNER)
```

Only **OWNER** may assign `team.grant_permission`, `team.assign_role`, and `org.transfer_ownership` to others. **ADMIN** may assign roles up to **AGENT** and grants within their own effective set excluding team-admin keys.

### 6.4 Dangerous permissions (require confirm in UI)

- `org.export_data`
- `applications.accept`, `applications.bulk_accept`
- `boards.delete`
- `team.assign_role`, `team.grant_permission`
- `org.transfer_ownership`

---

## 7. Frontend enforcement

### 7.1 `useAgencyPermissions()` hook

```js
const { can, canAny, canAll, presetRole, permissions } = useAgencyPermissions();
can('applications.accept'); // boolean
```

### 7.2 Surfaces to gate

| Surface | Gate |
|---------|------|
| Nav items | Hide Discover if `!can('discover.search')`, etc. |
| TalentActionBar | Per-action `can()` |
| BulkActionToolbar | Per-action |
| Settings panels | `org.edit_*` |
| Team management | `team.*` |
| Casting board CRUD | `boards.*` |
| Export button | `org.export_data` |

**Pattern:** hide if no permission; show disabled + tooltip “You don’t have access” only when item is contextually visible to managers previewing as… (optional v2).

### 7.3 403 handling

API 403 with `missingPermissions` → toast: “You don’t have permission to do that. Ask your Principal or Managing Agent.”

---

## 8. Auditing

### 8.1 Events (minimum v1)

| Event type | Trigger |
|------------|---------|
| `team.member_added` | POST `/team` |
| `team.role_changed` | PATCH `/team/:id` |
| `team.member_deactivated` | DELETE `/team/:id` |
| `team.permission_granted` | PUT permissions (ALLOW) |
| `team.permission_revoked` | DELETE permission / DENY removed |
| `team.permission_denied` | PUT permissions (DENY) |
| `org.profile_updated` | PUT profile |
| `org.settings_updated` | PUT settings |
| `org.branding_updated` | POST branding |
| `org.ownership_transferred` | Future transfer endpoint |

Each event stores `before_state` / `after_state` JSON snapshots (role, grants, settings diff).

### 8.2 Viewing audit log

- Settings → Team & Permissions → “Access history” (ADMIN+ with `team.view_audit`).
- Team page link for OWNER/ADMIN.
- Paginated `GET /api/agency/audit?cursor=&event_type=`.

### 8.3 Application activity attribution

All writes to `application_activities` must set `user_id = req.session.memberUserId`. Activity types unchanged; actor is now reliably the human.

---

## 9. Migration & rollout

### Phase 1 — Schema + resolver (no enforcement)

1. Migration: tables + `preset_role` column + backfill.
2. Permission catalog + `resolveEffectivePermissions`.
3. Session/API returns permissions array.
4. Seed script + demo users for all preset roles.

### Phase 2 — Backend enforcement

1. Add `requireAgencyPermission` to all agency routes.
2. Replace `requireAgencyMembershipRole` with permission checks.
3. Audit writer on team/org mutations.
4. Integration tests per role matrix (table-driven).

### Phase 3 — Frontend enforcement

1. `AgencyPermissionsProvider` from session.
2. Gate nav, action bars, settings.
3. Team UI: role selector + custom access modal.
4. Settings seat copy updated to five presets.

### Phase 4 — Cleanup

1. Stop writing `membership_role`; read from `preset_role` only.
2. Drop `membership_role` column (separate migration after deploy soak).
3. Fix `/api/public/session` team-member breakage (use `memberUserId`).

### Rollback safety

Feature flag `AGENCY_RBAC_ENFORCE=false` bypasses permission middleware (logs violations) for staged rollout.

---

## 10. Security considerations

- **Server-side only** — never trust frontend permission checks for authorization.
- **IDOR** — all queries scoped by `req.session.agencyId`; membership permission rows validated against same agency.
- **Self-escalation** — grantor subset rule (§6.3); cannot edit own grants unless OWNER.
- **OWNER lock** — exactly one active OWNER; transfer requires `org.transfer_ownership` two-step confirm.
- **Inactive members** — `status != ACTIVE` → zero permissions.
- **Session invalidation** — role/grant changes do not require logout; next request reloads permissions.

---

## 11. Testing strategy

1. **Unit:** preset matrix completeness (every catalog key assigned to at least one role); deny-wins logic.
2. **Integration:** for each preset role, table of `{ method, path, expectStatus }`.
3. **Regression:** existing agency demo seed works; OWNER can still manage team.
4. **Audit:** mutating calls emit exactly one audit row with correct before/after.

---

## 12. Open decisions (defaults chosen)

| Question | Default |
|----------|---------|
| Rename column `membership_role` → `preset_role`? | Add `preset_role`, sync both in v1, drop old later |
| Can ADMIN create ADMIN? | No — only OWNER promotes to ADMIN |
| SCOUT send messages? | No by default; grant `messages.send` if needed |
| VIEWER see applicant PII (email/phone)? | Yes for view permissions; redact in v2 if needed |

---

## 13. Files to create/modify (implementation preview)

| Action | File |
|--------|------|
| New migration | `migrations/20260607120000_agency_rbac.js` |
| New | `src/domains/agency/lib/permissions.js` |
| New | `src/domains/agency/services/permissions.js` |
| New | `src/domains/agency/services/audit.js` |
| Modify | `src/domains/auth/middleware/require-auth.js` |
| Modify | `src/domains/auth/routes/auth.js` (session fields) |
| Modify | All agency route files |
| New | `tests/integration/agency-rbac.test.js` |
| New | `client/src/domains/agency/hooks/useAgencyPermissions.js` |
| New | `client/src/domains/agency/context/AgencyPermissionsProvider.jsx` |
| Modify | Team page/components, Settings, nav, action bars |

---

## 14. Success criteria

- [ ] MEMBER migrated to SCOUT loses accept/decline/export/board-delete on API (403).
- [ ] AGENT can run full pipeline but gets 403 on `PUT /settings`.
- [ ] OWNER/ADMIN can grant SCOUT `applications.accept` without role change; audit row written.
- [ ] DENY grant removes preset permission; audit row written.
- [ ] `GET /api/session` includes full permission list.
- [ ] Frontend hides actions user cannot perform.
- [ ] All team/org mutations appear in `agency_audit_events`.

---

**Next step:** User approval of this spec → implementation plan at `docs/superpowers/plans/2026-06-07-agency-rbac.md`.
