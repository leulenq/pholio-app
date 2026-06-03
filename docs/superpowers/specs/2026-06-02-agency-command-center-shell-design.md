# Agency Command Center — Shell & Overview Redesign

**Date:** 2026-06-02
**Branch:** `feat/custom-pricing-stripe` (will branch for implementation)
**Scope of this spec:** The agency **shell** (`AgencyLayout`) and the **Overview** dashboard only. Other agency pages keep working inside the new shell and are restyled in a later pass.

---

## 1. Intent

The agency product currently shares its skeleton with the talent dashboard — a centered horizontal top‑nav over a light stone canvas with gold accents. That makes the two read as siblings. This redesign gives the agency its own **posture**: a luxury **agency operating system** — editorial, architectural, operational, decision‑oriented — while staying unmistakably Pholio in color and polish.

Three non‑negotiables from the brief:

1. **Distinct system.** Break from the talent top‑nav. The agency gets a persistent **left command rail** shell.
2. **Team‑first.** The agency is a *workspace* with many member accounts, presence, and assignable work — not a single‑user dashboard. (Backend already models this.)
3. **Co‑branded.** A `PHOLIO ｜ AGENCY` lockup so it reads as *Pholio powering the agency's workspace*.

Reference direction: the shared Dribbble fintech layout (left sidebar · center · right column), **adapted** to be sharper, more editorial, less round/soft — a fashion‑agency command center, not a fintech app.

---

## 2. Design language

Built on existing tokens (`agency-tokens.css`, brand gold `#C9A55A`, Playfair/Noto serif). The shift is in *posture*, not palette.

| Aspect | Direction |
|---|---|
| **Sidebar** | Deep warm ink (`#14110B`) with subtle grain — an architectural anchor. Gold wordmark + glowing gold active marker. |
| **Canvas** | Warm stone (`#F7F3EC`) with a soft gold radial light bleeding from the top‑right + a faint grain layer, so it feels lit and material, not flat. |
| **Corners** | Near‑square: **2–5px** radii. No pills, no 16px cards. |
| **Surfaces** | Hairline rules (`1px`, fading gradient) over drop shadows. Stats and sections sit *on the canvas*, separated by rules — not floated in white boxes. |
| **Type** | Playfair serif for headlines + big numerals (the "ledger"); tiny uppercase tracked labels (`letter-spacing:.16–.22em`) for structure; Inter for body. |
| **Accent** | Gold used *sparingly* — active rail marker, the single hero figure, one primary CTA, the co‑brand wordmark. |
| **Motion** | Spring physics consistent with the app (`stiffness ~60, damping ~14`), staggered entrance, hero number count‑up. Honors `prefers-reduced-motion`. |
| **Texture** | Reuse the agency **Grainient** signature (grain + gradient) as the atmospheric layer. |

---

## 3. Information architecture

Nav is **grouped by function** in the rail (this grouping is itself a differentiator from the flat talent nav):

- **Monitor** — Overview, Activity
- **Pipeline** — Applicants (count), Casting (count), Interviews
- **Roster** — Talent, Discover
- **Agency** — Team (member count), Analytics

Settings + the member account live in the sidebar footer. Routes are unchanged from today's `App.jsx`; this is a presentation/grouping change, not a routing change.

---

## 4. The shell (`AgencyLayout`)

A three‑zone persistent shell: **left rail · center main (`<Outlet/>`) · optional right column**.

### 4.1 Co‑brand lockup (rail header)
`PHOLIO` (gold serif) · hairline divider · agency logo mark + name. Below it a tracked meta line: `Powering · {location} · {season} · {N} members`.
- Agency mark uses `agency.logo_path` when present; otherwise a gold monogram from the agency name initial.
- Reads as Pholio enabling *their* workspace.

### 4.2 Collapsible rail
- **Expanded** (~198px): full lockup, section labels, nav labels, counts, member chip.
- **Collapsed** (~64px): Pholio monogram + agency mark, icon‑only nav (section labels hidden, tooltips on hover), member avatar only.
- Toggle via the `«` / `»` control in the header. State persists in `localStorage` (`pholio.agency.railCollapsed`). Smooth width transition; main content reflows.

