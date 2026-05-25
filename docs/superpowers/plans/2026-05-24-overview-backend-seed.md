# Overview Tab Backend & Demo Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two backend shape bugs on the Overview tab analytics API and seed `talent@example.com` with 90 days of realistic analytics, 7 agency applications, and 25 activity entries so the dashboard looks live on first launch.

**Architecture:** Three files change. `analytics.js` gets a numeric `changePct` field added to the summary response alongside the existing string. `dashboard.js` wires the dead `activityStream` to the real `activities` table. `seeds/seed.js` replaces the bare-bones talent profile with Mia Voss (Studio+) and calls a new `seedDemoData()` helper that populates all supporting tables.

**Tech Stack:** Node.js/Express 5, Knex.js, SQLite (dev), Jest + Supertest (tests), `uuid` v4

---

## File Map

| File | Change |
|------|--------|
| `src/domains/talent/routes/analytics.js` | Add `changePct: number` to `calcTrend()` return value; propagate to `/summary` response |
| `src/domains/talent/routes/dashboard.js` | Replace empty `activityStream` try-block with real `activities` table query; extract `formatActivity` helper |
| `seeds/seed.js` | Enrich talent profile → Mia Voss (Studio+); add `seedDemoData()` helper for agencies, applications, analytics, visitor_sessions, activities |
| `tests/overview-backend.test.js` | Integration tests: `changePct` is numeric, `activityStream` is non-empty, seed produces expected row counts |

---

## Task 1: Fix `calcTrend()` to emit `changePct` as a number

**Files:**
- Modify: `src/domains/talent/routes/analytics.js`
- Test: `tests/overview-backend.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `tests/overview-backend.test.js`:

```js
const request = require('supertest');
const knex = require('../src/shared/db/knex');
const app = require('../src/app');

let agent;

beforeAll(async () => {
  try {
    await knex.raw('UPDATE knex_migrations_lock SET is_locked = 0 WHERE is_locked = 1');
  } catch {}
  try {
    await knex.migrate.rollback({}, true);
  } catch {
    try { await knex.raw('UPDATE knex_migrations_lock SET is_locked = 0'); } catch {}
  }
  await knex.migrate.latest();
  await knex.seed.run();

  agent = request.agent(app);
  await agent.post('/login').type('form').send({
    email: 'talent@example.com',
    password: 'password123',
  });
}, 60000);

afterAll(async () => {
  await knex.destroy();
});

