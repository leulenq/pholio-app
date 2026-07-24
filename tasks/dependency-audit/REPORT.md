# Pholio-app dependency audit

**Date:** 2026-07-24  
**Scope:** root `package.json` + `client/package.json` (and how they resolve in this workspace)  
**Method:** `npm outdated`, `npm audit`, `depcheck`, import/require scan across `src/`, `client/`, `scripts/`, `tests/`, `netlify/`, plus load/spot-checks of critical packages

---

## Executive summary

| Category | Severity | Headline |
|---|---|---|
| **Install breakage** | High | Client `npm install` / `npm ci` fails without `--legacy-peer-deps` (`eslint-plugin-react-hooks@7.0.1` vs `eslint@10`) |
| **Missing direct dep** | High | Production code `require("jsonwebtoken")` with no declared dependency (transitive only) |
| **Dead / nonfunctional deps** | Medium | Root `firebase` cannot be `require()`d (no CJS main); `three` unused on root and client |
| **Version conflict** | Medium | Root `zod@3` vs client `zod@4` |
| **Security** | High | Root: 41 advisories (2 critical / 23 high). Client: 12 (1 critical / 9 high). Several **direct** packages have in-range or nearby fixes |
| **Broken local imports** | Low–Med | Orphaned talent components + one casting script path resolve to missing modules |
| **Optional / soft deps** | Info | `@imgly/background-removal-node`, `@vladmandic/human`, `pixelmatch`, `ag-psd` intentionally undeclared or fail-soft |

---

## 1. Install / peer dependency (nonfunctional install)

**Client** declares:

- `eslint@^10.0.2` (installed `10.0.2`)
- `eslint-plugin-react-hooks@^7.0.1` (installed `7.0.1`)

`eslint-plugin-react-hooks@7.0.1` peers only through **eslint 9**. Without `--legacy-peer-deps`, npm 10 fails with `ERESOLVE`.

**Already mitigated in CI / Netlify** via `--legacy-peer-deps`. Local `cd client && npm install` still fails on a clean tree.

**Options:**

1. Add `client/.npmrc` with `legacy-peer-deps=true` (matches CI; keeps lint green on 7.0.1).
2. Bump to `eslint-plugin-react-hooks@^7.1.1` (declares eslint 10) — **breaks** current lint with many `react-hooks/set-state-in-effect` errors; do not do this without a lint remediation pass.

---

## 2. Missing dependencies

### Production (must declare)

| Package | Used in | Status today |
|---|---|---|
| **`jsonwebtoken`** | `src/domains/onboarding/services/referral.js` | Resolves only via **firebase-admin** transitive (`9.0.3`). Will break if that tree changes |

### Tests / scripts (should declare if those paths are first-class)

| Package | Used in | Status today |
|---|---|---|
| **`cookie-signature`** | ~25 agency/integration tests | Transitive of express-session; nested copies can drift |
| **`form-data`** | `scripts/simulate_talent_journey.js` | Hoisted via axios/superagent |
| **`pixelmatch`** | `scripts/comp-card-gallery.js` | **Not installed** — `Cannot find module 'pixelmatch'` |
| **`ag-psd`** | `scripts/export-wordmark-lockup-psd.js` | Intentionally `npm install --no-save` on miss |

### Optional (documented fail-soft; OK undeclared)

| Package | Used in |
|---|---|
| `@imgly/background-removal-node` | `src/domains/pdf/composition/perception/matte.js` |
| `@vladmandic/human` (+ `@tensorflow/tfjs-node`) | `src/domains/pdf/composition/perception/faces.js` |

### False / low-priority depcheck noise

Agent-skill scripts under `.agents` / `.claude` / `.cursor` reference `@babel/parser`, `htmlparser2`, etc. — not runtime app deps. `@jest/globals` comes with `jest`.

---

## 3. Unused / nonfunctional declared dependencies

