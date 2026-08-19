# Production migration runbook — 2026-08-18

Applying the 10 migrations pending on the production Neon database (batch 17), and
fixing the deploy pipeline so this cannot silently recur.

**Status: rehearsed, not executed.** Everything below has been run end-to-end against a
copy-on-write Neon branch of production and verified green. Nothing has been run against
the production `main` branch. A human decides whether to execute.

---

## 1. Ground truth

Read from `knex_migrations` on production (`ep-cold-moon-a4bwyid7-pooler`) on 2026-08-18.

| | |
|---|---|
| Migration files on `main` | 213 |
| Applied in production | 203 (max batch **16**, applied 2026-08-14 11:25 UTC) |
| **Pending** | **10** |
| Orphan rows in `knex_migrations` with no file | 0 |
| `knex_migrations_lock` | `{ index: 14, is_locked: 0 }` — **not stuck** |
| PostgreSQL | 17.10 |

The six `spec_registry_*` migrations named in the original report are **already applied**
(batch 16). The real gap starts at `20260815090000` — everything authored on or after
2026-08-15.

### The pending 10

| # | Migration | Date |
|---|---|---|
| 1 | `20260815090000_event_casting_application_statuses.js` | 2026-08-15 |
| 2 | `20260815091000_applications_event_call_link.js` | 2026-08-15 |
| 3 | `20260815092000_open_call_event_fields.js` | 2026-08-15 |
| 4 | `20260815093000_event_consent_and_org_kind.js` | 2026-08-15 |
| 5 | `20260815094000_event_pick_lists.js` | 2026-08-15 |
| 6 | `20260815100000_create_off_platform_submissions.js` | 2026-08-15 |
| 7 | `20260815101000_create_agency_verifications.js` | 2026-08-15 |
| 8 | `20260815102000_create_agency_call_windows.js` | 2026-08-15 |
| 9 | `20260815103000_reference_agency_conversion.js` | 2026-08-15 |
| 10 | `20260818220000_create_external_comp_cards.js` | 2026-08-18 |

Production is small — 67 users, 62 profiles, 47 applications, 22 agencies, 71 images,
108 tables. No table is large enough for lock duration to matter; the whole batch runs in
seconds.

---

## 2. Safety assessment

Nine of ten are purely additive. One mutates data.

| # | Migration | Shape | Verdict |
|---|---|---|---|
| 1 | event_casting_application_statuses | **Widens** the `applications_status_check` CHECK to add `confirmed`, `declined_by_talent` | Safe. Production has exactly one status CHECK named `applications_status_check`; the `DO $$ … LIMIT 1` block finds and drops precisely it, then re-adds under the same name. Widening a CHECK on 47 rows is instant. All 47 existing statuses remain legal. |
| 2 | applications_event_call_link | Adds `open_call_link_id` (uuid, null, FK) + `call_purpose` (varchar NOT NULL DEFAULT `'representation'`); **drops** the blanket `UNIQUE(profile_id, agency_id)`; creates two partial unique indexes | Safe. PG 11+ makes NOT NULL-with-default a metadata-only rewrite. The partial unique on `(profile_id, agency_id) WHERE call_purpose='representation'` could fail on duplicates — production has **0** duplicate `(profile_id, agency_id)` pairs (the old blanket unique guaranteed it). Runs with `transaction: false`; every statement is `IF NOT EXISTS`-guarded so a partial run re-runs cleanly. |
| 3 | open_call_event_fields | 12 nullable/defaulted columns + 1 index on `agency_open_call_links` (2 rows) | Safe, purely additive. |
| 4 | event_consent_and_org_kind | Adds `agencies.org_kind` (default `'agency'`), plus `purpose` / `open_call_link_id` / `compensation_disclosure` on `application_submission_consent_events` (**0 rows**) + 1 index | Safe, purely additive. Correctly picks `jsonb` on PG and `text` on SQLite. |
| 5 | event_pick_lists | Creates 4 new tables (`event_pick_lists`, `event_pick_list_items`, `event_pick_selections`, `event_casting_funnel_events`) | Safe. New tables only. |
| 6 | **create_off_platform_submissions** | Creates `off_platform_submissions` | Safe. New table. FK `series_id → spec_registry_series(series_id)` resolves — that PK exists in production. This is the table blocking "Log a submission". |
| 7 | create_agency_verifications | Creates `agency_verifications` | Safe. New table. |
| 8 | create_agency_call_windows | Creates `agency_call_windows` | Safe. New table. |
| 9 | **reference_agency_conversion** | **DATA MUTATION.** `UPDATE agencies SET status='REFERENCE'` for member-less ACTIVE rows named as one of the 8 seeded real agencies; `DELETE` their `spec_registry_agency_routes` rows | Intended, but read §2.1 before approving. |
| 10 | create_external_comp_cards | Creates `external_comp_cards` | Safe. New table. |

