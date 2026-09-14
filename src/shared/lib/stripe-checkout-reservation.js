"use strict";
const { randomUUID } = require('crypto');
const MANAGEABLE = ['trialing', 'active', 'past_due', 'unpaid'];
const checkoutError = (message, code = 'checkout_pending') => Object.assign(new Error(message), { status: 409, code });

async function reserve(db, userId, interval) {
  return db.transaction(async trx => {
    await trx('users').where({ id: userId }).update({ stripe_customer_id: trx.raw('stripe_customer_id') });
    const user = await trx('users').where({ id: userId }).first();
    if (await trx('subscriptions').where({ user_id: userId }).whereIn('status', MANAGEABLE).first()) {
      throw checkoutError('You already have a Studio+ subscription. Manage billing from the portal.', 'subscription_exists');
    }
    const existing = await trx('stripe_checkout_reservations').where({ user_id: userId }).first();
    if (existing) return existing;
    const trialUsed = await trx('subscriptions').where({ user_id: userId }).whereNotNull('trial_start').first();
    const now = new Date();
    const expiresAt = Math.floor(now.getTime() / 1000) + 3600;
    const row = { user_id: userId, attempt_id: randomUUID(),
      request: JSON.stringify({ userId, email: user.email, customerId: user.stripe_customer_id,
        interval, trialEligible: !trialUsed, expiresAt }),
      created_at: now.toISOString(), expires_at: new Date(expiresAt * 1000).toISOString() };
    await trx('stripe_checkout_reservations').insert(row);
    return row;
  });
}

async function getOrCreateReservedCheckout(db, userId, interval, provider) {
  const row = await reserve(db, userId, interval);
  const request = JSON.parse(row.request);
  if (row.session_id) {
    const session = await provider.stripe.checkout.sessions.retrieve(row.session_id);
    if (session.status === 'open') return session;
    if (session.status === 'expired') {
      await db('stripe_checkout_reservations').where({ user_id: userId, attempt_id: row.attempt_id }).delete();
      // A fresh reservation is safe only after provider-confirmed expiration.
      return getOrCreateReservedCheckout(db, userId, interval, provider);
    }
    if (session.status === 'complete' && session.subscription) {
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const stored = await db('subscriptions').where({ user_id: userId, stripe_subscription_id: subscriptionId }).first();
      // A canceled subscription cannot resume; allow a new checkout only
      // after both local processing and the provider confirm its termination.
      if (stored?.status === 'canceled') {
        const current = await provider.getSubscription(subscriptionId);
        if (current.status === 'canceled') {
          await db('stripe_checkout_reservations').where({ user_id: userId, attempt_id: row.attempt_id }).delete();
          return getOrCreateReservedCheckout(db, userId, interval, provider);
        }
      }
    }
    throw checkoutError('Your checkout is complete. Billing is still updating; please try again shortly.');
  }
  // Stripe can discard idempotency keys after 24h. Never reuse an ambiguous
  // old attempt to create another chargeable object; operator reconciliation
  // must establish its outcome before clearing it.
  const createdAt = /^\d+$/.test(String(row.created_at)) ? Number(row.created_at) : new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt >= 23 * 3600 * 1000) {
    throw checkoutError('Checkout needs billing support before it can be retried.', 'checkout_reconciliation_required');
  }
  let customerId = request.customerId;
  if (!customerId) {
    const customer = await provider.getOrCreateCustomer(userId, request.email, null,
      { idempotencyKey: `pholio-customer-${row.attempt_id}` });
    customerId = customer.id;
    await db('users').where({ id: userId }).where(q => q.whereNull('stripe_customer_id').orWhere('stripe_customer_id', customerId))
      .update({ stripe_customer_id: customerId });
  }
  const session = await provider.createCheckoutSession(customerId, userId, request.email, request.interval,
    { trialEligible: request.trialEligible, expiresAt: request.expiresAt,
      idempotencyKey: `pholio-checkout-${row.attempt_id}` });
  await db('stripe_checkout_reservations').where({ user_id: userId, attempt_id: row.attempt_id })
    .update({ session_id: session.id, session_url: session.url,
      expires_at: new Date((session.expires_at || request.expiresAt) * 1000).toISOString() });
  return session;
}

module.exports = { getOrCreateReservedCheckout };
