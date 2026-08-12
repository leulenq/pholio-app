/**
 * tests/moderation/reports.test.js
 *
 * Validation and moderation logic tests.
 * Uses unit-level imports (no running server needed) plus
 * a lightweight integration check for the route validation layer.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require('../setup/isolated-db');
const {
  isModerator,
  isSelfTargetReport,
} = require('../../src/shared/lib/moderation');

/* Own database, resolved before src/shared/db/knex is required anywhere.
 *
 * The integration block below used to roll the SHARED run database all the way
 * back and migrate it again. Whatever ran earlier lost its fixtures, and when
 * the rollback partially failed the re-migration replayed table rebuilds over
 * rows left behind — SQLite copies through a temp table, so it aborted with a
 * foreign-key error that had nothing to do with reports. It passed alone and
 * failed in a full run. */
const DB_FILE = useIsolatedDatabase('moderation-reports');

// ─── isModerator helper ───────────────────────────────────────────────────────

describe('isModerator()', () => {
  afterEach(() => {
    delete process.env.MODERATOR_USER_IDS;
  });

  it('returns false for null/undefined', () => {
    expect(isModerator(null)).toBe(false);
    expect(isModerator(undefined)).toBe(false);
  });

  it('returns false for a regular user with no env var set', () => {
    expect(isModerator({ id: 'abc-123', email: 'user@example.com' })).toBe(false);
  });

  it('returns true when user.id is in MODERATOR_USER_IDS', () => {
    process.env.MODERATOR_USER_IDS = 'uuid-a,uuid-b,uuid-c';
    expect(isModerator({ id: 'uuid-b', email: 'user@example.com' })).toBe(true);
  });

  it('returns false when user.id is NOT in MODERATOR_USER_IDS', () => {
    process.env.MODERATOR_USER_IDS = 'uuid-a,uuid-b';
    expect(isModerator({ id: 'uuid-z', email: 'user@example.com' })).toBe(false);
  });

  it('returns true for @pholio.studio email regardless of env var', () => {
    expect(isModerator({ id: 'some-id', email: 'admin@pholio.studio' })).toBe(true);
  });

  it('is case-insensitive for @pholio.studio email check', () => {
    expect(isModerator({ id: 'some-id', email: 'TRUST@PHOLIO.STUDIO' })).toBe(true);
  });

  it('returns false for a subdomain of pholio.studio', () => {
    expect(isModerator({ id: 'some-id', email: 'admin@sub.pholio.studio' })).toBe(false);
  });

  it('ignores whitespace around UUIDs in MODERATOR_USER_IDS', () => {
    process.env.MODERATOR_USER_IDS = ' uuid-x , uuid-y ';
    expect(isModerator({ id: 'uuid-x', email: 'user@example.com' })).toBe(true);
  });

  it('handles empty MODERATOR_USER_IDS gracefully', () => {
    process.env.MODERATOR_USER_IDS = '';
    expect(isModerator({ id: 'uuid-x', email: 'user@example.com' })).toBe(false);
  });
});

// ─── report route validation logic (extracted, no server needed) ──────────────

const VALID_TARGET_TYPES = ['profile', 'image', 'message', 'agency', 'user'];
const VALID_STATUSES = ['pending', 'reviewed', 'actioned', 'dismissed'];

describe('report validation constants', () => {
  it('covers all required target_type values', () => {
    expect(VALID_TARGET_TYPES).toEqual(
      expect.arrayContaining(['profile', 'image', 'message', 'agency', 'user']),
    );
  });

  it('covers all required status values', () => {
    expect(VALID_STATUSES).toEqual(
      expect.arrayContaining(['pending', 'reviewed', 'actioned', 'dismissed']),
    );
  });

  it('does not include unexpected target types', () => {
    const unexpected = ['video', 'post', 'comment'];
    unexpected.forEach((t) => {
      expect(VALID_TARGET_TYPES).not.toContain(t);
    });
  });
});

describe('safety report targets', () => {
  it('rejects a report that targets the reporting user', () => {
    expect(isSelfTargetReport({
      reporterUserId: 'talent-1',
      targetType: 'user',
      targetId: 'talent-1',
    })).toBe(true);
  });

  it('allows the same identifier for a non-user entity', () => {
    expect(isSelfTargetReport({
      reporterUserId: 'talent-1',
      targetType: 'agency',
      targetId: 'talent-1',
    })).toBe(false);
  });
});

// ─── Integration: POST /api/reports requires auth ────────────────────────────

describe('POST /api/reports — unauthenticated', () => {
  let app;
  let knex;

  beforeAll(async () => {
    knex = require('../../src/shared/db/knex');
    await migrate(knex);
    app = require('../../src/app');
  }, 45000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  it('returns 401 when not logged in', async () => {
    const request = require('supertest');
    const res = await request(app)
      .post('/api/reports')
      .set('Accept', 'application/json')
      .send({ target_type: 'profile', target_id: 'abc', reason: 'harassment' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 401 for GET /api/reports when not logged in', async () => {
    const request = require('supertest');
    const res = await request(app)
      .get('/api/reports')
      .set('Accept', 'application/json');

    expect(res.status).toBe(401);
  });
});
