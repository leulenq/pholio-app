# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pholio is a full-stack talent portfolio and agency management platform. Talent users create portfolios with images, generate PDF comp cards, and apply to agencies. Vetted agency users manage talent rosters, review submissions, and run casting/signing workflows. Pholio does not charge agencies and has no money/commission workflow.

## 🚧 Repo Boundaries (CRITICAL)

- **Marketing Site (`pholio-landing`):** `/Users/lenquanhone/Projects/pholio-landing`
  - Handles all public-facing marketing pages.
  - Handles all legal pages (Terms of Service, Privacy Policy, Submission Program Notice).
  - Any marketing-site content must go here.
- **Application Product (`pholio-app`):** `/Users/lenquanhone/Projects/pholio-app`
  - This is the application product repo *only*. Do not put marketing or legal site pages here.

## Tech Stack

- **Marketing Site:** Next.js 16 (TypeScript, Tailwind 4) in separate repo `pholio-landing`
- **Backend:** Node.js 20, Express 5, CommonJS modules in `src/`
- **Frontend:** React 19 SPA (Vite, ES modules) in `client/`
- **Database:** SQLite3 (local dev) or PostgreSQL/Neon (production), via Knex.js
- **Auth:** Firebase (Web SDK client-side, Admin SDK server-side) + Express sessions
- **Payments:** Stripe (subscriptions, webhooks)
- **PDF:** Puppeteer rendering HTML to PDF
- **Image Processing:** Sharp
- **AI:** Groq SDK for photo analysis
- **Styling:** TailwindCSS 4 + custom CSS + agency-tokens.css design token system
- **Icons:** Lucide React
- **Toasts:** Sonner
- **Drag & Drop:** @dnd-kit (sortable images)
- **Landing Animations:** GSAP + Lenis (smooth scroll) + Framer Motion

## 🚨 Visual Philosophy & Motion (CRITICAL)

**The Landing Page is the Gold Standard.** The Studio+ and Agency Perspective scene components in the marketing repo define the aesthetic language for the entire Pholio app.

- **Motion:** Highly dynamic, spring-based Framer Motion physics (`stiffness: 55, damping: 16`). The app must feel alive, tactile, and responsive (hover scales, smooth entrances, scroll-tied animations). Do not build static, lifeless pages.
- **Aesthetics:** High-polish tech/SaaS (glowing radial gradients, gamification, floating UI) blended with editorial serif typography.
- **Standard Transition:** `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`; smooth: `0.3s` same easing.

## Dashboard-Specific Claude Context

Pholio has separate dashboard instruction and design files. Before editing a dashboard surface, read the scoped guide in addition to this root file:

- **Talent dashboard:** `client/src/domains/talent/CLAUDE.md` and `client/src/domains/talent/DESIGN.md` for `/dashboard/talent/*`, `/reveal`, and talent-facing overlays.
- **Agency dashboard:** `client/src/domains/agency/CLAUDE.md` and `client/src/domains/agency/DESIGN.md` for `/dashboard/agency/*` and agency-facing overlays.
- **Onboarding:** `client/src/domains/onboarding/DESIGN.md` for `/onboarding/*`.
- **Root design router:** `DESIGN.md` explains which design system applies to each surface.

Do not average the talent and agency systems into one generic dashboard language. If a shared component is used by both dashboards, preserve the intentional differences documented in both domain design files.

## AI Agent Operating Rule (GLOBAL — all agents)

**Mandatory for Claude, Cursor, Codex, and any future coding agent.**  
Full rule: [`docs/ai-agent-operating-rule.md`](docs/ai-agent-operating-rule.md) (Cursor also always-applies `.cursor/rules/ai-agent-operating-rule.mdc`).

Optimize cost and tokens **without** sacrificing engineering quality. Use the smallest capable model; escalate for complexity, risk, final review, testing strategy, and production validation.

### Capability classes (map local model names to these)