### PostgreSQL vs SQLite

These were authored dual-dialect and branch explicitly on `knex.client.config.client`.
The elaborate `sqlite_master` table-rebuild machinery in #1 is **dead code on PostgreSQL** —
the PG path is a plain DROP/ADD CONSTRAINT. `jsonb`-vs-`text` and the `DO $$` blocks are
correctly PG-gated. Verified by execution against real PG 17 (§3), not by reading alone.

### 2.1 The one thing to read before approving — migration #9

This is the only migration that changes existing rows, and its effect on production is
larger than the file's own comments predict.

`seeds/seed.js` inserted the 8 real agencies (Wilhelmina, IMG, Elite, Ford, DNA, The
Society, Next, Marilyn) as `status='ACTIVE'`. That makes Pholio tell talent it can deliver
an application to IMG, which it cannot. Migration #9 flips them to `REFERENCE` so the
existing reference UX renders instead of an apply button. That is correct and is the point.

Two things the human should know:

1. **Production holds each of those 8 agencies TWICE — 16 rows, not 8.** Production has
   been seeded twice at some point. All 16 are member-less and route-less, so all 16 get
   converted. The duplication is a pre-existing data-hygiene problem this migration neither
   causes nor fixes; worth a separate cleanup.

2. **The talent representation directory drops from 21 ACTIVE agencies to 5**, and all 5
   remaining are internal test fixtures: `Draft House`, `Expiry House`, `Lumen Model
   Management`, `Minor Consent House`, `Pholio Partner Agency`. Post-migration, a talent
   browsing agencies sees a near-empty directory of test accounts. That is *more truthful*
   than the current state, but it is a visible product change, not just a schema change.

3. `spec_registry_agency_routes` is **empty** in production (0 rows), so #9's `DELETE` is a
   no-op there. `npm run map:spec-registry-agencies` has evidently never run against prod.

**Code compatibility is already in place.** `src/domains/talent/routes/agencies.js:63`
filters `.where({ status: "ACTIVE" })` and its comment explicitly anticipates REFERENCE
rows. `agencies.status` has **no CHECK constraint** in production, so `'REFERENCE'` is
accepted. No code deploy is strictly required for #9 — but confirm production is running
current `main` before proceeding.

---

## 3. Rehearsal — already done, result: PASS

Rehearsed on Neon branch `migration-rehearsal-20260818` (`br-lingering-queen-a430v6dl`),
a copy-on-write clone forked from the production default branch `br-frosty-sound-a4z862q4`.

Pre-state on the clone matched production exactly: 203 migrations, batch 16, 108 tables,
67/62/47/22/71/23 rows across users/profiles/applications/agencies/images/sessions.

```
$ env DB_CLIENT=pg DATABASE_URL='<rehearsal branch>' npm run migrate
[DATABASE_URL] Extracted hostname: ep-misty-boat-a4pzazlj-pooler.us-east-1.aws.neon.tech
Batch 17 run: 10 migrations
```

Verified afterwards:

- All 10 recorded in `knex_migrations` batch 17. No errors, no manual intervention.
- **Data intact and unchanged**: 67 users, 62 profiles, 47 applications, 22 agencies,
  71 images, 23 sessions. Application status distribution byte-identical to pre-state.
- Tables 108 → **116**; all 8 expected new tables present.
- `off_platform_submissions`: 15 columns, correct types (`sent_summary` is real `jsonb`,
  `submitted_on` is `date`, `review_window_days` defaults to 30), both expected indexes
  plus PK, both FKs resolved.
- `applications_status_check` now lists 16 statuses including `confirmed` and
  `declined_by_talent`.
- Legacy `applications_profile_id_agency_id_unique` gone; both partial uniques created with
  the correct `WHERE` clauses.
