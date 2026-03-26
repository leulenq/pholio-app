# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pholio is a full-stack talent portfolio and agency management platform. Talent users create portfolios with images, generate PDF comp cards, and apply to agencies. Agency users manage talent rosters, review applications, and track commissions.

## Tech Stack

- **Marketing Site:** Next.js 16 (TypeScript, Tailwind 4) in `landing/`
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

**The Landing Page is the Gold Standard.** The `landing/components/` Studio+ and Agency Perspective scene components define the aesthetic language for the entire Pholio app.

- **Motion:** Highly dynamic, spring-based Framer Motion physics (`stiffness: 55, damping: 16`). The app must feel alive, tactile, and responsive (hover scales, smooth entrances, scroll-tied animations). Do not build static, lifeless pages.
- **Aesthetics:** High-polish tech/SaaS (glassmorphism, glowing radial gradients, gamification, floating UI) blended with editorial serif typography.
- **Standard Transition:** `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`; smooth: `0.3s` same easing.

## Common Commands

```bash
# Install all three sets of dependencies
npm install && cd client && npm install && cd ../landing && npm install && cd ..

# Run everything at once (recommended)
npm run dev:all          # Express :3000 + Vite :5173 concurrently

# Or run individually:
npm run dev              # Express backend on :3000
npm run client:dev       # Vite React SPA on :5173 (proxies /api to :3000)
cd landing && npm run dev  # Next.js marketing site on :3001

# Build
npm run client:build     # React SPA → public/dashboard-app/
cd landing && npm run build

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
cd landing && npm run lint    # Next.js marketing site
```

## Architecture

### Three-App Strategy

| App | Tech | Location | Port | Domain |
|-----|------|----------|------|--------|
| Marketing | Next.js 16 SSG/SSR | `landing/` | 3001 | www.pholio.studio |
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
- Key tables: `users`, `profiles`, `images`, `applications`, `subscriptions`, `commissions`, `sessions`, `analytics`, `activities`
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