- **Fast** (Haiku-class / mini / flash): lookups, tiny edits, formatting, log summaries, mechanical refactors.
- **Standard** (Sonnet-class / default): everyday implementation, routine refactors/tests, moderate debugging, single-surface UI.
- **Strong** (Opus-class / high): architecture, auth/payments/migrations/security, deep review, hard multi-system debugging, production validation.
- **Frontier** (Fable-class / strongest planner): broad redesigns, contested multi-agent plans, ambiguous architecture, very expensive-mistake work.

Default to Standard. De-escalate mechanical work. Escalate when blast radius or ambiguity rises. If a requested model is unavailable, use the nearest same-class model and state the substitution once.

Prefer **plan → execute → review** on non-trivial work: Strong/Frontier plans and high-risk reviews; Standard/Fast execute narrow slices. If the task is simple enough for one agent, that agent may plan, implement, review, test, and commit alone.

### Token control (summary)

Read narrowly; avoid re-reads; prefer diffs/symbols; offload exploration and return summaries; keep plans short; stop when acceptance criteria are met; batch independent tool calls. A failed cheap attempt that forces a full expensive redo is worse than starting at the right class.

### Parallel coordination (summary)

Parallelize large tasks only with **strict disjoint file ownership**. No shared writable files. No overlapping edit areas. **No git commits from parallel worker agents** — the lead agent integrates, verifies, and commits. Read-only lanes may share reads. Ownership collision ⇒ stop and re-plan. Full detail in the canonical rule.

## 🚫 Banned UI Patterns (NEVER implement these)

The following patterns have been explicitly removed from the codebase and must never be reintroduced:

1. **Eyebrow text / kicker above a headline** — any small uppercase or letter-spaced label sitting above a heading (`className="*-eyebrow"`, `className="*-kicker"`, `kicker=` prop). Use the heading alone.
2. **Pill chip version of the eyebrow** — same pattern rendered as a rounded pill above a title.
3. **Hero eyebrow / pill chip** — tiny label above an oversized hero headline, in any form.
4. **Status badges (green / yellow / red)** — do not use `TalentStatusBadge` or any coloured dot/pill that encodes "available / on booking / inactive" status. Show status as plain text or color a stripe/dot that is not a badge component.
5. **New / Beta / Live / AI-powered badges** — no floating chips declaring a feature tier or freshness.
6. **Accent dot paired with a badge** — no dot + pill combos as decorative metadata.
7. **Cards with tiny metadata chips in the corner** — no `MatchScoreBadge`, `TalentTypePill`, or equivalent chip components overlaid on card corners or photo thumbnails. Render type/score as plain text inline.
8. **Glass cards with `backdrop-filter: blur()`** — no frosted-glass effect on cards, panels, or buttons. `backdrop-filter` is permitted only on full-screen scrims/overlays (`position: fixed; inset: 0`) where it is a functional dimmer, not a decorative style.
9. **Tiny count badge on nav or cards** — no `<span className="ag-nav-count">` or equivalent counter bubbles attached to navigation items.
10. **Pulsing dots / status indicators** — no animated or static colored dots next to text (like "Strong Profile" or "Live") to indicate status or completeness. Use plain text labels without dots instead.
11. **Draggable/Resizable Textboxes** — no textbox or textarea should be draggable/resizable by the user. Always enforce `resize: none` on textareas.
12. **Gradient text** — no `background-clip: text` / gradient-fill headline treatment. Use typography, spacing, and one solid accent color instead.
13. **Colored side-stripe cards** — no `border-left` / `border-right` wider than 1px as a decorative accent on cards, rows, callouts, or alerts.
14. **Generic AI card grids** — no repeated icon + heading + paragraph card grids as filler. Each panel must earn its structure from real product work.
15. **Decorative AI dashboard ornament** — no unnecessary blobs, particles, diagonal stripe backgrounds, fake grain, orbiting dots, or ornamental widgets that do not support the task.
16. **Over-rounded generic surfaces** — no 24px+ rounded cards/sections/inputs unless the scoped design file explicitly calls for that shape.

