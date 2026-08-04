// tests/agency-analytics.test.js
'use strict'

// Point to an isolated test database BEFORE any db-touching modules load.
process.env.DATABASE_URL = 'sqlite://./test-agency-analytics.sqlite3'
process.env.DB_CLIENT = 'sqlite3'

const fs = require('fs')
const path = require('path')
const request = require('supertest')
const cookieSig = require('cookie-signature')
const { v4: uuidv4 } = require('uuid')

const knex = require('../src/shared/db/knex')
const app = require('../src/app')

/* Must be the SAME secret the app signs with, or every injected cookie fails
   signature verification and each request 401s before it reaches the handler.
   Deriving it from src/config (rather than hardcoding a fallback) means the
   two cannot drift again: config falls back to
   "pholio-dev-secret-do-not-use-in-production" outside production, and this
   file previously guessed 'pholio-secret'. */
const SESSION_SECRET = require('../src/config').sessionSecret
const TEST_DB_PATH = path.resolve(__dirname, '../test-agency-analytics.sqlite3')

// ─── Schema setup ─────────────────────────────────────────────────────────────

async function createSchema() {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (t) => {
      t.string('id', 36).primary()
      t.string('email').notNullable().unique()
      t.string('role').notNullable()
      // requireActiveAccount() (mounted on all agency domain routes in
      // app.js) selects this column — must exist or every request 500s.
      t.string('account_status').notNullable().defaultTo('active')
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('sessions'))) {
    await knex.schema.createTable('sessions', (t) => {
      t.string('sid', 255).primary()
      t.json('sess').notNullable()
      t.timestamp('expired').notNullable()
    })
  }
  if (!(await knex.schema.hasTable('profiles'))) {
    await knex.schema.createTable('profiles', (t) => {
      t.string('id', 36).primary()
      t.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE')
      t.string('first_name', 100).nullable()
      t.string('last_name', 100).nullable()
      t.string('archetype', 50).nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('boards'))) {
    await knex.schema.createTable('boards', (t) => {
      t.string('id', 36).primary()
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('name', 200).notNullable()
      t.boolean('is_active').defaultTo(true)
      t.timestamp('closes_at').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('applications'))) {
    await knex.schema.createTable('applications', (t) => {
      t.string('id', 36).primary()
      t.string('profile_id', 36).references('id').inTable('profiles')
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('status').notNullable().defaultTo('submitted')
      t.timestamp('accepted_at').nullable()
      t.timestamp('declined_at').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('application_activities'))) {
    await knex.schema.createTable('application_activities', (t) => {
      t.string('id', 36).primary()
      t.string('application_id', 36).references('id').inTable('applications').onDelete('CASCADE')
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('activity_type', 100).notNullable()
      t.text('description').nullable()
      t.text('metadata').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('board_applications'))) {
    await knex.schema.createTable('board_applications', (t) => {
      t.string('id', 36).primary()
      t.string('board_id', 36).references('id').inTable('boards').onDelete('CASCADE')
      t.string('application_id', 36).references('id').inTable('applications').onDelete('CASCADE')
      t.float('match_score').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('subscriptions'))) {
    await knex.schema.createTable('subscriptions', (t) => {
      t.string('id', 36).primary()
      t.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE')
      t.string('stripe_customer_id').notNullable().unique()
      t.string('stripe_subscription_id').nullable().unique()
      t.string('stripe_price_id').notNullable()
      t.enu('status', ['trialing', 'active', 'past_due', 'canceled', 'unpaid']).notNullable().defaultTo('trialing')
      t.timestamp('trial_start').nullable()
      t.timestamp('trial_end').nullable()
      t.timestamp('current_period_start').nullable()
      t.timestamp('current_period_end').nullable()
      t.boolean('cancel_at_period_end').notNullable().defaultTo(false)
      t.timestamp('canceled_at').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
}

// ─── Session helper ───────────────────────────────────────────────────────────

async function agentWithSession(userId, role) {
  const sid = uuidv4()
  const sessionData = {
    cookie: { originalMaxAge: null, expires: null, secure: false, httpOnly: true, path: '/' },
    userId,
    role,
    ...(role === 'AGENCY' && { agencyOnboardingCompletedAt: new Date().toISOString() }),
  }
  await knex('sessions').insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  })
  const signed = 's:' + cookieSig.sign(sid, SESSION_SECRET)
  const encoded = encodeURIComponent(signed)
  return (req) => req.set('Cookie', `connect.sid=${encoded}`)
}

// Return an ISO string, not a Date instance: Jest's sandboxed "node" test
// environment gives each test file its own realm with its own Date
// constructor, and the native sqlite3 addon's instanceof-Date check (built
// against the outer realm's Date) fails on a cross-realm Date object,
// silently stringifying it to "[object Object]" instead of storing a real
// timestamp. A plain ISO string sidesteps that entirely.
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString()
}

async function logStatusChange(applicationId, agencyId, oldStatus, newStatus, createdAt) {
  await knex('application_activities').insert({
    id: uuidv4(),
    application_id: applicationId,
    agency_id: agencyId,
    activity_type: 'status_change',
    description: `Application moved to ${newStatus}`,
    metadata: JSON.stringify({ old_status: oldStatus, new_status: newStatus }),
    created_at: createdAt,
  })
}

beforeAll(async () => {
  await createSchema()
}, 30000)

afterAll(async () => {
  await knex.destroy()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
})

// ─── Auth enforcement ─────────────────────────────────────────────────────────

describe('GET /api/agency/analytics — auth', () => {
  test('returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/agency/analytics')
    expect(res.status).toBe(401)
  })

  test('returns 403 when logged in as TALENT', async () => {
    const talentId = uuidv4()
    await knex('users').insert({ id: talentId, email: `talent-${Date.now()}@test.local`, role: 'TALENT' })
    const withCookie = await agentWithSession(talentId, 'TALENT')
    const res = await withCookie(request(app).get('/api/agency/analytics'))
    expect(res.status).toBe(403)
  })
})

// ─── Zero-state ───────────────────────────────────────────────────────────────

describe('GET /api/agency/analytics — zero state (fresh agency, no data)', () => {
  let res
  let agencyId

  beforeAll(async () => {
    agencyId = uuidv4()
    await knex('users').insert({ id: agencyId, email: `fresh-analytics-${Date.now()}@test.local`, role: 'AGENCY' })
    const withCookie = await agentWithSession(agencyId, 'AGENCY')
    res = await withCookie(request(app).get('/api/agency/analytics'))
  })

  test('returns 200 with existing shape intact', () => {
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const { analytics } = res.body
    expect(analytics.byStatus).toBeDefined()
    expect(analytics.overTime).toBeDefined()
    expect(Array.isArray(analytics.byBoard)).toBe(true)
    expect(analytics.matchScores).toBeDefined()
    expect(Array.isArray(analytics.timeline)).toBe(true)
    expect(analytics.timeline).toHaveLength(30)
    expect(typeof analytics.acceptanceRate).toBe('number')
  })

  test('default range is 90', () => {
    expect(res.body.analytics.range).toBe(90)
  })

  test('funnel has all 5 canonical stages, zero counts, null conversions', () => {
    const { funnel } = res.body.analytics
    expect(funnel.stages.map((s) => s.stage)).toEqual([
      'Applied',
      'Shortlisted',
      'Offered',
      'Represented',
      'Passed',
    ])
    funnel.stages.forEach((s) => {
      expect(s.count).toBe(0)
      expect(s.conversionFromPrevious).toBeNull()
    })
  })

  test('velocity has 3 forward transitions, all null (no samples)', () => {
    const { velocity } = res.body.analytics
    expect(velocity).toHaveLength(3)
    expect(velocity.map((v) => `${v.from}->${v.to}`)).toEqual([
      'Applied->Shortlisted',
      'Shortlisted->Offered',
      'Offered->Represented',
    ])
    velocity.forEach((v) => {
      expect(v.medianDays).toBeNull()
      expect(v.averageDays).toBeNull()
      expect(v.sampleSize).toBe(0)
    })
  })

  test('rosterGrowth has 12 months, all zero counts', () => {
    const { rosterGrowth } = res.body.analytics
    expect(rosterGrowth).toHaveLength(12)
    rosterGrowth.forEach((m) => {
      expect(typeof m.month).toBe('string')
      expect(m.count).toBe(0)
    })
  })
})

// ─── Data correctness ─────────────────────────────────────────────────────────

describe('GET /api/agency/analytics — data correctness', () => {
  const AGENCY_ID = uuidv4()
  const TALENT_ID = uuidv4()
  const PROFILE_ID = uuidv4()

  beforeAll(async () => {
    await knex('users').insert([
      { id: AGENCY_ID, email: `analytics-agency-${Date.now()}@test.local`, role: 'AGENCY' },
      { id: TALENT_ID, email: `analytics-talent-${Date.now()}@test.local`, role: 'TALENT' },
    ])
    await knex('profiles').insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      first_name: 'Ada',
      last_name: 'Byrne',
    })

    // App 1: submitted -> shortlisted -> accepted (represented roster member)
    // Full transition history recorded via activities.
    const app1 = uuidv4()
    const app1Created = daysAgo(20)
    await knex('applications').insert({
      id: app1,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: 'accepted',
      accepted_at: daysAgo(5),
      created_at: app1Created,
      updated_at: daysAgo(5),
    })
    // Applied -> Shortlisted after 10 days
    await logStatusChange(app1, AGENCY_ID, 'submitted', 'shortlisted', daysAgo(10))
    // Accepted is the represented outcome; there is no separately evidenced
    // offer transition in this legacy fixture.
    await logStatusChange(app1, AGENCY_ID, 'shortlisted', 'accepted', daysAgo(5))

    // App 2: still sitting at submitted (Applied stage), no transitions
    const app2 = uuidv4()
    await knex('applications').insert({
      id: app2,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: 'submitted',
      created_at: daysAgo(3),
    })

    // App 3: shortlisted directly, older than the 30-day range so it's
    // excluded from the funnel window but still real data.
    const app3 = uuidv4()
    await knex('applications').insert({
      id: app3,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: 'shortlisted',
      created_at: daysAgo(120),
    })
  })

  test('funnel counts reflect real applications within the default 90-day window', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics'))
    expect(res.status).toBe(200)

    const { funnel } = res.body.analytics
    const byStage = Object.fromEntries(funnel.stages.map((s) => [s.stage, s.count]))
    // app1 is now "accepted" -> Represented; app2 is "submitted" -> Applied.
    // app3 (120 days old) falls outside the 90-day window.
    expect(byStage.Applied).toBe(1)
    expect(byStage.Offered).toBe(0)
    expect(byStage.Represented).toBe(1)
    expect(byStage.Shortlisted).toBe(0)
  })

  test('a range=365 request includes the older application in the funnel', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics?range=365'))
    expect(res.status).toBe(200)
    expect(res.body.analytics.range).toBe(365)

    const byStage = Object.fromEntries(
      res.body.analytics.funnel.stages.map((s) => [s.stage, s.count]),
    )
    expect(byStage.Shortlisted).toBe(1) // app3 now included
  })

  test('an invalid range value falls back to the default of 90', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics?range=7'))
    expect(res.status).toBe(200)
    expect(res.body.analytics.range).toBe(90)
  })

  test('velocity reflects real recorded transition durations for app1', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics'))
    const { velocity } = res.body.analytics

    const appliedToShortlisted = velocity.find(
      (v) => v.from === 'Applied' && v.to === 'Shortlisted',
    )
    expect(appliedToShortlisted.sampleSize).toBe(1)
    expect(appliedToShortlisted.medianDays).toBeCloseTo(10, 0)
    expect(appliedToShortlisted.averageDays).toBeCloseTo(10, 0)

    const shortlistedToOffered = velocity.find(
      (v) => v.from === 'Shortlisted' && v.to === 'Offered',
    )
    expect(shortlistedToOffered.sampleSize).toBe(0)
    expect(shortlistedToOffered.medianDays).toBeNull()

    // No represented transitions were ever logged — must be null, not fabricated.
    const offeredToRepresented = velocity.find(
      (v) => v.from === 'Offered' && v.to === 'Represented',
    )
    expect(offeredToRepresented.sampleSize).toBe(0)
    expect(offeredToRepresented.medianDays).toBeNull()
    expect(offeredToRepresented.averageDays).toBeNull()
  })

  test('rosterGrowth counts app1 (accepted, roster member) in its join month', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics'))
    const { rosterGrowth } = res.body.analytics
    expect(rosterGrowth).toHaveLength(12)
    // Cumulative — the most recent month must count app1 since it joined 5 days ago.
    const lastMonth = rosterGrowth[rosterGrowth.length - 1]
    expect(lastMonth.count).toBeGreaterThanOrEqual(1)
    // Non-decreasing (cumulative) series.
    for (let i = 1; i < rosterGrowth.length; i++) {
      expect(rosterGrowth[i].count).toBeGreaterThanOrEqual(rosterGrowth[i - 1].count)
    }
  })

  test('existing response fields are unchanged by the new additions', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/analytics'))
    const { byStatus, overTime, acceptanceRate } = res.body.analytics
    expect(byStatus.total).toBe(3)
    expect(byStatus.accepted).toBe(1)
    expect(typeof overTime.thisMonth).toBe('number')
    expect(typeof acceptanceRate).toBe('number')
  })
})