| Package | Where | Finding |
|---|---|---|
| **`three`** | root + client | **No imports anywhere.** Client WebGL uses `ogl`. Safe remove from both. |
| **`firebase` (root)** | root deps | **No server import.** Auth pages load Firebase from **CDN** (`views/layout.ejs`); server uses **`firebase-admin`**. `require('firebase')` fails: *No "exports" main*. Nonfunctional as a Node dependency; remove from root (keep client copy). |
| **`pg`** | root | No direct import; required by Knex postgres dialect — **keep**. |
| **`sqlite3`** | root optional | Local/dev dialect via `require.resolve` — **keep**. |
| **`@img/sharp-*`** | root optional | Platform binaries for Netlify/Linux — **keep**. |
| **`react-is`** | client | No direct import; peer for recharts — **keep** unless recharts no longer needs it. |
| **`typescript`** | client deps | Used for `profileSchema.ts` via Vite; no `tsc` script — keep or move to `devDependencies`. |
| **`harfbuzzjs`** | root | Declared and used via `require.resolve` + WASM path. ESM wrapper is not `require()`-able (top-level await); code is written for that — **functional as designed**, not a dead dep. |

---

## 4. Root vs client version conflicts

| Package | Root | Client | Risk |
|---|---|---|---|
| **`zod`** | `^3.25.76` → **3.25.76** | `^4.3.6` → **4.3.6** | **Major API mismatch.** Do not share schemas across the boundary without an adapter. Prefer converging on one major when practical. |
| **`firebase`** | `^12.9.0` (unused npm) | `^12.9.0` (used) | Same range; EJS CDN pins an older **12.6.0** channel — third version stream. |
| **`three`** | `^0.183.2` | `^0.183.2` | Duplicate dead weight. |

---

## 5. Security (`npm audit`)

### Root — 41 total (critical 2, high 23, moderate 14, low 2)

**Direct high/critical-relevant packages:**

| Package | Installed | Notes |
|---|---|---|
| **`express`** | **4.21.1** (exact pin) | Advisory fix at **4.22.2** (path-to-regexp / body-parser / qs). Pin blocks `npm update`. |
| **`multer`** | 2.1.1 | Fix in **2.2.0** (in range `^2.0.2`) — nested field DoS |
| **`nodemailer`** | 8.0.3 | Advisory `<=9.0.0`; needs **9.x** major for clean fix |
| **`validator`** | 13.12.0 | Fix in **13.15.35** (in range `^13.12.0`) — `isURL` bypass |
| **`bcrypt`** | 5.1.1 | Fix path via **6.0.0** major (node-pre-gyp/tar) |
| **`sharp`** | 0.34.5 | Fix via **0.35.3** major (libvips CVEs) |
| **`sqlite3`** | 5.1.7 optional | Fix via **6.0.1** major (tar/node-gyp chain) — also critical `tar` |
| **`uuid`** | 9.0.1 | Fix via **11+/14** major |
| **`concurrently`** | 9.2.1 | `shell-quote` DoS; root already **overrides** `shell-quote@1.8.4` (still flagged) |
| **`express-rate-limit`** | 8.3.1 | Bump to **8.6.0** (in range) for `ip-address` |
| **`firebase-admin`** | 13.7.0 | Moderate chain; latest **14.2.0** is major |

**Critical transitive:** `tar` (via sqlite3/bcrypt tooling), `websocket-driver` (firebase stack).

### Client — 12 total (critical 1, high 9, low 2)

| Package | Installed | Notes |
|---|---|---|
| **`react-router-dom`** | 7.13.1 | High (turbo-stream / constructor invocation). Wanted **7.18.1** within `^7.13.1` |
| **`vite`** | 7.3.1 | High (optimized deps `.map` path traversal). Wanted **7.3.6** within `^7.3.1` |
| **`postcss`** | 8.5.6 | High (CSS stringify XSS). Wanted **8.5.22** within `^8.5.6` |
| Transitive | — | `websocket-driver`, `@grpc/grpc-js` (firebase), `rollup`, `flatted`, etc. |

---

## 6. Outdated packages (selected)

Full `npm outdated` counts: **root 33**, **client 32**. Highlights by risk / impact:

### Major bumps (do not blind-upgrade)

