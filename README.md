# Pholio

**The talent portfolio and agency management platform for the modern modeling industry.**

Pholio connects talent with agencies through polished digital portfolios, AI-assisted photo curation, PDF comp card generation, and a streamlined application workflow — all in one platform.

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
- **AI Photo Analysis** — Groq-powered image scoring and selection recommendations
- **PDF Comp Cards** — Generate print-ready comp cards via Puppeteer with customisable layouts
- **Agency Applications** — Browse and apply to agencies directly from the dashboard
- **Analytics** — Track portfolio views, engagement, and application status
- **Public Portfolio Pages** — SEO-optimised, shareable profile URLs with auto-generated QR codes

### For Agencies
- **Talent Roster Management** — Browse, filter, and manage represented talent
- **Application Review** — Accept, reject, or shortlist talent applications
- **Commission Tracking** — Log and monitor talent earnings and agency commissions
- **Activity Timeline** — Full audit trail of roster events and interactions
- **Scout Tools** — Proactive outreach and candidate discovery

### Platform
- **Firebase Authentication** — Email/password and Google OAuth sign-in
- **Stripe Subscriptions** — Pro plans with webhook-driven lifecycle management
- **Image Background Removal** — In-browser processing
- **Transactional Email** — Automated notifications via Nodemailer

---

## Architecture

Pholio is a three-app monorepo deployed from a single repository:

| App | Stack | Directory | Dev Port | Production Domain |
|-----|-------|-----------|----------|-------------------|
| Marketing Site | Next.js 16, TypeScript, Tailwind 4 | `landing/` | 3001 | `www.pholio.studio` |
| React SPA | Vite + React 19 | `client/` | 5173 | `app.pholio.studio` |
| API Server | Node.js 20 + Express 5 | `src/` | 3000 | `app.pholio.studio` |

The Vite dev server proxies all `/api`, `/uploads`, and auth routes to the Express server. In production the React SPA compiles to `public/dashboard-app/` and is served statically alongside the Express API, which is deployed as a Netlify Function via `serverless-http`.

---

## Tech Stack

**Backend**
- Node.js 20, Express 5, CommonJS
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
cd pholio

# Install all dependencies (root + client + landing)
npm install && cd client && npm install && cd ../landing && npm install && cd ..

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

# Firebase (same keys as dev)
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
COMMISSION_RATE=0.25
MAX_UPLOAD_MB=8
```

---

## Database

### Local Development (SQLite)

SQLite is used by default with no additional setup required.

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

Migrations live in `migrations/` as numbered Knex files (`YYYYMMDDhhmmss_description.js`). All primary keys are UUIDs.

> **Note:** PostgreSQL stores `date_of_birth` as a full ISO timestamp. The frontend handles both `"1995-03-15"` and `"1995-03-15T05:00:00.000Z"` formats.

---

## Development

```bash
# Recommended: run all three apps concurrently
npm run dev:all          # Express :3000 + Vite :5173

# Or run individually:
npm run dev              # Express API on :3000
npm run client:dev       # React SPA on :5173 (proxies /api to :3000)
cd landing && npm run dev  # Next.js marketing site on :3001
```

**Local access:**
- Marketing site: http://localhost:3001
- Dashboard app: http://localhost:5173
- API: http://localhost:3000/api

### Build

```bash
npm run client:build         # React SPA → public/dashboard-app/
cd landing && npm run build  # Next.js marketing site
```

### Linting

```bash
cd client && npm run lint     # React SPA
cd landing && npm run lint    # Next.js site
```

---

## Testing

```bash
npm test                                          # All Jest + Supertest integration tests
npm run test:db                                   # Verify database connection
npx jest path/to/test.js --testNamePattern "name" # Run a single test
```

---

## Deployment

### Web Application — Netlify (`app.pholio.studio`)

The Express API and React SPA deploy together as a single Netlify site.

- `netlify/function/server.js` wraps Express with `serverless-http`
- Netlify builds the React SPA during deploy (`npm run client:build`)
- Static files are served from `public/` via Netlify CDN
- All unmatched requests proxy to the `server` Netlify Function
- Function timeout: 26s / Memory: 3008 MB (Netlify Pro required for Puppeteer)

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

The dashboard uses a warm editorial palette with strong typographic hierarchy.

| Token | Value | Usage |
|-------|-------|-------|
| `--ag-surface-0` | `#FAF8F5` | Canvas / page background |
| `--ag-surface-1` | `#FFFFFF` | Cards, sidebar |
| `--ag-gold` | `#B8956A` | Brand accent, interactive elements |
| `--ag-gold-hover` | `#A6845C` | Hover state |
| `--ag-text-0` | `#1A1815` | Headlines |
| `--ag-text-2` | `#6B6560` | Secondary / supporting text |

**Typography:** Inter (body), Playfair Display / Noto Serif Display (headings)

**Motion:** Spring-physics Framer Motion (`stiffness: 55, damping: 16`) for all interactive elements. Standard transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

**Spacing:** 4px base scale (4, 8, 12, 16, 24, 32, 40, 48px). Card border-radius: 16px.

Design tokens live in `client/src/styles/agency-tokens.css`. The landing page scene components in `landing/components/` define the visual and motion language for the entire product.

---

## Auth Flow

1. User authenticates with Firebase (email/password or Google OAuth)
2. Firebase ID token is `POST`ed to `/login`
3. Server verifies the token via Firebase Admin SDK
4. Express session is created and stored in the database (via `connect-session-knex`)
5. `requireAuth` / `requireRole('TALENT'|'AGENCY')` middleware protects all subsequent routes
6. API routes return `401 JSON` on failure; page routes redirect to `/login`

---

## Project Structure

```
pholio/
├── landing/                    # Next.js 16 marketing site
│   ├── app/                    # Next.js App Router pages
│   └── components/             # Landing page scenes, animations
│
├── client/                     # React 19 SPA
│   └── src/
│       ├── App.jsx             # Router + layout shells
│       ├── api/                # Fetch wrapper + named API methods
│       ├── components/         # Shared UI (forms, agency widgets)
│       ├── features/           # Feature modules (media, applications, analytics)
│       ├── routes/             # Page-level components (talent/, agency/)
│       ├── hooks/              # Custom hooks (useAuth, useProfile, useMedia)
│       └── styles/             # Global CSS, agency-tokens.css
│
├── src/                        # Express 5 API
│   ├── app.js                  # Entry point + middleware chain
│   ├── routes/                 # Route handlers (auth, talent/, agency/, api/, pdf)
│   ├── middleware/             # requireAuth, requireRole, rate limiting
│   └── lib/                    # Business logic (pdf, uploader, ai/, onboarding/)
│
├── views/                      # EJS templates
│   ├── auth/                   # Login/signup pages
│   ├── pdf/                    # Comp card PDF template
│   └── portfolio/              # Public portfolio pages
│
├── migrations/                 # Knex database migrations (63+ files)
├── seeds/                      # Knex seed files
├── tests/                      # Jest + Supertest integration tests
├── netlify/
│   └── function/
│       └── server.js           # Netlify Function entry (serverless-http)
├── netlify.toml                # Build + function configuration
└── public/
    └── dashboard-app/          # Compiled React SPA (generated, not committed)
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

# Next.js
cd landing && rm -rf .next node_modules && npm install && npm run build
```

---

## Documentation

Additional internal documentation:

- **`CLAUDE.md`** — Architecture deep-dive and development guide
- **`PHOLIO_OVERVIEW.md`** — Product overview and feature summary
- **`PHOLIO_BRAND_GUIDELINES.md`** — Visual design system and brand standards

---

## License

Private — All rights reserved.
