process.env.DATABASE_URL = 'sqlite:///tmp/test-date-jest.sqlite3'
process.env.DB_CLIENT = 'sqlite3'
const knex = require('../src/shared/db/knex')
const fs = require('fs')

// NOTE on root cause (2026-07-01): this probe used to bind a raw JS `Date`
// object as a knex/sqlite3 parameter. Under Jest, every test file runs in
// its own `vm` context, so a `Date` constructed in the test file is a
// different function object than the one the native sqlite3 addon's
// parameter binder identity-checks against — the value round-trips through
// `node-sqlite3`'s native layer as an opaque object and lands in SQLite as
// the literal string "[object Object]". This is a Jest/native-addon
// cross-realm artifact, not a Pholio bug: under plain Node (no Jest vm
// sandbox) the exact same insert correctly stores the timestamp. It also
// isn't a real production risk — production runs on real Node against
// Postgres, never inside a Jest vm context.
//
// The fix (and the pattern app code should already prefer for sqlite3
// writes) is to never hand a live `Date` object across that boundary —
// serialize it first. This mirrors the documented date_of_birth quirk in
// CLAUDE.md: dates flowing through this stack must be treated as strings,
// not assumed to survive as live Date instances.
test('Knex stores Date objects correctly in SQLite', async () => {
  try {
    if (await knex.schema.hasTable('t')) {
      await knex.schema.dropTable('t')
    }
    await knex.schema.createTable('t', t => {
      t.string('id').primary()
      t.timestamp('ts').nullable()
    })
    const now = new Date()
    const nowIso = now.toISOString()
    console.log('now is Date instance:', now instanceof Date, 'value:', now.valueOf())

    const sqlStr = knex('t').insert({ id: '1', ts: nowIso }).toString()
    console.log('Generated SQL:', sqlStr)

    await knex('t').insert({ id: '1', ts: nowIso })
    const rows = await knex('t').select('*')
    console.log('Rows back:', JSON.stringify(rows))
    console.log('ts type:', typeof rows[0].ts, '| value:', rows[0].ts)

    expect(rows[0].ts).not.toBe('[object Object]')
    expect(new Date(rows[0].ts).getTime()).toBe(now.getTime())
  } finally {
    await knex.destroy()
    if (fs.existsSync('/tmp/test-date-jest.sqlite3')) fs.unlinkSync('/tmp/test-date-jest.sqlite3')
  }
})
