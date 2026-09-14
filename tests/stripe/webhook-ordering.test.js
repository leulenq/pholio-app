"use strict";
const { useIsolatedDatabase, migrate, dropIsolatedDatabase } = require('../setup/isolated-db');
const file = useIsolatedDatabase('stripe-webhook-ordering');
const db = require('../../src/shared/db/knex');
const { randomUUID } = require('crypto');
const { claimEvent, applyEvent, failEvent, replayPendingEvents } = require('../../src/shared/lib/stripe-events');
const { upsertSubscriptionFromStripe, updateSubscription, getSubscriptionStatus } = require('../../src/shared/lib/subscriptions');
const userId = randomUUID();
const customer = 'cus_ordering';
const sub = (status = 'active', id = 'sub_ordering') => ({ object: 'subscription', id, customer, status,
  metadata: { userId }, items: { data: [{ price: { id: 'price_test' } }] } });
const event = (created, status = 'active', id = randomUUID()) => ({ id, created,
  type: status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
  data: { object: sub(status) } });
async function process(e) {
  const claim = await claimEvent(db, e);
  if (!claim.process) throw new Error(claim.reason);
  return applyEvent(db, e, claim, trx => upsertSubscriptionFromStripe(e.data.object, { db: trx }));
}
beforeAll(async () => {
  await migrate(db);
  await db('users').insert({ id: userId, email: `${userId}@example.com`, role: 'TALENT', stripe_customer_id: customer });
  await db('profiles').insert({ id: randomUUID(), user_id: userId, slug: userId, first_name: 'Test', last_name: 'Talent',
    city: 'New York', height_cm: 170, bio_raw: '', bio_curated: '' });
}, 60000);
beforeEach(async () => {
  await db('stripe_webhook_events').delete();
  await db('stripe_processing_locks').delete();
  await db('subscriptions').delete();
  await db('profiles').where({ user_id: userId }).update({ is_pro: false });
});
afterAll(async () => { await db.destroy(); dropIsolatedDatabase(file); });

test('a claimed event remains busy until its effects commit, then is a duplicate', async () => {
  const e = event(100);
  const claim = await claimEvent(db, e);
  expect((await claimEvent(db, e)).reason).toBe('busy');
  expect((await db('stripe_webhook_events').first()).outcome).toBe('processing');
  await applyEvent(db, e, claim, trx => upsertSubscriptionFromStripe(sub(), { db: trx }));
  expect((await claimEvent(db, e)).reason).toBe('duplicate');
});

test('failed local effect rolls back subscription, entitlement and ordering, then retries', async () => {
  const e = event(100);
  const claim = await claimEvent(db, e);
  const failure = new Error('after local write');
  await expect(applyEvent(db, e, claim, async trx => {
    await upsertSubscriptionFromStripe(sub(), { db: trx });
    throw failure;
  })).rejects.toThrow('after local write');
  expect(await db('subscriptions')).toHaveLength(0);
  expect(Boolean((await db('profiles').first()).is_pro)).toBe(false);
  await failEvent(db, e, claim, failure);
  await process(e);
  expect((await db('subscriptions').first()).status).toBe('active');
});

test.each([[100, 200], [200, 100], [200, 200]])('active/cancel completion order %i/%i cannot restore access', async (first, second) => {
  if (first <= second) { await process(event(first)); await process(event(second, 'canceled')); }
  else { await process(event(first, 'canceled')); await process(event(second)); }
  // Equal-second delayed active snapshots cannot undo terminal cancellation.
  await process(event(Math.max(first, second)));
  expect((await db('subscriptions').first()).status).toBe('canceled');
  expect(Boolean((await db('profiles').first()).is_pro)).toBe(false);
});

test('overlapping customer events cannot both obtain a lease; the loser is durable and retryable', async () => {
  const old = event(100), newer = event(200, 'canceled');
  const claims = await Promise.all([claimEvent(db, old), claimEvent(db, newer)]);
  expect(claims.filter(c => c.process)).toHaveLength(1);
  expect(await db('stripe_webhook_events')).toHaveLength(2);
  const winner = claims[0].process ? 0 : 1;
  const events = [old, newer];
  await applyEvent(db, events[winner], claims[winner], trx => upsertSubscriptionFromStripe(events[winner].data.object, { db: trx }));
  await process(events[1 - winner]);
  expect((await db('subscriptions').first()).status).toBe('canceled');
});

test('expired claims recover after process death and fence the old worker', async () => {
  const e = event(100);
  const oldClaim = await claimEvent(db, e, { now: new Date(Date.now() - 600000) });
  const newClaim = await claimEvent(db, e);
  await expect(applyEvent(db, e, oldClaim, async () => {})).rejects.toThrow('lease');
  await applyEvent(db, e, newClaim, trx => upsertSubscriptionFromStripe(sub(), { db: trx }));
  expect((await db('stripe_webhook_events').first()).attempts).toBe(2);
});

test('recovery consumer replays abandoned durable payloads', async () => {
  await claimEvent(db, event(100), { now: new Date(Date.now() - 600000) });
  expect(await replayPendingEvents(db, process)).toEqual([expect.objectContaining({ recovered: true })]);
});

test('durable event payload excludes unnecessary provider personal data', async () => {
  const e = event(100);
  Object.assign(e.data.object, { customer_email: 'private@example.com', verified_outputs: { dob: 'private' },
    billing_details: { address: 'private address' } });
  await claimEvent(db, e);
  const stored = (await db('stripe_webhook_events').first()).payload;
  expect(stored).not.toContain('private');
  expect(JSON.parse(stored).data.object.metadata.userId).toBe(userId);
});

test('ledger failure rejects processing instead of bypassing integrity guards', async () => {
  const broken = { transaction: async () => { throw new Error('database unavailable'); } };
  await expect(claimEvent(broken, event(100))).rejects.toThrow('database unavailable');
});

test('distinct paid subscriptions survive ingestion and cancellation aggregates access', async () => {
  await upsertSubscriptionFromStripe(sub('active', 'sub_first'));
  await upsertSubscriptionFromStripe(sub('active', 'sub_second'));
  expect(await db('subscriptions')).toHaveLength(2);
  await updateSubscription('sub_second', { status: 'canceled' });
  expect(Boolean((await db('profiles').first()).is_pro)).toBe(true);
  expect((await getSubscriptionStatus(userId)).stripe_subscription_id).toBe('sub_first');
  await updateSubscription('sub_first', { status: 'canceled' });
  expect(Boolean((await db('profiles').first()).is_pro)).toBe(false);
});
