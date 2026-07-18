// tests/agency-extras.test.js
'use strict'

process.env.DATABASE_URL = 'sqlite://./test-agency-extras.sqlite3'
process.env.DB_CLIENT = 'sqlite3'

const fs = require('fs')
const path = require('path')
const request = require('supertest')
const cookieSig = require('cookie-signature')
const { v4: uuidv4 } = require('uuid')

const knex = require('../src/shared/db/knex')
const app  = require('../src/app')

const SESSION_SECRET = require('../src/config').sessionSecret
const TEST_DB_PATH   = path.resolve(__dirname, '../test-agency-extras.sqlite3')

const AGENCY_ID  = uuidv4()
const TALENT_ID  = uuidv4()
const PROFILE_ID = uuidv4()
const APP_ID     = uuidv4()

async function createSchema() {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', t => {
      t.string('id', 36).primary()
      t.string('email').notNullable().unique()
      t.string('role').notNullable()
      t.string('account_status').notNullable().defaultTo('active')
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('sessions'))) {
    await knex.schema.createTable('sessions', t => {
      t.string('sid', 255).primary()
      t.json('sess').notNullable()
      t.timestamp('expired').notNullable()
    })
  }
  if (!(await knex.schema.hasTable('profiles'))) {
    await knex.schema.createTable('profiles', t => {
      t.string('id', 36).primary()
      t.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE')
      t.string('first_name', 100).nullable()
      t.string('last_name', 100).nullable()
      t.string('model_type', 50).nullable()
      t.string('gender', 20).nullable()
      t.integer('height').nullable()
      t.integer('bust').nullable()
      t.integer('waist').nullable()
      t.integer('hips').nullable()
      t.string('location_city', 100).nullable()
      t.string('location_country', 100).nullable()
    })
  }
  if (!(await knex.schema.hasTable('boards'))) {
    await knex.schema.createTable('boards', t => {
      t.string('id', 36).primary()
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('name', 200).notNullable()
      t.text('description').nullable()
      t.boolean('is_active').defaultTo(true)
      t.timestamp('closes_at').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('applications'))) {
    await knex.schema.createTable('applications', t => {
      t.string('id', 36).primary()
      t.string('profile_id', 36).references('id').inTable('profiles')
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('board_id', 36).nullable()
      t.string('status').notNullable().defaultTo('submitted')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('application_activities'))) {
    await knex.schema.createTable('application_activities', t => {
      t.string('id', 36).primary()
      t.string('application_id', 36).references('id').inTable('applications').onDelete('CASCADE')
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('activity_type', 100).notNullable()
      t.text('description').nullable()
      t.text('metadata').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('application_tags'))) {
    await knex.schema.createTable('application_tags', t => {
      t.string('id', 36).primary()
      t.string('application_id', 36).references('id').inTable('applications').onDelete('CASCADE')
      t.string('agency_id', 36).references('id').inTable('users')
      t.string('tag', 100).notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  if (!(await knex.schema.hasTable('board_applications'))) {
    await knex.schema.createTable('board_applications', t => {
      t.string('id', 36).primary()
      t.string('board_id', 36).references('id').inTable('boards').onDelete('CASCADE')
      t.string('application_id', 36).references('id').inTable('applications').onDelete('CASCADE')
      t.integer('match_score').nullable()
    })
  }
  if (!(await knex.schema.hasTable('images'))) {
    await knex.schema.createTable('images', t => {
      t.string('id', 36).primary()
      t.string('profile_id', 36).references('id').inTable('profiles').onDelete('CASCADE')
      t.text('file_path').notNullable()
      t.string('path').nullable()
      t.string('public_url').nullable()
      t.boolean('is_primary').defaultTo(false)
      t.integer('sort_order').defaultTo(0)
    })
  } else {
    // The activity feed selects COALESCE(img.public_url, img.path).
    for (const col of ['path', 'public_url']) {
      if (!(await knex.schema.hasColumn('images', col))) {
        await knex.schema.alterTable('images', t => { t.string(col).nullable() })
      }
    }
  }
  if (!(await knex.schema.hasTable('subscriptions'))) {
    await knex.schema.createTable('subscriptions', t => {
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

async function seedBase() {
  await knex('application_activities').delete()
  await knex('board_applications').delete()
  await knex('application_tags').delete()
  await knex('applications').delete()
  await knex('images').delete()
  await knex('profiles').delete()
  await knex('boards').delete()
  await knex('sessions').delete()
  await knex('users').delete()

  await knex('users').insert([
    { id: AGENCY_ID, email: 'agency@test.com', role: 'AGENCY' },
    { id: TALENT_ID, email: 'talent@test.com', role: 'TALENT' },
  ])
  await knex('profiles').insert({
    id: PROFILE_ID, user_id: TALENT_ID,
    first_name: 'Sofia', last_name: 'Reyes',
    model_type: 'editorial', gender: 'female',
    height: 178, bust: 86, waist: 61, hips: 89,
    location_city: 'Milan', location_country: 'Italy',
  })
  await knex('applications').insert({
    id: APP_ID, profile_id: PROFILE_ID, agency_id: AGENCY_ID,
    status: 'submitted', board_id: null,
  })
}

beforeAll(async () => { await createSchema(); await seedBase() }, 30000)
afterAll(async () => {
  await knex.destroy()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
})

async function agentWithSession(userId, role) {
  const sid = uuidv4()
  const sessionData = {
    cookie: { originalMaxAge: null, expires: null, secure: false, httpOnly: true, path: '/' },
    userId,
    role,
    ...(role === 'AGENCY' && {
      agencyOnboardingCompletedAt: new Date().toISOString()
    })
  }
  await knex('sessions').insert({
    sid,
    sess: JSON.stringify(sessionData),
    expired: new Date(Date.now() + 86400000).toISOString(),
  })
  const signed  = 's:' + cookieSig.sign(sid, SESSION_SECRET)
  const encoded = encodeURIComponent(signed)
  return req => req.set('Cookie', `connect.sid=${encoded}`)
}

// ─── Activity tests ──────────────────────────────────────────────────────────

describe('GET /api/agency/activity', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/agency/activity')
    expect(res.status).toBe(401)
  })

  test('returns 403 for TALENT role', async () => {
    const withCookie = await agentWithSession(TALENT_ID, 'TALENT')
    const res = await withCookie(request(app).get('/api/agency/activity'))
    expect(res.status).toBe(403)
  })

  test('returns empty data array when no activities', async () => {
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/activity'))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.pagination).toMatchObject({ limit: 50, offset: 0 })
  })

  test('returns activity with talentName and application_label', async () => {
    const actId = uuidv4()
    await knex('application_activities').insert({
      id: actId, application_id: APP_ID, agency_id: AGENCY_ID,
      activity_type: 'status_change',
      description: 'Status changed to Shortlisted',
      metadata: JSON.stringify({ new_status: 'shortlisted' }),
    })
    const withCookie = await agentWithSession(AGENCY_ID, 'AGENCY')
    const res = await withCookie(request(app).get('/api/agency/activity'))
    expect(res.status).toBe(200)
    const item = res.body.data[0]
    expect(item.talentName).toBe('Sofia Reyes')
    expect(item.application_label).toBe('General Application')
    expect(item.activity_type).toBe('status_change')
    expect(item.metadata).toEqual({ new_status: 'shortlisted' })
    await knex('application_activities').where('id', actId).delete()
  })
})