Violating any of these rules requires explicit approval and a design discussion first.

## Common Commands

```bash
# Install dependencies
npm install && cd client && npm install && cd ..

# Run everything at once (recommended)
npm run dev:all          # Express :3000 + Vite :5173 concurrently

# Or run individually:
npm run dev              # Express backend on :3000
npm run client:dev       # Vite React SPA on :5173 (proxies /api to :3000)

# Build
npm run client:build     # React SPA → public/dashboard-app/

# Database
npm run migrate          # Apply pending migrations
npm run migrate:status   # Check migration state
npm run migrate:rollback # Rollback last batch
npm run seed             # Load seed data (talent@example.com / password123, agency@example.com / password123)

# Tests
npm test                 # Jest + Supertest integration tests
npm run test:db          # Test database connection
# Run a single test file:
npx jest path/to/test.js --testNamePattern "test name"

# Lint
cd client && npm run lint     # React SPA
```

## Architecture

### Three-App Strategy

| App | Tech | Location | Port | Domain |
|-----|------|----------|------|--------|
| Marketing | Next.js 16 SSG/SSR | `pholio-landing` repo | 3001 | www.pholio.studio |
| React SPA | Vite + React 19 | `client/` | 5173 | app.pholio.studio |
| Express API | Node.js + Express 5 | `src/` | 3000 | app.pholio.studio |

The Vite dev server proxies `/api`, `/uploads`, `/upload`, `/onboarding/*` (sub-paths only), `/logout`, `/signup`, `/partners`, and `/stripe` to Express on port 3000. The base `/onboarding` route stays client-side (SPA). Vite uses base `/` in dev but `/dashboard-app/` in production builds (output to `public/dashboard-app/`). All CTAs on the landing page link to `app.pholio.studio` via `NEXT_PUBLIC_APP_URL`.

### Backend Structure (`src/`)

**Note:** Express 5 uses promise-based error handling — async route handlers reject automatically without `express-async-handler` in most cases, but the codebase still uses it for consistency.

**Middleware chain order in `src/app.js`:**
1. CORS (allows localhost:5173, localhost:3001, and production pholio.studio subdomains)
2. Unhandled rejection handler (graceful serverless error recovery)
3. Trust proxy (`app.set('trust proxy', true)` for Netlify Functions)
4. IP resolution middleware (extracts client IP for rate limiting through proxy chains)
5. Rate limiting (applied to auth and upload routes)
6. EJS template engine (views in `views/`, used for auth pages, portfolios, PDFs)
7. Session middleware (`connect-session-knex` stores sessions in DB)
8. `attachLocals()` (`shared/middleware/context.js`) - populates `res.locals` for EJS templates
9. Route handlers

**Route organization — domain routers (`src/domains/`):**
- `domains/auth/routes/auth.js` - Login/signup; Firebase ID token → Express session
- `domains/onboarding/routes/casting.js` - Talent casting / onboarding API (`/onboarding/*` and related endpoints)
- `domains/talent/routes/` - Talent dashboard + `/api/talent/*`; `index.js` mounts `media.js`, `profile.js`, `analytics.js`, `applications.js`, `agencies.js`, `settings.js`, `pdf-custom.js`, `dashboard.js`, `bio.js`
- `domains/agency/routes/` - Agency dashboard APIs; `index.js` composes `roster.js`, `inbox.js`, `casting.js`, `tags.js`, `interviews.js`, `reminders.js`, `messages.js`, `overview.js` (JSON under `/api/agency/*` and companion `/agency/*` routes as defined per file)
- `domains/pdf/routes/pdf.js` - Puppeteer PDF generation

**Route organization — shared entrypoints (`src/routes/`):**
Still used for cross-cutting HTTP handlers wired from `src/app.js`, including `api.js` (mounted at `/api`), `api/public.js` (`/api/public`), `chat.js`, `scout.js`, `stripe.js`, `pro.js`, and the raw-body `stripe-webhook.js` handler. Additional modules (e.g. `portfolio.js`, `upload.js`) may live here; confirm `app.js` for current `app.use` registration.