### 4.3 Grouped nav
`NavLink`s with tracked uppercase section headers. Active item: cream text + a glowing gold left marker. Counts (applicants/casting/team) bind to real data where available.

### 4.4 Member account chip (footer) — *distinct from the workspace*
Avatar + `{firstName lastName}` + role label (`{role} · {membership_role}`) + chevron → dropdown (My profile, Workspace settings, Sign out). This is the **logged‑in person**; the header lockup is the **workspace**. Keeping them separate is what makes the shell team‑aware rather than single‑user.

### 4.5 Masthead (top of main)
- **Left:** editorial status line — `The Floor · {Season} · {Location} · {time}` (tracked uppercase) over a hairline rule.
- **Right:** **team presence** (stacked avatars of workspace members + `+N`), a divider, then search + notifications/messages as minimal ghost controls (reusing existing `MessagesDropdown` / `NotificationsDropdown` / `UserDropdown` behavior).

---

## 5. Overview command center

Replaces today's hero → attention strip → KPI bento → charts → apps rhythm with a sharper editorial composition, bound to the **real** `GET /api/agency/overview` endpoint (currently the page renders hardcoded mock data).

1. **Greeting** — `Good evening, {firstName}.` (Playfair) + a decision‑oriented subline derived from real alerts (e.g. "Your team has {n} decisions pending").
2. **Pipeline Command hero** — an immersive, cover‑style band: ink panel (the single most decision‑demanding number — `kpis.pendingReview` — with count‑up + copy + primary/secondary CTAs) bleeding via a gradient scrim into a featured talent portrait. The agency analog of the reference's hero balance card.
3. **Stat ledger** — 4 KPIs (`activeCastings`, `rosterSize`, `placementRate`, `utilization`/in‑market) as a single ruled row separated by vertical hairlines — numerals in serif, deltas as tracked micro‑labels. No boxes.
4. **Casting pipeline** — a refined full‑width segmented bar framed by hairlines (not a card), bound to `pipeline`, with a tracked legend. Under‑review segment glows gold.
5. **Right column** — `Incoming` (real recent applicants, 3:4 portrait crops, serif match score) + `On the floor` (real `alerts`/`pulse` as a ruled operational list). Glassy, ruled — not a hard white panel.

Selecting an applicant opens the existing `TalentPanel`.

---

## 6. Team model & data binding

The backend **already** supports the team model — no new tables required for slice 1:

- `agencies` (workspace): `name`, `slug`, `location`, `logo_path`, `brand_color` → co‑brand lockup, masthead context.
- `agency_memberships`: `membership_role` (`OWNER|ADMIN|MEMBER`), `status` → member chip role label, presence list.
- Session context (`services/context.js`) returns `{ agency, membership, user }` → workspace vs. member split.

| Surface | Source | Status |
|---|---|---|
| Co‑brand workspace identity | `getAgencyProfile()` (`agency.name`, `logo_path`, `brand_color`, `location`) | **Real** |
| Logged‑in member + role | profile/context (`first_name`, `membership_role`) | **Real** |
| Team presence avatars + Team count | `getAgencyTeam()` → members list | **Real** (workspace members; not live online‑status) |
| Overview KPIs / pipeline / talentMix / alerts / pulse | `getAgencyOverview()` | **Real** (wire up; replaces mock) |
| Recent applicants ("Incoming") | `getRecentApplicants()` | **Real** |

New client hooks: `useAgencyOverview()` and `useAgencyTeam()` (React Query, parallel to existing `useStats`). The shell reads team/profile; Overview reads overview + recent applicants.

**Honesty note:** "presence" shows real workspace members, labeled as team — not a real‑time online indicator (no presence service exists). Copy will reflect that.

---

## 7. Assignment layer — designed, deferred (Phase 2)

Per‑applicant **assignment** (owner avatars on items, a working **Mine / Team** filter) requires backend that does **not** exist yet (no `assigned_to` on `applications`, no assignment endpoints). To avoid faking it:

