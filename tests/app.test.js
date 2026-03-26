const request = require('supertest');
const sharp = require('sharp');
const knex = require('../src/shared/db/knex');
const app = require('../src/app');

beforeAll(async () => {
  // Clear any stale migration locks before starting
  try {
    await knex.raw('UPDATE knex_migrations_lock SET is_locked = 0 WHERE is_locked = 1');
  } catch (err) {
    // Lock table might not exist yet, that's okay
  }
  
  try {
    // Rollback all migrations first
    await knex.migrate.rollback({}, true);
  } catch (err) {
    // If rollback fails, clear lock and continue
    try {
      await knex.raw('UPDATE knex_migrations_lock SET is_locked = 0');
    } catch (unlockErr) {
      // Ignore
    }
  }
  
  // Run migrations
  await knex.migrate.latest();
  await knex.seed.run();
}, 30000); // 30 second timeout for migrations

afterAll(async () => {
  await knex.destroy();
});

describe('ZipSite application', () => {
  test('login redirects to the correct dashboard', async () => {
    const response = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'agency@example.com', password: 'password123' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/dashboard/agency');
  });

  test('apply flow creates a profile, upload works, and PDF is available', async () => {
    const agent = request.agent(app);
    const email = `talent-${Date.now()}@example.com`;

    const applyResponse = await agent.post('/apply').type('form').send({
      first_name: 'Nova',
      last_name: 'Lane',
      email,
      password: 'password123',
      city: 'Brooklyn, NY',
      height_cm: 176,
      measurements: '32-24-34',
      bio: 'Nova brings runway poise and creative thinking to every set.',
      partner_agency_email: 'agency@example.com'
    });

    expect(applyResponse.status).toBe(303);
    expect(applyResponse.headers.location).toContain('/dashboard/talent');

    const user = await knex('users').where({ email }).first();
    const profile = await knex('profiles').where({ user_id: user.id }).first();
    expect(profile).toBeTruthy();
    expect(profile.bio_curated).toMatch(/Nova/);

    const buffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .webp()
      .toBuffer();

    const uploadResponse = await agent
      .post('/upload')
      .field('label', 'Headshot')
      .attach('file', buffer, { filename: 'headshot.webp' });

    expect(uploadResponse.status).toBe(200);

    const images = await knex('images').where({ profile_id: profile.id });
    expect(images.length).toBeGreaterThan(0);

    const pdfResponse = await agent.get(`/pdf/${profile.slug}`);
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
  });

  test('agency can claim and upgrade creates commission', async () => {
    const talentAgent = request.agent(app);
    await talentAgent
      .post('/login')
      .type('form')
      .send({ email: 'talent@example.com', password: 'password123' })
      .expect(302);

    const talentUser = await knex('users').where({ email: 'talent@example.com' }).first();
    const profile = await knex('profiles').where({ user_id: talentUser.id }).first();

    const agencyAgent = request.agent(app);
    await agencyAgent
      .post('/login')
      .type('form')
      .send({ email: 'agency@example.com', password: 'password123' })
      .expect(302);

    await agencyAgent.post('/agency/claim').send({ slug: profile.slug }).expect(200);

    const upgradeResponse = await talentAgent.get('/pro/upgrade');
    expect(upgradeResponse.status).toBe(302);

    const refreshedProfile = await knex('profiles').where({ id: profile.id }).first();
    expect(refreshedProfile.is_pro).toBe(true);

    const commission = await knex('commissions').where({ profile_id: profile.id }).first();
    expect(commission).toBeTruthy();
    expect(commission.amount_cents).toBeGreaterThan(0);
  });
});
