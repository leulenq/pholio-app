process.env.DATABASE_URL = 'sqlite:///tmp/test-date-jest.sqlite3'
process.env.DB_CLIENT = 'sqlite3'
const knex = require('../src/shared/db/knex')
const fs = require('fs')

test('Knex stores Date objects correctly in SQLite', async () => {
  await knex.schema.createTable('t', t => {
    t.string('id').primary()
    t.timestamp('ts').nullable()
  })
  const now = new Date()
  console.log('now is Date instance:', now instanceof Date, 'value:', now.valueOf())
  
  const sqlStr = knex('t').insert({ id: '1', ts: now }).toString()
  console.log('Generated SQL:', sqlStr)
  
  await knex('t').insert({ id: '1', ts: now })
  const rows = await knex('t').select('*')
  console.log('Rows back:', JSON.stringify(rows))
  console.log('ts type:', typeof rows[0].ts, '| value:', rows[0].ts)
  
  expect(rows[0].ts).not.toBe('[object Object]')
  await knex.destroy()
  if (fs.existsSync('/tmp/test-date-jest.sqlite3')) fs.unlinkSync('/tmp/test-date-jest.sqlite3')
})