| Package | Current → latest | Why caution |
|---|---|---|
| `express` | 4.21.1 → **5.2.1** | App is Express 4; docs still say Express 5 in places — migrate deliberately |
| `connect-session-knex` | 3 → 5 | Session store API |
| `stripe` | 20 → 22 | API surface |
| `groq-sdk` | 0.37 → 1.3 | Major SDK |
| `ejs` | 3 → 6 | Template engine |
| `dotenv` | 16 → 17 | |
| `bcrypt` | 5 → 6 | Native addon |
| `sqlite3` | 5 → 6 | Native addon |
| `sharp` | 0.34 → 0.35 | Native / optional `@img/sharp-*` pins must move together |
| `@sparticuz/chromium` | 131 → **147** | Must stay compatible with puppeteer |
| `puppeteer` | 24 → 25 | Pair with Chromium layer |
| `zod` (root) | 3 → 4 | Align with client carefully |
| `lucide-react` | 0.575 → **1.26** | Icon API churn |
| `vite` | 7 → 8 | Tooling |
| `@vitejs/plugin-react` | 5 → 6 | Pair with Vite |
| `typescript` (client) | 5.9 → 7 | |
| `react-dropzone` | 15 → 19 | |
| `@tsparticles/*` | 3 → 4 | |

### Safe-ish within-range / minor (good first patch PR)

Root: `express` pin → `4.22.2`, `multer` → `2.2.0`, `validator` → `13.15.x`, `express-rate-limit` → `8.6.0`, `knex` → `3.3.0`, `helmet` → `8.3.0`, `firebase`/`firebase-admin` minor within current majors if tested.

Client: `react-router-dom` → `7.18.x`, `vite` → `7.3.6`, `postcss` → `8.5.22`, React/`react-dom` patch, TanStack Query / framer-motion / tailwind patch bumps.

---

## 7. Broken local imports (related, non-npm)

| File | Import | Issue |
|---|---|---|
| `client/src/domains/talent/components/PhotoGallery.jsx` | `../../hooks/useRecentPhotos` | Resolves under `domains/hooks` — **missing**. Hook lives at `talent/hooks/`. Component appears **orphaned**. |
| `client/src/domains/talent/components/PortfolioSnapshot.jsx` | same | Same |
| `scripts/test_casting_flow.js` | `../client/src/utils/fitScoring.js` | **File does not exist** |

---

## 8. Recommended action plan

### P0 — reliability

1. Add `client/.npmrc` → `legacy-peer-deps=true` (or document mandatory flag everywhere).
2. Declare **`jsonwebtoken`** in root `dependencies` at the version you intend (currently resolving `9.0.3`).

### P1 — security patches (low blast radius)

1. Unpin / bump **`express` → 4.22.2** (stay on Express 4).
2. `npm update` within range: **multer, validator, express-rate-limit** (root); **react-router-dom, vite, postcss** (client).
3. Re-run `npm audit` and smoke-test auth, uploads, email, client build/lint.

### P2 — cleanup

1. Remove **`three`** from root and client.
2. Remove unused root **`firebase`** npm dependency; keep CDN + `firebase-admin` + client Firebase SDK.
3. Declare **`pixelmatch`** (and optionally `cookie-signature`, `form-data`) if those scripts/tests are CI-critical.
4. Delete or fix orphaned `PhotoGallery` / `PortfolioSnapshot` and `fitScoring` script path.

### P3 — strategic majors (separate projects)

1. Converge **zod** on one major across root/client.
2. Express 5 migration (align docs vs pin).
3. `bcrypt` 6 / `sqlite3` 6 / `sharp` 0.35 (+ matching `@img/sharp-*` optionals).
4. Chromium + puppeteer coordinated bump for Netlify functions.
5. Only then consider `eslint-plugin-react-hooks@7.1.1` + lint fixes.

---

## 9. Commands used

```bash
npm outdated --json          # root
npm audit --json             # root
cd client && npm outdated --json && npm audit --json
npx depcheck --json          # root + client
# plus require()/import scans and load spot-checks
```

---

## Appendix — inventory counts

| Tree | dependencies | devDependencies | outdated | audit total |
|---|---|---|---|---|
| Root | 35 (+ optional sharp/sqlite3) | 8 | 33 | 41 |
| Client | 26 | 18 | 32 | 12 |