- `call_purpose` backfilled to `'representation'` on all 47 existing rows.
- `agencies.org_kind` = `'agency'` on all 22.
- Agencies: 5 ACTIVE / 1 INACTIVE / **16 REFERENCE**.
- **Functional smoke test**: inserted a row into `off_platform_submissions` (the "Log a
  submission" write path), read it back with correct defaults and `jsonb` round-trip, then
  rolled back. The feature's blocking table works.
- **Idempotency**: a second `npm run migrate` returned `Already up to date`.

The rehearsal branch is still live and expires automatically at **2026-08-19T12:00 UTC**.
It is left in place deliberately so the outcome can be inspected before approving
production. To remove it early, use the Neon console or `delete_branch` on
project `wispy-pond-67746199`, branch `br-lingering-queen-a430v6dl`.

---

## 4. Execution against production

> Do not run any of these until a human has approved §2.1.
>
> Under no circumstances run `npm run seed`, `knex seed:run`, `npm run release:spec-registry`
> (it migrates **and seeds**), `knex migrate:rollback`, `npx jest`, or any test suite against
> production. These have wiped this database before.

### 4.0 Pre-flight

```bash
cd /Users/lenquanhone/Projects/pholio-app
git checkout main && git pull          # migration files must match what was rehearsed
git status                             # must be clean
```

Take a Neon restore point. Neon's history retention on this project is **21600 seconds
(6 hours)** — that is the entire rollback window, so do not start this and walk away.
Either create a named branch from production immediately before migrating (instant, free,
and the cleanest restore path), or note the exact UTC timestamp of the pre-migration state
for point-in-time restore.

Confirm nothing is stuck and nothing has drifted:

```bash
DB_CLIENT=pg DATABASE_URL='<PROD_URL>' \
  node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});c.connect().then(async()=>{console.log((await c.query('SELECT count(*) n, max(batch) b FROM knex_migrations')).rows);console.log((await c.query('SELECT * FROM knex_migrations_lock')).rows);await c.end();})"
```

Expect `{ n: '203', b: 16 }` and `is_locked: 0`. If `is_locked` is `1` with no migration
actually running, clear it with `UPDATE knex_migrations_lock SET is_locked = 0;` — and only
then.

### 4.1 Run it

`.env` already contains `DB_CLIENT=pg` and the production `DATABASE_URL`, so a bare
`npm run migrate` from the repo root hits production. Pass it explicitly anyway, so the
target is visible in the command rather than inherited from a file:

```bash
env DB_CLIENT=pg DATABASE_URL='postgresql://…@ep-cold-moon-a4bwyid7-pooler.us-east-1.aws.neon.tech/neondb?sslmode=verify-full' \
  npm run migrate
```

**Expected output — exactly this:**

```
> knex migrate:latest

[DATABASE_URL] Extracted hostname: ep-cold-moon-a4bwyid7-pooler.us-east-1.aws.neon.tech
[DATABASE_URL] Is valid Neon hostname: true (hostname: ep-cold-moon-a4bwyid7-pooler.us-east-1.aws.neon.tech)
Batch 17 run: 10 migrations
```

Check the hostname line before anything else. If it does not say `ep-cold-moon-a4bwyid7`,
you migrated something other than production.

### 4.2 Verify

```bash
env DB_CLIENT=pg DATABASE_URL='<PROD_URL>' npm run migrate:status   # expect: 0 pending
```

Then confirm the substance:

```sql
-- 10 rows, batch 17
SELECT name FROM knex_migrations WHERE batch = 17 ORDER BY id;

-- data untouched: 67 / 62 / 47 / 22
SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM profiles) profiles,
       (SELECT count(*) FROM applications) applications, (SELECT count(*) FROM agencies) agencies;

-- 8 rows
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN
 ('off_platform_submissions','agency_verifications','agency_call_windows','external_comp_cards',
  'event_pick_lists','event_pick_list_items','event_pick_selections','event_casting_funnel_events');

-- must contain 'confirmed' and 'declined_by_talent'
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'applications'::regclass AND contype = 'c';

-- all 47 rows 'representation'
SELECT call_purpose, count(*) FROM applications GROUP BY 1;

-- expect ACTIVE 5 / INACTIVE 1 / REFERENCE 16
SELECT status, count(*) FROM agencies GROUP BY 1 ORDER BY 1;
```

Finally, exercise it in the product: open the talent Market / Apply surface and log an
off-platform submission. That is the write path that fails today.

### 4.3 If it fails partway

Migrations 1–4 run with `exports.config = { transaction: false }`, so a failure mid-batch
can leave the batch partially applied. This was designed for: every statement in those four
is guarded (`IF NOT EXISTS`, `hasColumn`, `hasTable`), and knex only records a migration in
`knex_migrations` after it completes.

1. **Read the error. Do not immediately re-run.**
2. **Do not run `npm run migrate:rollback`.** Rolling back #2 recreates the blanket
   `UNIQUE(profile_id, agency_id)` and rolling back #9 re-activates the 8 fake-deliverable
   agencies. Rollback is a worse state than a half-applied forward migration.
3. Check what landed: `SELECT name FROM knex_migrations WHERE batch = 17 ORDER BY id;`
4. `SELECT * FROM knex_migrations_lock;` — a crashed run leaves `is_locked = 1` and blocks
   every future migration. Clear it with `UPDATE knex_migrations_lock SET is_locked = 0;`
   once you have confirmed nothing is running.
5. Re-run `npm run migrate`. The guards make the failed migration re-runnable from the top.
6. If it fails the same way twice, stop and restore: reset production from the pre-migration
   branch/restore point taken in §4.0, within the 6-hour retention window.

---

## 5. Root cause, and the fix that matters

**Nothing in the deploy pipeline has ever run migrations.**

- `netlify.toml` `[build] command` is
  `node scripts/patch-express.js && npm run build:function && npm run generate:favicons && npm run setup:sender-avatar && npm --prefix client install … && npm --prefix client run build`.
  No migrate step.
- `.github/workflows/ci.yml` runs client build, client tests, server tests, client lint.
  No migrate step, and no check that migrations are even applied.
- `package.json` *has* a `build:migrate` script (`npm run migrate && npm run build`) —
  it is simply never invoked by anything.

So every schema change since the project started has depended on somebody remembering to
run `npm run migrate` by hand against production. Batch 16 landed 2026-08-14; the ten
migrations authored on 2026-08-15 and 2026-08-18 were never hand-run. There is no alarm
anywhere that says so — the app just 500s on the missing table. This will recur on the very
next migration unless the pipeline changes.

### Fix A — run migrations on production deploys (primary)

Add a guarded step to the Netlify build. `knex` and `pg` are both production `dependencies`,
and `migrations/**` is already in the function's `included_files`, so nothing new needs
installing.

Create `scripts/deploy-migrate.js`:

```js
#!/usr/bin/env node
"use strict";
// Runs pending migrations during a Netlify PRODUCTION build only.
// Deploy previews and branch deploys must never migrate the production database.
const { execFileSync } = require("child_process");

if (process.env.CONTEXT !== "production") {
  console.log(`[deploy-migrate] CONTEXT=${process.env.CONTEXT || "(unset)"} — skipping.`);
  process.exit(0);
}
if (process.env.DB_CLIENT !== "pg" || !process.env.DATABASE_URL) {
  console.error("[deploy-migrate] DB_CLIENT=pg and DATABASE_URL are required. Failing the build.");
  process.exit(1);
}
console.log("[deploy-migrate] Applying pending migrations…");
execFileSync("npx", ["knex", "migrate:latest"], { stdio: "inherit" });
console.log("[deploy-migrate] Done.");
```

Then in `netlify.toml`:

```toml
[build]
  command = "node scripts/patch-express.js && node scripts/deploy-migrate.js && npm run build:function && npm run generate:favicons && npm run setup:sender-avatar && npm --prefix client install --legacy-peer-deps --include=dev && npm --prefix client run build"
```

Placed before `build:function` so a failed migration fails the build *before* new code ships
against an old schema. Confirm `DATABASE_URL` and `DB_CLIENT=pg` are set in the Netlify
production environment (they must already be, or the deployed function could not connect).

The `CONTEXT !== "production"` guard is load-bearing. Without it, every deploy preview of
every PR would run that PR's migrations against the production database.

### Fix B — a detector, so silence is impossible (secondary, do this too)

Fix A only helps deploys that happen. Add a CI job on `main` that fails when migration files
exist that production has not applied — so an un-deployed migration is loud rather than
invisible. It needs a read-only `DATABASE_URL` in GitHub Secrets and can be as small as
`knex migrate:status` asserting zero pending.

Fix A prevents recurrence. Fix B catches the case where Fix A was bypassed or the deploy
never ran. The current state — 10 migrations sitting unapplied for four days with a
production feature dead and no signal — is what having neither looks like.

---

## Appendix — safety rules honoured while producing this

- All production access was `SELECT` / `information_schema` under
  `SET default_transaction_read_only = on`. Zero writes to production.
- `knex migrate:status` was **not** run against production during the audit: knex's
  `ensureTable` would create `knex_migrations` if absent, which is a write. Plain SELECTs
  against `knex_migrations` were used instead.
- The rehearsal ran only against Neon branch `br-lingering-queen-a430v6dl`. Every script
  used in the rehearsal hard-asserts the hostname `ep-misty-boat-a4pzazlj` and refuses to
  run otherwise.
- No seed, rollback, or test command was run against any Neon database.
