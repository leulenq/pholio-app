# Agency Team Page — Design Spec

**Date:** 2026-06-07
**Status:** Approved for implementation (user delegated the decision)
**Surface:** `client/src/domains/agency/pages/TeamPage.jsx` (`/dashboard/agency/team`)

## 1. Purpose

The Team page is the **human center** of the agency shell — where a user sees their
whole agency: who is on the team, their roles, and how they relate. It must feel
warm, grounded, premium, and lived-in — like arriving at the agency's home — rather
than a cold internal directory.

## 2. Backend reality (no changes required)

Real team system already exists.

- **`GET /api/agency/team`** → `getAgencyTeam()` → `{ success, data: members[] }`
  (the `apiClient` unwraps to the array; `useAgencyTeam()` already selects
  `Array.isArray(data) ? data : data?.members ?? []`).
- **Member shape** (`serializeAgencyMember`): `membershipId`, `userId`, `agencyId`,
  `email`, `first_name`, `last_name`, `full_name`, `membership_role`
  (`OWNER` | `ADMIN` | `MEMBER`), `status` (`ACTIVE` | `INACTIVE`),
  `invited_at`, `joined_at`, `created_at`, `updated_at`.
- **`POST /api/agency/team`** → `addAgencyTeamMember({ email, membership_role })`.
  Adds an **existing provisioned agency login** by email; role ∈ `ADMIN` | `MEMBER`
  (default `MEMBER`). 404 if no such agency user; 409 if already active.
  Gated to `OWNER`/`ADMIN`.
- **`PATCH /api/agency/team/:membershipId`** →
  `updateAgencyTeamMember(id, { membership_role })`. Role ∈ `ADMIN` | `MEMBER`.
  Cannot change `OWNER`; cannot change yourself. Gated to `OWNER`/`ADMIN`.
- **`DELETE /api/agency/team/:membershipId`** → `removeAgencyTeamMember(id)`
  (soft → `status: INACTIVE`). Cannot remove `OWNER`; cannot remove yourself.
  Gated to `OWNER`/`ADMIN`.
- **Current user + agency identity:** `getAgencyProfile()` → `/me` → `profile`
  with `id` (current user id), `first_name`, `last_name`, `email`, `agency_name`,
  `agency_logo_path` / `logo_path`. The shell derives the viewer's role exactly as:
  `team.find((m) => m.userId === profile?.id)?.membership_role`.

**No migration, route, or API-client additions are required.**

## 3. Information architecture

- **Masthead** (editorial header):
  - Co-brand line: `PHOLIO · {agency_name}` (logo if `agency_logo_path` present,
    else the name).
  - Serif title: **The Team**.
  - Human subline: `{N} people · together since {year}` where `year` = earliest
    member `joined_at`/`created_at` (omit the "since" clause if unknown).
  - **Add member** button — visible only to `OWNER`/`ADMIN`.
  - Soft warm gold radial-gradient wash behind the masthead (CSS only, no WebGL).
- **Groups** (active members only):
  1. **Leadership** — `OWNER` + `ADMIN`, owner first.
  2. **Team** — `MEMBER`.
  Each group: serif header + count. Empty groups are skipped.
- **Former members** — `INACTIVE` members hidden behind a small
  "Show former members ({n})" toggle, rendered muted. Skipped when none.

## 4. Visual identity

Warm light shell (`--ag-surface-0` canvas, `--ag-surface-1` cards), Playfair serif
headers, gold accents, `agency-tokens.css`. Standard transition
`all 0.2s cubic-bezier(0.4,0,0.2,1)`; framer-motion spring (`stiffness: 55,
damping: 16`) staggered entrances + hover lift.

**Recognition without photos:** deterministic monogram avatars. Initials from the
name; a warm hue derived from a stable hash of `userId`/name maps into a curated
palette (golds, terracotta, sage, clay — all muted, on-brand), so every face is
distinct and the wall feels alive.

## 5. Components