**Key middleware:**
- `domains/auth/middleware/require-auth.js` - `requireAuth()` checks session; API routes return 401 JSON, page routes redirect to `/login`. `requireRole('TALENT'|'AGENCY')` for role enforcement. API detection uses Accept / XHR plus paths such as `/api/*` and `/onboarding/*`.
- `shared/middleware/context.js` - `attachLocals`, request flash/message helpers
- `shared/middleware/onboarding-redirect.js` - `requireOnboardingComplete` (dashboard gating)
- `shared/middleware/require-profile-unlocked.js` - Services lock for comp card / portfolio flows
- `shared/middleware/error-handler.js` - Centralized error handler

**Business logic and shared services:**
- `domains/onboarding/services/` - Onboarding/casting pipeline (e.g. `state-machine.js`, signal collection, providers)
- `domains/ai/` - Photo analysis via Groq, embeddings, scoring helpers
- `domains/talent/services/`, `domains/agency/services/` - Domain-specific orchestration and helpers
- `domains/pdf/` - PDF themes, layouts, generator (alongside `domains/pdf/routes/pdf.js`)
- `domains/auth/services/` - Firebase Admin initialization and auth-related server helpers
- `shared/lib/` - Cross-cutting utilities: `uploader.js`, `slugify.js`, `curate.js`, `geolocation.js`, `stripe.js`, `email.js`, etc.
- `shared/db/knex.js` - Knex client

### Frontend Structure (`client/src/`)

**Routing (`App.jsx` - React Router v7):**
- `<DashboardLayoutShell>` (`shared/layouts/DashboardLayoutShell.jsx`) wraps `/dashboard/talent/*`
- `<AgencyLayout>` (`shared/layouts/AgencyLayout.jsx`) wraps `/dashboard/agency/*` (behind `domains/agency/components/AgencySessionGate.jsx` where used)
- `<AuthLayout>` (`shared/layouts/AuthLayout.jsx`) wraps `/login`
- Standalone: `/onboarding/*` (casting), `/reveal`
- Root `/` redirects to `/dashboard/talent`
- Top-level `<ErrorBoundary>` (`shared/components/ErrorBoundary.jsx`) wraps the entire app

**State management:**
- React Query (TanStack Query v5) for all server state
- React Hook Form v7 + Zod schemas (`schemas/`, e.g. `profileSchema.ts`) for forms
- Custom hooks live next to their domain: `domains/auth/hooks/useAuth.js`; talent data hooks in `domains/talent/hooks/` (`useProfile`, `useMedia`, `useAnalytics`, `useProfileStrength`, …); `domains/agency/hooks/useStats.js`. Shared UX hooks in `shared/hooks/`.

**API clients:**
- `shared/lib/api-client.js` - Session `fetch` wrapper for talent calls (default base `/api/talent`): `credentials: 'include'`, unwraps `{ success, data }`, `ApiError`, 401 → `/login` (suppress via `skipRedirect` where supported)
- `domains/talent/api/talent.js` - Named methods composing the talent API client
- `domains/agency/api/agency.js` - Agency dashboard `fetch` helpers against `/api/agency/*` (parallel pattern to talent; see file for `ApiError` / helpers)

**Component organization:**
- `domains/talent/pages/`, `domains/talent/components/` - Talent dashboard screens and widgets (e.g. `RightSidebar/`, media/profile views)
- `domains/agency/pages/`, `domains/agency/components/` - Agency dashboard (e.g. `ActivityTimeline`, `InterviewCard`, `ReminderCard`, `nav/`, `ui/`)
- `domains/auth/pages/`, `domains/auth/components/` - Login and auth-adjacent UI
- `domains/onboarding/pages/`, `domains/onboarding/components/` - Casting / onboarding flow UI
- `shared/components/` - Cross-cutting UI: `ui/forms/` (`PholioInput`, `PholioSelect`, `PholioTextarea`, `PholioToggle`, …), `Card/`, `StatCard/`, loaders, `Header/`, etc.
- `shared/layouts/` - `DashboardLayoutShell.jsx`, `AgencyLayout.jsx`, `AuthLayout.jsx`

