"use strict";
const { useIsolatedDatabase, migrate, dropIsolatedDatabase } = require('../setup/isolated-db');
const file = useIsolatedDatabase('stripe-checkout-reservation');
const db = require('../../src/shared/db/knex');
const { randomUUID } = require('crypto');
const { getOrCreateReservedCheckout } = require('../../src/shared/lib/stripe-checkout-reservation');
const { upsertSubscriptionFromStripe } = require('../../src/shared/lib/subscriptions');
const userId = randomUUID();
let provider, sessions, attempts;
beforeAll(async () => {
  await migrate(db);
  await db('users').insert({ id: userId, email: `${userId}@example.com`, role: 'TALENT' });
}, 60000);
beforeEach(async () => {
  await db('stripe_checkout_reservations').delete();
  await db('subscriptions').delete();
  await db('users').where({ id: userId }).update({ stripe_customer_id: null });
  sessions = new Map(); attempts = new Map();
  provider = {
    getOrCreateCustomer: jest.fn(async () => ({ id: 'cus_reserved' })),
    getSubscription: jest.fn(),
    createCheckoutSession: jest.fn(async (...args) => {
      const options = args[4];
      if (!attempts.has(options.idempotencyKey)) {
        const session = { id: `cs_${attempts.size}`, url: 'https://checkout.example.test/session',
          status: 'open', expires_at: options.expiresAt };
        attempts.set(options.idempotencyKey, session); sessions.set(session.id, session);
      }
      return attempts.get(options.idempotencyKey);
    }),
    stripe: { checkout: { sessions: { retrieve: jest.fn(async id => sessions.get(id)) } } },
  };
});
afterAll(async () => { await db.destroy(); dropIsolatedDatabase(file); });
const checkout = interval => getOrCreateReservedCheckout(db, userId, interval || 'monthly', provider);

test('concurrent tabs and changed intervals share one immutable checkout attempt', async () => {
  const results = await Promise.all([checkout('monthly'), checkout('annual')]);
  expect(results[0].id).toBe(results[1].id);
  expect(attempts.size).toBe(1);
  const row = await db('stripe_checkout_reservations').first();
  const saved = JSON.parse(row.request);
  for (const call of provider.createCheckoutSession.mock.calls) {
    expect(call[3]).toBe(saved.interval);
    expect(call[4].idempotencyKey).toBe(`pholio-checkout-${row.attempt_id}`);
  }
  const customerKeys = provider.getOrCreateCustomer.mock.calls.map(call => call[3].idempotencyKey);
  expect(new Set(customerKeys).size).toBe(1);
});

test('provider success followed by connection loss retries the same idempotency key', async () => {
  const create = provider.createCheckoutSession.getMockImplementation();
  provider.createCheckoutSession.mockImplementationOnce(async (...args) => {
    await create(...args); throw new Error('connection lost after provider accepted');
  });
  await expect(checkout()).rejects.toThrow('connection lost');
  expect((await db('stripe_checkout_reservations').first()).session_id).toBeNull();
  await checkout();
  expect(attempts.size).toBe(1);
});

test('ambiguous attempts older than the provider key retention window require reconciliation', async () => {
  provider.createCheckoutSession.mockRejectedValueOnce(new Error('timeout'));
  await expect(checkout()).rejects.toThrow('timeout');
  await db('stripe_checkout_reservations').update({ created_at: new Date(Date.now() - 86400000).toISOString() });
  await expect(checkout()).rejects.toMatchObject({ code: 'checkout_reconciliation_required' });
  expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
});

test('completed checkout blocks duplicate billing until cancellation is confirmed, then permits resubscribe', async () => {
  const initial = await checkout();
  Object.assign(sessions.get(initial.id), { status: 'complete', subscription: 'sub_reserved' });
  await expect(checkout()).rejects.toMatchObject({ code: 'checkout_pending' });
  const subscription = { id: 'sub_reserved', customer: 'cus_reserved', status: 'active',
    metadata: { userId }, trial_start: 100, items: { data: [{ price: { id: 'price_test' } }] } };
  await upsertSubscriptionFromStripe(subscription);
  await expect(checkout()).rejects.toMatchObject({ code: 'subscription_exists' });
  await upsertSubscriptionFromStripe({ ...subscription, status: 'canceled' });
  provider.getSubscription.mockResolvedValue({ ...subscription, status: 'canceled' });
  const next = await checkout();
  expect(next.id).not.toBe(initial.id);
  expect(provider.createCheckoutSession.mock.calls.at(-1)[4].trialEligible).toBe(false);
});

test('provider-confirmed expiry permits a fresh reservation', async () => {
  const initial = await checkout();
  sessions.get(initial.id).status = 'expired';
  expect((await checkout()).id).not.toBe(initial.id);
});