- **Slice 1 builds the structural slots** for ownership (the layout reserves the owner‑avatar position and the Mine/Team toggle location) but ships them **only where real**: the Mine/Team toggle is present and functional once assignment lands; until then the Overview shows the **team** view and the toggle is either hidden or disabled with a "coming soon" affordance (decided at build time, default: hidden).
- **Phase 2** (separate spec): `applications.assigned_to` column + assign/unassign endpoints + the Mine/Team filtering and owner avatars wired for real. Mentioned here so the shell is laid out to receive it without rework.

This keeps slice 1 fully real and verifiable while honoring "designed around a team structure from the start."

---

## 8. Roles

Decision: **flat team, no permission gating in slice 1.** The shell *displays* `membership_role` (Owner/Admin/Member) on the member chip, but does not branch nav or actions by role. (Backend already enforces OWNER/ADMIN on team‑mutation endpoints; we simply don't add new UI gating.) Role‑aware UI is a later concern.

---

## 9. Behavior, responsive, accessibility

- **Collapse:** persisted; `aria-expanded` on toggle; tooltips for icon‑only nav.
- **Responsive:** ≥1280px three‑zone; 1024–1280 right column collapses into the main scroll; <1024 rail becomes an off‑canvas drawer (hamburger in masthead). (Tablet/mobile polish can trail desktop but must not break.)
- **A11y:** nav is a labeled landmark; active state not color‑only (gold marker + weight + `aria-current`); presence avatars have names in `title`/`aria-label`; keyboard‑navigable dropdowns (preserve existing focus‑return behavior in `AgencyLayout`); honors `prefers-reduced-motion` for count‑up, entrance, hero parallax.
- **Discover page** keeps its dark cosmic treatment — the new rail/masthead must remain legible over it (carry forward the existing `ag-shell--discover` override pattern).

---

## 10. File plan (slice 1)

**Rebuild**
- `client/src/shared/layouts/AgencyLayout.jsx` + `AgencyLayout.css` — three‑zone shell, co‑brand lockup, collapsible grouped rail, member chip, editorial masthead with presence. Preserve existing dropdown wiring + focus management.
- `client/src/domains/agency/pages/OverviewPage.jsx` + `OverviewPage.css` — command‑center composition bound to real data; drop mock arrays.

**Add**
- `client/src/domains/agency/hooks/useAgencyOverview.js`, `useAgencyTeam.js`.
- Small shell components: `nav/CoBrandLockup`, `nav/MemberAccountChip`, `nav/TeamPresence`, `nav/RailNav` (extract for testability/focus), plus Overview pieces `PipelineCommandHero`, `StatLedger`, `CastingPipelineBar`, `IncomingList`, `OnTheFloorList`.
- Reuse existing `Grainient`, `TalentMatchRing`/`MatchScoreRing`, `TalentPanel`, dropdown components.

**Constants**
- New `agencyNav` grouping constant (parallel to `talentNav`).

**Unchanged**
- Routes in `App.jsx`, all backend, other agency pages (inherit the shell; restyle later).

---

## 11. Out of scope (this spec)

- Backend assignment model + Mine/Team data (Phase 2).
- Real‑time presence service.
- Role‑based UI gating.
- Restyling Applicants/Casting/Roster/Discover/Analytics/Settings internals (they inherit the shell now, get their own pass later).
- Notifications endpoint (still mock in the shell; unchanged).

---

## 12. Risks

- **Shell regression surface:** every agency page renders inside `AgencyLayout`. Mitigate by preserving outlet contract, dropdown wiring, and the `ag-shell--discover` override; smoke every route after.
- **Real Overview data may be sparse/empty** for new agencies — design explicit empty states (reuse `AgencyEmptyState`) for the hero, ledger, pipeline, and lists.
- **Collapse + right column + Discover dark mode** interaction — verify all combinations.
- **Co-brand with missing/oversized agency logos** — enforce a framed, object‑fit mark with monogram fallback.