### 5.1 `TeamPage.jsx` (new)
- `useAgencyTeam()` for members; `useQuery(['agency-profile'], getAgencyProfile)`
  for the viewer + agency identity (shares the shell's cache key).
- Derives `me = team.find(m => m.userId === profile?.id)`, `myRole`,
  `canManage = myRole === 'OWNER' || myRole === 'ADMIN'`.
- Splits active members into Leadership / Team; collects inactive.
- Renders masthead, groups (gallery of `TeamMemberCard`), former-members toggle,
  and the add-member modal trigger.
- States: skeleton cards while loading; `EmptyErrorState` (retry) on error; a calm
  empty note only if no active members (degenerate — owner always exists).

### 5.2 `TeamMemberCard.jsx` (new)
Props: `member`, `isYou`, `canManage`, `agencyName?`.
- Monogram avatar (hue from helper), serif `full_name`, role chip
  (Owner = gold/filled, Admin = outline, Member = quiet), `email`, tenure line
  ("Joined Mar 2024" from `joined_at`/`created_at`).
- `isYou` → small "You" badge. `OWNER` → subtle gold ring/accent.
- **Kebab** (only when `canManage` AND target is not `OWNER` AND not `isYou`):
  - Make admin / Make member (role toggle) → `updateAgencyTeamMember`.
  - Remove from team (confirm) → `removeAgencyTeamMember`.
- Owns its mutations; on success → `invalidateQueries(['agency','team'])` +
  `sonner` toast. Kebab dropdown closes on outside click (scrim pattern).

### 5.3 `TeamAddModal.jsx` (new)
Portal modal in the `iv-`/`cn-` spirit (own `tm-` styles): email input (existing
agency login) + role segmented control (Admin / Member) → `addAgencyTeamMember`.
On success invalidate `['agency','team']` + toast + close. Surfaces the API's 404
("Only existing provisioned agency logins can be added") and 409 ("already a
member") as inline/toast errors.

### 5.4 `team-presence.js` (new helper)
`monogramOf(member)` and `hueOf(member)` → `{ bg, fg, ring }` from a stable hash,
plus `tenureLabel(member)`. Pure module (keeps card a single-component export for
fast-refresh lint).

### 5.5 Styling — `TeamPage.css` (new, `tm-` prefix)
Masthead (gradient wash, co-brand, serif title), group headers, person-card grid
(`repeat(auto-fill, minmax(...))`), monogram, role chips, kebab menu, and the
add-member modal. Uses `agency-tokens.css` custom properties.

## 6. Routing

Rewire `client/src/App.jsx`: `/dashboard/agency/team` →
`<AgencyTeam />` (new `TeamPage`) instead of `<AgencySettings />`.

## 7. Files

| Action | File |
| --- | --- |
| New | `client/src/domains/agency/pages/TeamPage.jsx` |
| New | `client/src/domains/agency/pages/TeamPage.css` |
| New | `client/src/domains/agency/components/TeamMemberCard.jsx` |
| New | `client/src/domains/agency/components/TeamAddModal.jsx` |
| New | `client/src/domains/agency/components/team-presence.js` |
| Edit | `client/src/App.jsx` (route + import) |
| Untouched (flagged) | `SettingsPage.jsx` `TeamSection` — still shows hardcoded sample members; out of scope, noted as follow-up |

No backend / migration / `agency.js` API-client changes.

## 8. Edge cases & decisions

- **Permissions mirror the backend exactly** so the UI never offers an action the
  API will reject: hide kebab for `OWNER` rows, for your own row, and for all
  non-managers. Backend remains the source of truth (defense in depth).
- **Tenure year** uses the earliest known `joined_at`/`created_at`; if all are
  null, drop the "since" clause rather than guessing.
- **Initials/hue** keyed on `userId` (stable) with name fallback, so a person keeps
  the same color across sessions.
- **Add-member reality:** only existing agency logins can be added (no email
  invites yet) — the modal copy says so to set expectations.
- **Inactive members** never count toward the masthead "N people" (active only).

## 9. Verification

- `cd client && npm run lint` clean for new/edited files.
- `npm run build` green.
- Manual: `/dashboard/agency/team` renders masthead with real agency name + count;
  Leadership/Team groups bucket correctly; "You" badge on the viewer; Owner styled
  distinctly; monogram hues stable and distinct.
- As Owner/Admin: Add member (existing login) → appears in the right group; change
  role moves a card between groups; remove → drops out (active count decrements),
  appears under "former members".
- As Member (or on Owner/self rows): no management affordances shown.
