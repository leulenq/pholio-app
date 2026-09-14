const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');

/**
 * Subscription statuses that grant Pro access
 */
const ACTIVE_STATUSES = ['trialing', 'active'];
const STORED_STATUSES = new Set([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

function normalizeStatus(status) {
  const value = String(status || '').trim();
  return STORED_STATUSES.has(value) ? value : 'unpaid';
}

function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function normalizeSubscriptionFields(updates = {}) {
  const out = {};

  const stripeSubscriptionId = firstDefined(
    updates.stripe_subscription_id,
    updates.stripeSubscriptionId,
  );
  if (stripeSubscriptionId !== undefined) {
    out.stripe_subscription_id = stripeSubscriptionId || null;
  }

  const stripeCustomerId = firstDefined(
    updates.stripe_customer_id,
    updates.stripeCustomerId,
  );
  if (stripeCustomerId !== undefined) {
    out.stripe_customer_id = stripeCustomerId;
  }

  const stripePriceId = firstDefined(
    updates.stripe_price_id,
    updates.stripePriceId,
  );
  if (stripePriceId !== undefined) {
    out.stripe_price_id = stripePriceId;
  }

  const status = updates.status;
  if (status !== undefined) out.status = normalizeStatus(status);

  const trialStart = firstDefined(updates.trial_start, updates.trialStart);
  if (trialStart !== undefined) out.trial_start = timestampToDate(trialStart);

  const trialEnd = firstDefined(updates.trial_end, updates.trialEnd);
  if (trialEnd !== undefined) out.trial_end = timestampToDate(trialEnd);

  const currentPeriodStart = firstDefined(
    updates.current_period_start,
    updates.currentPeriodStart,
  );
  if (currentPeriodStart !== undefined) {
    out.current_period_start = timestampToDate(currentPeriodStart);
  }

  const currentPeriodEnd = firstDefined(
    updates.current_period_end,
    updates.currentPeriodEnd,
  );
  if (currentPeriodEnd !== undefined) {
    out.current_period_end = timestampToDate(currentPeriodEnd);
  }

  const cancelAtPeriodEnd = firstDefined(
    updates.cancel_at_period_end,
    updates.cancelAtPeriodEnd,
  );
  if (cancelAtPeriodEnd !== undefined) {
    out.cancel_at_period_end = !!cancelAtPeriodEnd;
  }

  const canceledAt = firstDefined(updates.canceled_at, updates.canceledAt);
  if (canceledAt !== undefined) out.canceled_at = timestampToDate(canceledAt);

  return out;
}

function priceIdFromStripeSubscription(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || null;
}

function stripeSubscriptionToFields(subscription) {
  return normalizeSubscriptionFields({
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripePriceId: priceIdFromStripeSubscription(subscription),
    status: subscription.status,
    trialStart: subscription.trial_start,
    trialEnd: subscription.trial_end,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at,
  });
}

/**
 * Get subscription status for a user
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<Object|null>} Subscription object or null
 */
async function getSubscriptionStatus(userId, db = knex) {
  const subscription = await db('subscriptions')
    .where({ user_id: userId })
    .orderByRaw("CASE WHEN status IN ('active', 'trialing') THEN 0 WHEN status IN ('past_due', 'unpaid') THEN 1 ELSE 2 END")
    .orderBy('created_at', 'desc')
    .first();

  return subscription || null;
}

/**
 * Check if subscription grants Pro access
 * @param {string} status - Subscription status
 * @returns {boolean} True if status grants Pro access
 */
function isSubscriptionActive(status) {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Sync is_pro flag on profile based on subscription status
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<boolean>} True if user has Pro access
 */
async function syncProfileIsPro(userId, db = knex) {
  const subscription = await db('subscriptions').where({ user_id: userId }).whereIn('status', ACTIVE_STATUSES).first('id');
  const hasProAccess = Boolean(subscription);

  // Update profile is_pro flag
  await db('profiles')
    .where({ user_id: userId })
    .update({
      is_pro: hasProAccess,
      updated_at: db.fn.now()
    });

  return hasProAccess;
}

/**
 * Get trial days remaining
 * @param {Object} subscription - Subscription object
 * @returns {number|null} Days remaining or null if no trial
 */
function getTrialDaysRemaining(subscription) {
  if (!subscription || !subscription.trial_end || subscription.status !== 'trialing') {
    return null;
  }

  const now = new Date();
  const trialEnd = new Date(subscription.trial_end);
  const diffTime = trialEnd - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Check if subscription is in trial
 * @param {Object} subscription - Subscription object
 * @returns {boolean} True if subscription is in trial
 */
function isInTrial(subscription) {
  if (!subscription) return false;
  return subscription.status === 'trialing' && subscription.trial_end && new Date(subscription.trial_end) > new Date();
}

/**
 * Check if subscription is canceling (cancel_at_period_end is true)
 * @param {Object} subscription - Subscription object
 * @returns {boolean} True if subscription is canceling
 */
function isCanceling(subscription) {
  if (!subscription) return false;
  return subscription.cancel_at_period_end === true && subscription.status === 'active';
}

/**
 * Create subscription record in database
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<Object>} Created subscription
 */
async function createSubscription(subscriptionData, db = null) {
  if (!db) return knex.transaction(trx => createSubscription(subscriptionData, trx));
  await lockUser(db, subscriptionData.userId);
  const subscription = {
    id: uuidv4(),
    user_id: subscriptionData.userId,
    ...normalizeSubscriptionFields(subscriptionData),
    created_at: db.fn.now(),
    updated_at: db.fn.now()
  };

  await db('subscriptions').insert(subscription);

  // Sync is_pro flag
  await syncProfileIsPro(subscriptionData.userId, db);

  return subscription;
}

/**
 * Update subscription record in database
 * @param {string} subscriptionId - Subscription ID (UUID) or Stripe subscription ID
 * @param {Object} updates - Subscription updates
 * @returns {Promise<Object>} Updated subscription
 */
async function updateSubscription(subscriptionId, updates, db = null) {
  if (!db) return knex.transaction(trx => updateSubscription(subscriptionId, updates, trx));
  const id = String(subscriptionId || '');
  const whereClause = id.startsWith('sub_')
    ? { stripe_subscription_id: id }
    : { id };

  const existing = await db('subscriptions').where(whereClause).first();
  if (!existing) return null;
  await lockUser(db, existing.user_id);
  const updateData = {
    ...normalizeSubscriptionFields(updates),
    updated_at: db.fn.now()
  };
  const current = await db('subscriptions').where(whereClause).first();
  if (current.status === 'canceled') updateData.status = 'canceled';

  await db('subscriptions')
    .where(whereClause)
    .update(updateData);

  const subscription = await db('subscriptions')
    .where(whereClause)
    .first();

  if (subscription) {
    // Sync is_pro flag
    await syncProfileIsPro(subscription.user_id, db);
  }

  return subscription;
}

async function updateSubscriptionByUserId(userId, updates) {
  // A user can own several provider subscriptions. Never overwrite all IDs.
  const subscription = await getSubscriptionStatus(userId);
  return subscription ? updateSubscription(subscription.id, updates) : null;
}

async function lockUser(db, userId) {
  // A harmless write acquires a row lock on PostgreSQL and the writer lock on
  // SQLite. Every local subscription mutation shares this entitlement lock.
  await db('users').where({ id: userId }).update({ stripe_customer_id: db.raw('stripe_customer_id') });
}

async function upsertSubscriptionFromStripe(stripeSubscription, options = {}) {
  if (!stripeSubscription || !stripeSubscription.id || !stripeSubscription.customer) {
    throw new Error('Stripe subscription payload is missing required identifiers');
  }

  if (!options.db) return knex.transaction(db => upsertSubscriptionFromStripe(stripeSubscription, { ...options, db }));
  const db = options.db;
  const customerId = typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : stripeSubscription.customer.id;
  let userId = options.userId || stripeSubscription.metadata?.userId || null;
  let user = null;

  if (userId) {
    await lockUser(db, userId);
    user = await db('users').where({ id: userId }).first();
  }

  if (!user) {
    user = await db('users')
      .where({ stripe_customer_id: customerId })
      .first();
    userId = user?.id || null;
    if (userId) await lockUser(db, userId);
  }

  if (!user || user.role !== 'TALENT') {
    console.warn('[Subscriptions] Ignoring Stripe subscription for non-talent or unknown customer', {
      stripeCustomerId: stripeSubscription.customer,
      stripeSubscriptionId: stripeSubscription.id,
    });
    return null;
  }

  if (user.stripe_customer_id && user.stripe_customer_id !== customerId) {
    throw new Error('Stripe customer does not match subscription owner');
  }
  if (user.stripe_customer_id !== customerId) {
    await db('users')
      .where({ id: user.id })
      .update({ stripe_customer_id: customerId });
  }

  const fields = stripeSubscriptionToFields(stripeSubscription);
  const existing = await db('subscriptions')
    .where({ stripe_subscription_id: stripeSubscription.id })
    .orderBy('created_at', 'desc')
    .first();

  if (existing) {
    if (existing.user_id !== user.id) throw new Error('Stripe subscription owner cannot change');
    // Cancellation is terminal for a Stripe subscription ID, including events
    // sharing a timestamp and delayed checkout-return/provider snapshots.
    if (existing.status === 'canceled') fields.status = 'canceled';
    await db('subscriptions')
      .where({ id: existing.id })
      .update({
        ...fields,
        updated_at: db.fn.now(),
      });
  } else {
    await db('subscriptions').insert({
      id: uuidv4(),
      user_id: user.id,
      ...fields,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }

  await syncProfileIsPro(user.id, db);
  return db('subscriptions').where({ stripe_subscription_id: stripeSubscription.id }).first();
}

module.exports = {
  getSubscriptionStatus,
  isSubscriptionActive,
  syncProfileIsPro,
  getTrialDaysRemaining,
  isInTrial,
  isCanceling,
  createSubscription,
  updateSubscription,
  updateSubscriptionByUserId,
  upsertSubscriptionFromStripe,
  normalizeSubscriptionFields,
  normalizeStatus
};