### Design Token System

**`client/src/styles/agency-tokens.css`** — primary CSS custom properties:
```css
--ag-surface-0: #FAF8F5    /* canvas background */
--ag-surface-1: #FFFFFF    /* sidebar, cards */
--ag-gold: #B8956A         /* brand accent */
--ag-gold-hover: #A6845C
--ag-text-0: #1A1815       /* headlines */
--ag-text-2: #6B6560       /* secondary text */
--ag-shadow-gold: 0 0 20px rgba(184,149,106,0.12)
```

**`client/src/index.css`** — global theme and fonts:
- Google Fonts: Inter (body), Playfair Display, Noto Serif Display
- TailwindCSS 4 `@theme` customization with `--color-gold-*` and `--font-display`

**Brand values:**
- Primary gold: `#C9A55A` (buttons, progress, accents)
- Typography: Inter body, Playfair Display / Noto Serif Display for headings
- Card radius: 16px; base spacing unit: 4px scale (4, 8, 12, 16, 24, 32, 40, 48px)

### Database

- Migrations in `migrations/` (63+ files, Knex format)
- Naming: `YYYYMMDDhhmmss_description.js`
- `knexfile.js` auto-detects SQLite vs PostgreSQL via `DB_CLIENT` or `DATABASE_URL`
- Two user roles: `TALENT` and `AGENCY`; UUIDs for all primary keys
- Key tables: `users`, `profiles`, `images`, `applications`, `subscriptions`, `sessions`, `analytics`, `activities`
- Known quirk: `date_of_birth` saved as full ISO timestamp by PostgreSQL; frontend must handle both `"1995-03-15"` and `"1995-03-15T05:00:00.000Z"` formats

### Auth Flow

1. Client authenticates with Firebase (email/password or Google OAuth)
2. Firebase ID token sent to `POST /login`
3. Server verifies token via Firebase Admin SDK
4. Express session created and stored in DB
5. `requireAuth` / `requireRole` middleware protects all subsequent routes

### Environment Variables

**Development (`.env`):**
```
NODE_ENV=development
MARKETING_SITE_URL=http://localhost:3001
APP_URL=http://localhost:3000
COOKIE_DOMAIN=localhost
```

**Production:**
```
NODE_ENV=production
MARKETING_SITE_URL=https://www.pholio.studio
APP_URL=https://app.pholio.studio
COOKIE_DOMAIN=.pholio.studio
```

## Troubleshooting

**CORS errors:** Check `NODE_ENV` and verify origin is in `allowedOrigins` in `src/app.js`.

**Session not persisting:** Cookie domain must be `.pholio.studio` (with leading dot) and both domains must use HTTPS in production.

**Onboarding redirect loop:** Check `onboarding_completed_at` in DB and verify `requireOnboardingComplete` middleware.

**PDF generation fails:** Verify `views/pdf/compcard.ejs` exists and Puppeteer is installed; in serverless add Chromium layer.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution
- Parallel **writers** require strict disjoint file ownership; no shared writable files; no commits from worker agents — lead integrates (see `docs/ai-agent-operating-rule.md`)
- If the task fits one agent, that agent may implement, review, test, and commit alone

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.

## Commit Attribution

All commits in this repository are attributed to the human owner only.

- Never add `Co-authored-by` / `Co-Authored-By` trailers for Cursor, Claude Code, Codex, Anthropic, or OpenAI.
- Never add `Made-with: Cursor`, `Claude-Session`, `Generated with Claude Code`, or similar lines.
- Project Claude settings (`.claude/settings.json`) disable attribution; `.githooks/prepare-commit-msg` strips any that slip through.
