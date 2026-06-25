# Pholio

**A full-stack talent portfolio and agency management platform for the modeling industry.**

Pholio connects talent with agencies through polished digital portfolios, AI-assisted photo curation, PDF comp card generation, and a streamlined casting workflow — all in one platform. The talent surface is cinematic and tactile; the agency surface is dense and authoritative. Both share a warm editorial identity built on cream, gold, and serif type.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design System](#design-system)
- [Auth Flow](#auth-flow)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

### For Talent
- **Portfolio Builder** — Upload, reorder (drag-and-drop), and curate professional photos
- **AI Photo Analysis** — Groq-powered image scoring and curation recommendations
- **PDF Comp Cards** — Generate print-ready comp cards via Puppeteer with customisable layouts
- **Agency Applications** — Browse agencies and apply directly from the dashboard
- **Analytics** — Track portfolio views, engagement, and application status
- **Public Portfolio Pages** — SEO-optimised, shareable profile URLs with auto-generated QR codes
- **Profile Strength** — Live completeness scoring with guided improvement suggestions
- **Messaging** — In-app direct messaging with agencies

### For Agencies
- **Talent Roster Management** — Browse, filter, tag, and manage represented talent
- **Application Inbox** — Accept, reject, or shortlist incoming talent applications
- **Casting Boards** — Kanban-style boards for organising talent across castings
- **Commission Tracking** — Log and monitor talent earnings and agency commission splits
- **Interview & Reminder Scheduling** — Attach interviews and reminders to talent profiles
- **Activity Timeline** — Full audit trail of roster events and interactions
- **Scout / Discover** — Semantic natural-language search across all platform talent using OpenAI embeddings
- **Team RBAC** — Role-based access control for agency team members

### Platform
- **Firebase Authentication** — Email/password and Google OAuth sign-in
- **Stripe Subscriptions** — Pro plans with webhook-driven lifecycle management
- **Transactional Email** — Automated notifications via Nodemailer

---

## Architecture

Pholio runs as two deployable units from this repository: the **Express API + React SPA** (the app), and an optional **Next.js marketing site** (`landing/`, not present in every checkout).

| App | Stack | Directory | Dev Port | Production Domain |
|-----|-------|-----------|----------|-------------------|
| React SPA | Vite + React 19 | `client/` | 5173 | `app.pholio.studio` |
| API Server | Node.js 20 + Express 4 | `src/` | 3000 | `app.pholio.studio` |
| Marketing Site (optional) | Next.js 16, TypeScript, Tailwind 4 | `landing/` | 3001 | `www.pholio.studio` |

The Vite dev server proxies `/api`, `/uploads`, and all auth routes to the Express server. In production, the React SPA builds to `public/dashboard-app/` and is served statically alongside the Express API, which is deployed as a Netlify Function via `serverless-http`.

---

## Tech Stack

**Backend**
- Node.js 20, Express 4, CommonJS
- Knex.js (SQLite for local dev, PostgreSQL/Neon for production)
- Firebase Admin SDK (ID token verification)
- Stripe (subscriptions + webhooks)
- Puppeteer + `@sparticuz/chromium` (serverless PDF rendering)
- Sharp (image processing), Groq SDK (AI photo analysis)
- AWS S3 + Multer S3 (file storage)
- Nodemailer (transactional email), QRCode

**Frontend**
- React 19, React Router v7, TanStack Query v5
- React Hook Form v7 + Zod (schema validation)
- TailwindCSS 4 + CSS custom properties design token system
- Framer Motion (spring animations), GSAP + Lenis (landing page)
- @dnd-kit/sortable (drag-and-drop media grid)
- Lucide React (icons), Sonner (toasts)

**Infrastructure**
- Netlify Functions (serverless deployment)
- Firebase Auth (client-side)
- PostgreSQL via Neon (serverless Postgres)

---

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 9
- A Firebase project (Authentication enabled)
- A Stripe account (optional for local development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd pholio-app

# Install dependencies (root + client)
npm install && cd client && npm install && cd ..

# Optional: marketing site (only if landing/ exists in your checkout)
# cd landing && npm install && cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your local configuration

# Apply database migrations
npm run migrate

# (Optional) Load seed data
npm run seed
```

**Seed accounts:** `talent@example.com` / `password123` and `agency@example.com` / `password123`

---

## Environment Variables

### Development (`.env`)

```env
# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
MARKETING_SITE_URL=http://localhost:3001
COOKIE_DOMAIN=localhost
SESSION_SECRET=your-random-secret-here

# Database (SQLite by default)
DB_CLIENT=sqlite3
DATABASE_URL=sqlite://./dev.sqlite3

# Firebase Web SDK (also set in client/.env as VITE_FIREBASE_*)
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=

# Firebase Admin SDK
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

# Groq (AI photo analysis)
GROQ_API_KEY=

# OpenAI (Discover semantic search — text-embedding-3-small @ 512 dims)
OPENAI_API_KEY=

# Email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Business Logic
COMMISSION_RATE=0.25
MAX_UPLOAD_MB=8
PDF_BASE_URL=http://localhost:3000
```

### Production (Netlify Environment Variables)

Set these in **Netlify UI → Site settings → Environment variables**:

```env
NODE_ENV=production
APP_URL=https://app.pholio.studio
MARKETING_SITE_URL=https://www.pholio.studio
COOKIE_DOMAIN=.pholio.studio
SESSION_SECRET=<long-random-string>

DB_CLIENT=pg
DATABASE_URL=postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=verify-full

# Firebase (same keys as dev, plus Admin SDK)
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=...
FIREBASE_CLIENT_ID=...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
S3_BUCKET_NAME=...

GROQ_API_KEY=...
OPENAI_API_KEY=...
COMMISSION_RATE=0.25
MAX_UPLOAD_MB=8
```

---

## Database

### Local Development (SQLite)

SQLite requires no additional setup.

```bash
npm run migrate          # Apply pending migrations
npm run migrate:status   # Check current migration state
npm run migrate:rollback # Roll back last batch
npm run seed             # Load seed data
```

### Production (PostgreSQL / Neon)

1. Create a database at [neon.tech](https://neon.tech)
2. Copy the connection string (hostname starts with `ep-`)
3. Set `DB_CLIENT=pg` and `DATABASE_URL=postgresql://...` in Netlify env vars
4. After the first deploy, trigger migrations via:
   ```
   POST https://app.pholio.studio/api/migrate?secret=YOUR_MIGRATION_SECRET
   ```

Migrations live in `migrations/` as timestamped Knex files (`YYYYMMDDhhmmss_description.js`). All primary keys are UUIDs.

> **Note:** PostgreSQL stores `date_of_birth` as a full ISO timestamp. The frontend handles both `"1995-03-15"` and `"1995-03-15T05:00:00.000Z"`.

### Discover Semantic Search

Agency Discover natural-language search (`GET /api/agency/discover?q=...`) uses OpenAI **text-embedding-3-small** (512 dimensions). SQLite stores vectors in `talent_embedding_cache` and runs semantic search in-process; Postgres uses pgvector.

```bash
# Add OPENAI_API_KEY to .env, then:
npm run verify:embeddings     # Confirm the key works
npm run backfill:discover     # Index all talent (works on SQLite and Postgres)
# Restart the server — response meta.semantic_search should be true
```

Optional tuning: `DISCOVER_MAX_DISTANCE` (default `0.55`), `DISCOVER_FUSION_TEXT_WEIGHT` (`0.6`), `DISCOVER_FUSION_IMAGE_WEIGHT` (`0.4`).

---

## Development

```bash
# Recommended: run both apps concurrently
npm run dev:all          # Express :3000 + Vite :5173

# Or individually:
npm run dev              # Express API on :3000
npm run client:dev       # React SPA on :5173 (proxies /api to :3000)
cd landing && npm run dev  # Next.js marketing site on :3001 (if landing/ exists)
```

**Local access:**
- Dashboard app: http://localhost:5173
- API: http://localhost:3000/api
- Marketing site: http://localhost:3001

### Build

```bash
npm run client:build         # React SPA → public/dashboard-app/
cd landing && npm run build  # Next.js marketing site (if landing/ exists)
```

### Linting

```bash
cd client && npm run lint     # React SPA
cd landing && npm run lint    # Next.js site
```

---

## Testing

```bash
npm test                                           # All Jest + Supertest integration tests
npm run test:db                                    # Verify database connection
npx jest path/to/test.js --testNamePattern "name"  # Run a single test
```

---

## Deployment

### Web Application — Netlify (`app.pholio.studio`)

The Express API and React SPA deploy together as a single Netlify site.

- `netlify/functions/server.js` wraps Express with `serverless-http`
- Netlify builds the React SPA during deploy (`npm run client:build`)
- Static files are served from `public/` via Netlify CDN
- All unmatched routes proxy to the `server` Netlify Function
- Function config: 26s timeout, 3008 MB memory (Netlify Pro required for Puppeteer)

**Steps:**
1. Connect the repository to a Netlify site
2. Set all production environment variables in the Netlify UI
3. Push to `main` — Netlify builds and deploys automatically
4. Run database migrations via `POST /api/migrate?secret=...`

**DNS:**
```
Type:  CNAME
Name:  app
Value: <your-site>.netlify.app
```

### Marketing Site — `www.pholio.studio`

Deploy the `landing/` directory as a separate Netlify or Vercel site.

Required env vars:
```
NEXT_PUBLIC_APP_URL=https://app.pholio.studio
NEXT_PUBLIC_API_URL=https://app.pholio.studio/api
```

---

## Design System

The dashboard uses a warm editorial palette with strong typographic hierarchy. Two separate design systems (talent and agency) share a material vocabulary — warm neutrals, one gold accent, Inter body type — without being averaged into a single look.

| Token | Value | Usage |
|-------|-------|-------|
| `--ag-surface-0` | `#FAF8F5` | Canvas / page background |
| `--ag-surface-1` | `#FFFFFF` | Cards, sidebar |
| `--ag-gold` | `#B8956A` | Brand accent, interactive elements |
| `--ag-gold-hover` | `#A6845C` | Hover state |
| `--ag-text-0` | `#1A1815` | Headlines |
| `--ag-text-2` | `#6B6560` | Secondary / supporting text |

**Typography:** Inter (body), Playfair Display / Noto Serif Display (display headings)

**Motion:** Spring-physics Framer Motion (`stiffness: 55, damping: 16`) for all interactive elements. Standard transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

**Spacing:** 4px base scale (4, 8, 12, 16, 24, 32, 40, 48px). Card border-radius: 16px.

Design tokens live in `client/src/styles/agency-tokens.css`. The landing page scene components in `landing/components/` define the visual and motion language for the entire product.

---

## Auth Flow

1. User authenticates with Firebase (email/password or Google OAuth)
2. Firebase ID token is `POST`ed to `/login`
3. Server verifies the token via Firebase Admin SDK
4. Express session is created and stored in the database via `connect-session-knex`
5. `requireAuth` / `requireRole('TALENT'|'AGENCY')` middleware protects all subsequent routes
6. API routes return `401 JSON` on failure; page routes redirect to `/login`

---

## Project Structure

```
pholio-app/
├── client/                         # React 19 SPA (Vite)
│   └── src/
│       ├── App.jsx                 # Router root + layout shells
│       ├── domains/                # Feature domains (mirrors backend structure)
│       │   ├── agency/             # Agency dashboard pages, components, hooks, API
│       │   ├── auth/               # Login, session gate, useAuth hook
│       │   ├── messaging/          # In-app direct messaging
│       │   ├── onboarding/         # Casting / onboarding flow
│       │   └── talent/             # Talent dashboard pages, components, hooks, API
│       ├── shared/                 # Cross-cutting UI
│       │   ├── components/         # PholioInput, Card, StatCard, loaders, Header, …
│       │   ├── layouts/            # DashboardLayoutShell, AgencyLayout, AuthLayout
│       │   ├── hooks/              # Shared UX hooks
│       │   └── lib/                # api-client.js and shared utilities
│       ├── schemas/                # Zod validation schemas
│       └── styles/                 # Global CSS + agency-tokens.css
│
├── src/                            # Express API (CommonJS)
│   ├── app.js                      # Middleware chain + route mounting
│   ├── domains/                    # Domain-driven route and service modules
│   │   ├── agency/                 # Roster, inbox, casting, tags, interviews, messages, …
│   │   ├── ai/                     # Photo analysis, embeddings, scoring
│   │   ├── auth/                   # Firebase token verification, session helpers
│   │   ├── messaging/              # In-app messaging
│   │   ├── onboarding/             # Casting pipeline + state machine
│   │   ├── pdf/                    # Puppeteer PDF generation + templates
│   │   └── talent/                 # Media, profile, analytics, applications, settings, …
│   ├── routes/                     # Cross-cutting HTTP handlers (api.js, stripe.js, …)
│   └── shared/                     # DB client, middleware, utilities
│       ├── db/knex.js
│       ├── middleware/             # requireAuth, requireRole, error-handler, …
│       └── lib/                    # uploader, email, geolocation, stripe, …
│
├── views/                          # EJS templates (auth pages, portfolios, PDFs)
├── migrations/                     # Knex migrations (111 files, UUID PKs)
├── seeds/                          # Knex seed data
├── scripts/                        # Tooling: backfills, DB helpers, favicon generation
├── tests/                          # Jest + Supertest integration tests
├── netlify/functions/server.js     # serverless-http entry point
├── netlify.toml                    # Netlify build + redirect config
├── server.js                       # Local server entry
├── public/
│   └── dashboard-app/              # Vite build output (gitignored)
├── landing/                        # Next.js marketing site (optional; not in every clone)
└── archive/                        # Retired assets and backups (not used at runtime)
```

---

## Troubleshooting

**CORS errors**
Check that `NODE_ENV` is set correctly and the request origin is listed in `allowedOrigins` in `src/app.js`. Ensure API calls include `credentials: 'include'`.

**Session not persisting across subdomains**
`COOKIE_DOMAIN` must be `.pholio.studio` (leading dot required). Both subdomains must be served over HTTPS in production.

**PDF generation fails**
Verify `views/pdf/compcard.ejs` exists and `@sparticuz/chromium` is installed. Puppeteer requires Netlify Pro tier (26s timeout, 3 GB memory).

**Onboarding redirect loop**
Check `onboarding_completed_at` in the `users` table and confirm the `requireOnboardingComplete` middleware is correctly wired.

**Netlify Function crashes on boot**
Symptom: `Cannot find module './get-event-type'` in function logs. Ensure `serverless-http` is pinned to `3.2.0` in `package.json` — v4.x has a module resolution bug with the `nft` bundler.

**Clean build after dependency issues**
```bash
# React SPA
cd client && rm -rf dist node_modules && npm install && npm run build

# Next.js marketing site (only if landing/ exists)
cd landing && rm -rf .next node_modules && npm install && npm run build
```

---

## Documentation

- **`CLAUDE.md`** — Architecture deep-dive and AI development guide
- **`PRODUCT.md`** — Product purpose, brand personality, and design principles
- **`DESIGN.md`** — Visual design system and component reference
- **`docs/`** — Feature specs and implementation plans
- **`archive/README.md`** — What lives under `archive/` and why

---

## License

Private — All rights reserved.