describe('GET /api/talent/summary', () => {
  test('returns changePct as a finite number on views', async () => {
    const res = await agent.get('/api/talent/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { views } = res.body.data;
    expect(typeof views.changePct).toBe('number');
    expect(Number.isFinite(views.changePct)).toBe(true);
  });

  test('returns changePct as a finite number on downloads', async () => {
    const res = await agent.get('/api/talent/summary');
    const { downloads } = res.body.data;
    expect(typeof downloads.changePct).toBe('number');
    expect(Number.isFinite(downloads.changePct)).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "changePct" -t "returns changePct" 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toBe('number')` with `received = undefined`

- [ ] **Step 1.3: Update `calcTrend()` in `analytics.js`**

Open `src/domains/talent/routes/analytics.js`. Find the `calcTrend` helper (around line 170 — search for `const calcTrend`). Change it from:

```js
const calcTrend = (current, previous) => {
  const cur = Number(current?.count || 0);
  const prev = Number(previous?.count || 0);

  if (prev === 0) {
    return {
      change: cur > 0 ? "+100%" : "0%",
      trend: cur > 0 ? "up" : "neutral",
    };
  }

  const percent = ((cur - prev) / prev) * 100;
  const sign = percent > 0 ? "+" : "";
  const trend = percent > 0 ? "up" : percent < 0 ? "down" : "neutral";

  return { change: `${sign}${Math.round(percent)}%`, trend };
};
```

To:

```js
const calcTrend = (current, previous) => {
  const cur = Number(current?.count || 0);
  const prev = Number(previous?.count || 0);

  if (prev === 0) {
    const changePct = cur > 0 ? 100 : 0;
    return {
      change: cur > 0 ? "+100%" : "0%",
      changePct,
      trend: cur > 0 ? "up" : "neutral",
    };
  }

  const percent = ((cur - prev) / prev) * 100;
  const changePct = Math.round(percent);
  const sign = percent > 0 ? "+" : "";
  const trend = percent > 0 ? "up" : percent < 0 ? "down" : "neutral";

  return { change: `${sign}${changePct}%`, changePct, trend };
};
```

- [ ] **Step 1.4: Propagate `changePct` through the `/summary` response**

Still in `analytics.js`, find the `apiResponse.success(res, { ... })` call at the end of the `/summary` handler. The `viewsTrend` and `downloadsTrend` objects already come from `calcTrend()` — they now have `changePct`. Update the response to spread it through:

```js
apiResponse.success(res, {
  views: {
    total: Number(currentViews?.count || 0),
    thisWeek: Number(thisWeekViews?.count || 0),
    thisMonth: Number(currentViews?.count || 0),
    change: viewsTrend.change,
    changePct: viewsTrend.changePct,   // ADD THIS LINE
    trend: viewsTrend.trend,
  },
  downloads: {
    total: Number(currentDownloads?.count || 0),
    thisWeek: Number(thisWeekDownloads?.count || 0),
    thisMonth: Number(currentDownloads?.count || 0),
    change: downloadsTrend.change,
    changePct: downloadsTrend.changePct,  // ADD THIS LINE
    trend: downloadsTrend.trend,
  },
  completeness: {
    percentage: completeness,
    missingItems: topMissingItems,
  },
});
```

- [ ] **Step 1.5: Run tests to confirm passing**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "changePct" 2>&1 | tail -20
```

Expected: PASS ✓ (2 tests)

- [ ] **Step 1.6: Commit**

```bash
git add src/domains/talent/routes/analytics.js tests/overview-backend.test.js
git commit -m "fix(analytics): add changePct as number to summary response

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Wire `overview` activity stream to real data

**Files:**
- Modify: `src/domains/talent/routes/dashboard.js`
- Test: `tests/overview-backend.test.js`

- [ ] **Step 2.1: Write the failing test**

Append to `tests/overview-backend.test.js`:

```js
describe('GET /api/talent/overview', () => {
  test('returns activityStream as a non-empty array after seed', async () => {
    const res = await agent.get('/api/talent/overview');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activityStream)).toBe(true);
    expect(res.body.activityStream.length).toBeGreaterThan(0);
  });

  test('each activity has id, type, message, icon, timeAgo', async () => {
    const res = await agent.get('/api/talent/overview');
    const first = res.body.activityStream[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('message');
    expect(first).toHaveProperty('icon');
    expect(first).toHaveProperty('timeAgo');
  });
});
```

- [ ] **Step 2.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "activityStream" 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toBeGreaterThan(0)` with `received = 0`

- [ ] **Step 2.3: Extract `formatActivity` helper in `dashboard.js`**

Open `src/domains/talent/routes/dashboard.js`. Before the router definition (before `const router = express.Router()`), add the helper:

```js
function formatActivity(activity) {
  const metadata =
    activity.metadata && typeof activity.metadata === 'string'
      ? (() => { try { return JSON.parse(activity.metadata); } catch { return {}; } })()
      : (activity.metadata || {});

  let message = 'Activity recorded';
  let icon = '📝';

  switch (activity.activity_type) {
    case 'profile_updated':
      message = 'Profile updated';
      icon = '✏️';
      break;
    case 'image_uploaded': {
      const n = metadata.imageCount || 1;
      message = `${n} image${n > 1 ? 's' : ''} uploaded`;
      icon = '📷';
      break;
    }
    case 'pdf_downloaded': {
      const theme = metadata.theme || 'default';
      message = `PDF downloaded (${theme} theme)`;
      icon = '📄';
      break;
    }
    case 'portfolio_viewed':
      message = 'Portfolio viewed';
      icon = '👁️';
      break;
    case 'submission_package_created': {
      const n = metadata.imageCount ?? 0;
      message = n > 0
        ? `Submission package saved (${n} image${n !== 1 ? 's' : ''})`
        : 'Submission package saved';
      icon = '📦';
      break;
    }
  }

  const now = new Date();
  const then = new Date(activity.created_at);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  let timeAgo;
  if (diffMins < 1) timeAgo = 'Just now';
  else if (diffMins < 60) timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  else if (diffHours < 24) timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  else if (diffDays < 7) timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  else timeAgo = then.toLocaleDateString();

  return { id: activity.id, type: activity.activity_type, message, icon, metadata, createdAt: activity.created_at, timeAgo };
}
```

- [ ] **Step 2.4: Wire `activityStream` inside the overview handler**

In the same file, inside the `/overview` GET handler, replace the empty `try` block:

```js
// BEFORE (dead code):
let activityStream = [];
try {
  // activityStream = ...
} catch (error) {
  console.warn("Failed to fetch activity stream", error);
}
```

With:

```js
let activityStream = [];
try {
  const rows = await knex('activities')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(5);
  activityStream = rows.map(formatActivity);
} catch (error) {
  console.warn('Failed to fetch activity stream', error);
}
```

- [ ] **Step 2.5: Run tests to confirm passing**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "activityStream" 2>&1 | tail -20
```

Expected: PASS ✓ (2 tests)

- [ ] **Step 2.6: Commit**

```bash
git add src/domains/talent/routes/dashboard.js tests/overview-backend.test.js
git commit -m "fix(overview): wire activityStream to activities table

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Enrich the demo talent profile → Mia Voss (Studio+)

**Files:**
- Modify: `seeds/seed.js`
- Test: `tests/overview-backend.test.js`

- [ ] **Step 3.1: Write the failing test**

Append to `tests/overview-backend.test.js`:

```js
describe('Demo seed: talent@example.com profile', () => {
  test('profile is Mia Voss with is_pro=true', async () => {
    const res = await agent.get('/api/talent/profile');
    expect(res.status).toBe(200);
    const { profile } = res.body;
    expect(profile.first_name).toBe('Mia');
    expect(profile.last_name).toBe('Voss');
    expect(profile.slug).toBe('mia-voss');
    expect(profile.is_pro).toBe(true);
  });

  test('profile has 6 images', async () => {
    const res = await agent.get('/api/talent/profile');
    expect(res.body.images.length).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 3.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Mia Voss" 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toBe('Mia')` with `received = 'Sample'`

- [ ] **Step 3.3: Replace the talent profile insert in `seeds/seed.js`**

Open `seeds/seed.js`. Find the block that creates `talentId` and the profile for `talent@example.com`. Replace the entire profile insert and its associated images with:

```js
// Create talent account (demo: Mia Voss, Studio+)
const talentId = uuidv4();
await knex('users').insert({
  id: talentId,
  email: 'talent@example.com',
  password_hash: passwordHash,
  role: 'TALENT'
});

const profileId = uuidv4();
await knex('profiles').insert({
  id: profileId,
  user_id: talentId,
  slug: 'mia-voss',
  first_name: 'Mia',
  last_name: 'Voss',
  city: 'Los Angeles, CA',
  height_cm: 178,
  weight_kg: 57,
  bust_cm: 81,
  waist_cm: 61,
  hips_cm: 88,
  dress_size: '4',
  shoe_size: '8 US',
  hair_color: 'Dark Brown',
  hair_length: 'Long',
  eye_color: 'Hazel',
  skin_tone: 'Medium',
  gender: 'Female',
  date_of_birth: '1997-04-12',
  experience_level: 'Experienced',
  specialties: JSON.stringify(['Editorial', 'Commercial', 'Runway']),
  languages: JSON.stringify(['English', 'French']),
  instagram_handle: 'miavoss',
  portfolio_url: 'https://miavoss.com',
  twitter_handle: 'miavoss',
  bio_raw: 'LA-based editorial and commercial model with six years of campaign and runway experience.',
  bio_curated: 'Mia Voss is a Los Angeles-based editorial and commercial model with over six years of campaign and runway experience. Known for her ability to shift between high-fashion editorial and warm commercial presence, she is represented across three continents.',
  training: 'Formal training in editorial modeling and runway technique. Workshops with Elite Model Management NY (2019), IMG Paris (2021).',
  union_membership: null,
  tattoos: false,
  piercings: false,
  availability_travel: true,
  availability_schedule: 'Full-time',
  emergency_contact_name: 'Sophie Voss',
  emergency_contact_phone: '+1 (310) 555-0182',
  emergency_contact_relationship: 'Sister',
  is_pro: true,
  partner_agency_id: null,
});

const miaImages = [
  { label: 'Headshot',     sort: 1, path: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1000&q=80' },
  { label: 'Editorial',    sort: 2, path: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=80' },
  { label: 'Runway',       sort: 3, path: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80' },
  { label: 'Commercial',   sort: 4, path: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=80' },
  { label: 'Editorial 2',  sort: 5, path: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1000&q=80' },
  { label: 'Lifestyle',    sort: 6, path: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1000&q=80' },
];
for (const img of miaImages) {
  await knex('images').insert({ id: uuidv4(), profile_id: profileId, ...img });
}
```

- [ ] **Step 3.4: Run tests to confirm passing**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Demo seed" 2>&1 | tail -20
```

Expected: PASS ✓ (2 tests)

- [ ] **Step 3.5: Commit**

```bash
git add seeds/seed.js tests/overview-backend.test.js
git commit -m "seed: replace Sample Talent with Mia Voss (Studio+, 6 images)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Seed agencies and applications

**Files:**
- Modify: `seeds/seed.js`

Note: Application statuses must be one of: `submitted`, `shortlisted`, `booked`, `passed`, `accepted`, `declined`, `archived`. SQLite enforces this via CHECK constraint. Do NOT use `pending` or `reviewing`.

- [ ] **Step 4.1: Write the failing test**

Append to `tests/overview-backend.test.js`:

```js
describe('Demo seed: applications', () => {
  test('talent@example.com has 7 applications', async () => {
    const res = await agent.get('/api/talent/applications');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(7);
  });

  test('applications include accepted and declined statuses', async () => {
    const res = await agent.get('/api/talent/applications');
    const statuses = res.body.data.map(a => a.status);
    expect(statuses).toContain('accepted');
    expect(statuses).toContain('declined');
  });
});
```

- [ ] **Step 4.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "7 applications" 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toBe(7)` with `received = 0`

- [ ] **Step 4.3: Add `seedDemoData` function to `seeds/seed.js`**

At the top of `seeds/seed.js`, ensure `uuidv4` is already imported (it is). Add a `seedDemoData` function before `exports.seed`:

```js
async function seedDemoData(knex, talentId, profileId) {
  // ─── Agencies ───────────────────────────────────────────────────────────
  const agencies = [
    { name: 'Wilhelmina Models',      location: 'New York, NY',  website: 'https://wilhelmina.com' },
    { name: 'IMG Models',             location: 'New York, NY',  website: 'https://imgmodels.com' },
    { name: 'Elite Model Management', location: 'Paris, France', website: 'https://elitemodel.com' },
    { name: 'Ford Models',            location: 'New York, NY',  website: 'https://fordmodels.com' },
    { name: 'DNA Model Management',   location: 'Los Angeles, CA', website: 'https://dnamodels.com' },
    { name: 'The Society Management', location: 'Los Angeles, CA', website: 'https://thesocietymanagement.com' },
    { name: 'Next Management',        location: 'New York, NY',  website: 'https://nextmanagement.com' },
    { name: 'Marilyn Agency',         location: 'Paris, France', website: 'https://marilynagency.com' },
  ];

  const agencyIds = [];
  for (const ag of agencies) {
    const id = uuidv4();
    agencyIds.push(id);
    await knex('agencies').insert({ id, name: ag.name, location: ag.location, website: ag.website, status: 'ACTIVE' });
  }

  // ─── Applications ────────────────────────────────────────────────────────
  // Valid statuses: submitted, shortlisted, booked, passed, accepted, declined, archived
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  const apps = [
    { agencyIdx: 0, status: 'shortlisted', daysAgo: 3  },  // Wilhelmina
    { agencyIdx: 6, status: 'submitted',   daysAgo: 5  },  // Next Management
    { agencyIdx: 1, status: 'accepted',    daysAgo: 14 },  // IMG Models
    { agencyIdx: 2, status: 'submitted',   daysAgo: 21 },  // Elite
    { agencyIdx: 3, status: 'booked',      daysAgo: 28 },  // Ford
    { agencyIdx: 4, status: 'declined',    daysAgo: 45 },  // DNA
    { agencyIdx: 5, status: 'submitted',   daysAgo: 7  },  // Society
  ];

  for (const app of apps) {
    await knex('applications').insert({
      id: uuidv4(),
      profile_id: profileId,
      agency_id: agencyIds[app.agencyIdx],
      status: app.status,
      created_at: daysAgo(app.daysAgo),
    });
  }

  return { agencyIds };
}
```

- [ ] **Step 4.4: Call `seedDemoData` at the end of `exports.seed`**

Inside `exports.seed`, after the `profileId` and images are inserted, add:

```js
await seedDemoData(knex, talentId, profileId);
```

Also add these tables to the deletion block at the top of `exports.seed` so re-seeds are clean:

```js
await knex('applications').del().catch(() => {});
await knex('analytics').del().catch(() => {});
await knex('visitor_sessions').del().catch(() => {});
await knex('activities').del().catch(() => {});
```

Place these BEFORE the `agency_memberships` and `agencies` deletions (so FK ordering is correct).

- [ ] **Step 4.5: Run tests**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "applications" 2>&1 | tail -20
```

Expected: PASS ✓ (2 tests)

- [ ] **Step 4.6: Commit**

```bash
git add seeds/seed.js tests/overview-backend.test.js
git commit -m "seed: add 8 agencies and 7 applications for Mia Voss demo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Seed 90 days of analytics + visitor sessions

**Files:**
- Modify: `seeds/seed.js` (inside `seedDemoData`)

- [ ] **Step 5.1: Write the failing test**

Append to `tests/overview-backend.test.js`:

```js
describe('Demo seed: analytics', () => {
  test('summary reports > 100 views total for talent@example.com', async () => {
    const res = await agent.get('/api/talent/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.views.total).toBeGreaterThan(100);
  });

  test('timeseries has 30 data points', async () => {
    const res = await agent.get('/api/talent/timeseries?days=30');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(30);
  });

  test('analytics endpoint returns engagement counts', async () => {
    const res = await agent.get('/api/talent/analytics?days=30');
    expect(res.status).toBe(200);
    const { engagement } = res.body.data;
    expect(engagement.counts.bio_read).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Demo seed: analytics" 2>&1 | tail -20
```

Expected: FAIL — `expect(0).toBeGreaterThan(100)`

- [ ] **Step 5.3: Add analytics seeding to `seedDemoData` in `seeds/seed.js`**

Inside `seedDemoData`, after the applications block, add:

```js
  // ─── Analytics + Visitor Sessions (90 days) ─────────────────────────────
  const VISITOR_IDS = Array.from({ length: 18 }, () => uuidv4());
  const REFERRERS = [
    'https://instagram.com', 'https://instagram.com', 'https://instagram.com', // 45%
    null, null,                                                                  // 30% direct
    'https://google.com', 'https://google.com',                                  // 15%
    'https://tiktok.com',                                                         // 10%
  ];
  const THEMES = ['editorial', 'minimal', 'bold'];
  const AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  ];

  for (let daysBack = 90; daysBack >= 1; daysBack--) {
    const day = new Date(now.getTime() - daysBack * 86400000);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    // Recency boost: old days 3-6/day, recent days 8-15/day
    const recencyFactor = 1 + ((90 - daysBack) / 90) * 1.8;
    const base = isWeekend ? 5 : 3;
    const dailyViews = Math.round((base + Math.random() * 4) * recencyFactor);

    for (let v = 0; v < dailyViews; v++) {
      const viewTime = new Date(day);
      viewTime.setHours(8 + Math.floor(Math.random() * 14));
      viewTime.setMinutes(Math.floor(Math.random() * 60));

      const isReturning = Math.random() < 0.65;
      const visitorId = isReturning
        ? VISITOR_IDS[Math.floor(Math.random() * 12)]
        : VISITOR_IDS[12 + Math.floor(Math.random() * 6)];

      const referrer = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
      const userAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const ip = `${100 + Math.floor(Math.random() * 155)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const sessionId = uuidv4();

      await knex('visitor_sessions').insert({
        id: sessionId,
        profile_id: profileId,
        visitor_id: visitorId,
        started_at: viewTime.toISOString(),
        last_activity_at: viewTime.toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        referrer,
        is_returning: isReturning,
      });

      await knex('analytics').insert({
        id: uuidv4(),
        profile_id: profileId,
        event_type: 'view',
        event_source: 'web',
        metadata: JSON.stringify({ referrer, slug: 'mia-voss' }),
        ip_address: ip,
        user_agent: userAgent,
        created_at: viewTime.toISOString(),
      });

      // bio_read — 65% chance
      if (Math.random() < 0.65) {
        await knex('analytics').insert({
          id: uuidv4(), profile_id: profileId, event_type: 'bio_read', event_source: 'web',
          metadata: JSON.stringify({ duration: 10 + Math.floor(Math.random() * 40) }),
          ip_address: ip, user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 15000).toISOString(),
        });
      }

      // social_click — 25% chance
      if (Math.random() < 0.25) {
        await knex('analytics').insert({
          id: uuidv4(), profile_id: profileId, event_type: 'social_click', event_source: 'web',
          metadata: JSON.stringify({ platform: 'instagram' }),
          ip_address: ip, user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 30000).toISOString(),
        });
      }

      // portfolio_click — 20% chance
      if (Math.random() < 0.20) {
        await knex('analytics').insert({
          id: uuidv4(), profile_id: profileId, event_type: 'portfolio_click', event_source: 'web',
          metadata: JSON.stringify({ target: 'editorial' }),
          ip_address: ip, user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 45000).toISOString(),
        });
      }

      // scroll_depth — 50% chance
      if (Math.random() < 0.50) {
        await knex('analytics').insert({
          id: uuidv4(), profile_id: profileId, event_type: 'scroll_depth', event_source: 'web',
          metadata: JSON.stringify({ depth: Math.random() < 0.6 ? 75 : 100 }),
          ip_address: ip, user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 60000).toISOString(),
        });
      }

      // download — 12% chance
      if (Math.random() < 0.12) {
        await knex('analytics').insert({
          id: uuidv4(), profile_id: profileId, event_type: 'download', event_source: 'web',
          metadata: JSON.stringify({ theme: THEMES[Math.floor(Math.random() * THEMES.length)] }),
          ip_address: ip, user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 90000).toISOString(),
        });
      }
    }
  }
```

- [ ] **Step 5.4: Run tests**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Demo seed: analytics" 2>&1 | tail -20
```

Expected: PASS ✓ (3 tests)  
Note: This seed step inserts ~3,000–5,000 rows and takes 15–30 seconds in SQLite. That's expected.

- [ ] **Step 5.5: Commit**

```bash
git add seeds/seed.js tests/overview-backend.test.js
git commit -m "seed: add 90 days analytics + visitor sessions for Mia Voss

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Seed 25 activity entries

**Files:**
- Modify: `seeds/seed.js` (inside `seedDemoData`)
- Test: `tests/overview-backend.test.js`

- [ ] **Step 6.1: Write the failing test**

Append to `tests/overview-backend.test.js`:

```js
describe('Demo seed: activities', () => {
  test('activity feed has at least 10 entries', async () => {
    const res = await agent.get('/api/talent/activity');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
  });

  test('activities contain multiple types', async () => {
    const res = await agent.get('/api/talent/activity');
    const types = [...new Set(res.body.data.map(a => a.type))];
    expect(types.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 6.2: Run to confirm failure**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Demo seed: activities" 2>&1 | tail -20
```

Expected: FAIL — `expect(0).toBeGreaterThanOrEqual(10)`

- [ ] **Step 6.3: Add activity seeding to `seedDemoData` in `seeds/seed.js`**

Inside `seedDemoData`, after the analytics block (before the closing brace), add:

```js
  // ─── Activities (30 days, 25 entries) ────────────────────────────────────
  const activityTemplates = [
    { type: 'image_uploaded',              meta: () => ({ imageCount: 1 + Math.floor(Math.random() * 3) }) },
    { type: 'image_uploaded',              meta: () => ({ imageCount: 2 }) },
    { type: 'profile_updated',             meta: () => ({ fields: [['bio', 'measurements', 'instagram_handle', 'city', 'training'][Math.floor(Math.random() * 5)]] }) },
    { type: 'profile_updated',             meta: () => ({ fields: ['height_cm', 'weight_kg'] }) },
    { type: 'pdf_downloaded',              meta: () => ({ theme: THEMES[Math.floor(Math.random() * THEMES.length)] }) },
    { type: 'pdf_downloaded',              meta: () => ({ theme: 'editorial' }) },
    { type: 'portfolio_viewed',            meta: () => ({ source: ['direct', 'instagram', 'google'][Math.floor(Math.random() * 3)] }) },
    { type: 'submission_package_created',  meta: () => ({ imageCount: 4 + Math.floor(Math.random() * 3) }) },
  ];

  // Spread 25 entries across 30 days, denser in recent days
  const activityDays = [];
  for (let i = 0; i < 25; i++) {
    // Bias toward recent days (0-14 = 70% of entries)
    const bias = Math.random() < 0.70 ? Math.floor(Math.random() * 14) : 14 + Math.floor(Math.random() * 16);
    activityDays.push(bias);
  }
  activityDays.sort((a, b) => b - a); // chronological desc

  for (const dayOffset of activityDays) {
    const t = new Date(now.getTime() - dayOffset * 86400000);
    t.setHours(9 + Math.floor(Math.random() * 10));
    t.setMinutes(Math.floor(Math.random() * 60));
    const tmpl = activityTemplates[Math.floor(Math.random() * activityTemplates.length)];
    await knex('activities').insert({
      id: uuidv4(),
      user_id: talentId,
      activity_type: tmpl.type,
      metadata: JSON.stringify(tmpl.meta()),
      created_at: t.toISOString(),
    });
  }
```

- [ ] **Step 6.4: Run tests**

```bash
npx jest tests/overview-backend.test.js --testNamePattern "Demo seed: activities" 2>&1 | tail -20
```

Expected: PASS ✓ (2 tests)

- [ ] **Step 6.5: Run full test suite**

```bash
npx jest tests/overview-backend.test.js 2>&1 | tail -30
```

Expected: All tests pass (14 tests total)

- [ ] **Step 6.6: Commit**

```bash
git add seeds/seed.js tests/overview-backend.test.js
git commit -m "seed: add 25 activity entries for Mia Voss demo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: End-to-end verification

- [ ] **Step 7.1: Re-seed the local database**

```bash
npm run seed
```

Expected output: no errors, completes in under 60 seconds.

- [ ] **Step 7.2: Start the dev server and open the Overview tab**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/talent`. Log in as `talent@example.com` / `password123`.

Check the following on the Overview tab:
- Hero KPIs show: Profile Views > 100, Readiness > 50%, Submissions = 7
- "The Book" shows 6 images (first is Headshot cover)
- "The Audit" shows ≥ 3 green checks
- "The Market" shows view count > 0 and a trend badge ("+XX% views")
- Studio+ "Your Website" section is visible (since is_pro = true)
- Website analytics show views, downloads, link clicks, bio reads > 0
- Sparkline bars are non-flat

- [ ] **Step 7.3: Final commit**

```bash
git add .
git commit -m "feat: complete Overview tab backend + Mia Voss demo seed

- Fix summary endpoint to emit changePct as number
- Wire overview activityStream to activities table
- Replace Sample Talent with Mia Voss (Studio+) in seed
- Add 8 agencies, 7 applications, 90 days analytics, 25 activities

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Fix 1: `changePct` numeric → Task 1
- ✅ Fix 2: `activityStream` wired → Task 2  
- ✅ Mia Voss profile (all fields) → Task 3
- ✅ 8 agencies + 7 applications → Task 4 (statuses: submitted/shortlisted/booked/accepted/declined)
- ✅ 90 days analytics + visitor_sessions → Task 5
- ✅ 25 activities → Task 6
- ✅ E2E verification → Task 7

**Placeholder scan:** No TBDs. All code blocks are complete. All commands have expected output.

**Type consistency:** `formatActivity` defined in Task 2 step 2.3, used in step 2.4. `seedDemoData` function signature `(knex, talentId, profileId)` consistent in Task 4 (definition) and step 4.4 (call). `uuidv4` assumed already imported in seed.js (confirmed present in existing code). `THEMES` defined in Task 5 step 5.3, referenced in Task 6 step 6.3 — both are inside `seedDemoData`, so `THEMES` is in scope. ✅
