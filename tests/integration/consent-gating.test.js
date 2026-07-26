process.env.NODE_ENV = 'test';
const request = require('supertest');
const knex = require('../../src/shared/db/knex');
const app = require('../../src/app');
const { serializeConsent, CONSENT_COOKIE } = require('../../src/shared/lib/consent');

jest.setTimeout(60000);

let profileId;

beforeAll(async () => {
  await knex.migrate.latest();
  const { v4: uuid } = require('uuid');
  const userId = uuid();
  profileId = uuid();
  await knex('users').insert({
    id: userId,
    email: `consent-${userId}@example.com`,
    password_hash: 'x',
    role: 'TALENT',
    created_at: knex.fn.now(),
  });
  await knex('profiles').insert({
    id: profileId,
    user_id: userId,
    slug: `consent-${userId.slice(0, 8)}`,
    first_name: 'Con',
    last_name: 'Sent',
    city: 'New York',
    phone: '0000000000',
    height_cm: 180,
    date_of_birth: '1995-10-10',
    bio_raw: '',
    bio_curated: '',
    is_public: true,
    onboarding_completed_at: knex.fn.now(),
  });
});

afterAll(async () => { await knex.destroy(); });

async function slug() {
  return (await knex('profiles').where({ id: profileId }).first()).slug;
}

describe('portfolio visitor tracking honours the shared consent cookie', () => {
  test('no consent cookie -> no identifier, no visitor_sessions row', async () => {
    const before = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();
    const res = await request(app).get(`/portfolio/${await slug()}`);
    const after = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();

    const setCookies = (res.headers['set-cookie'] || []).join(';');
    expect(setCookies).not.toContain('pholio_visitor_id');
    expect(Number(after.c)).toBe(Number(before.c));
  });

  test('analytics declined -> still no identifier, no row', async () => {
    const before = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();
    const res = await request(app)
      .get(`/portfolio/${await slug()}`)
      .set('Cookie', `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent({ analytics: false }))}`);
    const after = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();

    expect((res.headers['set-cookie'] || []).join(';')).not.toContain('pholio_visitor_id');
    expect(Number(after.c)).toBe(Number(before.c));
  });

  test('analytics granted -> identifier set and row written', async () => {
    const before = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();
    const res = await request(app)
      .get(`/portfolio/${await slug()}`)
      .set('Cookie', `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent({ analytics: true }))}`);
    const after = await knex('visitor_sessions').where({ profile_id: profileId }).count({ c: '*' }).first();

    expect((res.headers['set-cookie'] || []).join(';')).toContain('pholio_visitor_id');
    expect(Number(after.c)).toBe(Number(before.c) + 1);
  });
});

describe('session endpoints', () => {
  test('/api/public/session is not cacheable by a shared proxy', async () => {
    const res = await request(app).get('/api/public/session');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['vary']).toContain('Cookie');
  });
});
