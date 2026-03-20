const knex = require('../db/knex');

/**
 * Subscription statuses that grant Pro access
 */
const ACTIVE_STATUSES = ['trialing', 'active'];

/**
 * Get subscription status for a user
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<Object|null>} Subscription object or null
 */
async function getSubscriptionStatus(userId) {
  const subscription = await knex('subscriptions')
    .where({ user_id: userId })
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
async function syncProfileIsPro(userId) {
  const subscription = await getSubscriptionStatus(userId);
  const hasProAccess = subscription ? isSubscriptionActive(subscription.status) : false;

  // Update profile is_pro flag
  await knex('profiles')
    .where({ user_id: userId })
    .update({
      is_pro: hasProAccess,
      updated_at: knex.fn.now()
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
async function createSubscription(subscriptionData) {
  const { v4: uuidv4 } = require('uuid');

  const subscription = {
    id: uuidv4(),
    user_id: subscriptionData.userId,
    stripe_customer_id: subscriptionData.stripeCustomerId,
    stripe_subscription_id: subscriptionData.stripeSubscriptionId || null,
    stripe_price_id: subscriptionData.stripePriceId,
    status: subscriptionData.status || 'trialing',
    trial_start: subscriptionData.trialStart || null,
    trial_end: subscriptionData.trialEnd || null,
    current_period_start: subscriptionData.currentPeriodStart || null,
    current_period_end: subscriptionData.currentPeriodEnd || null,
    cancel_at_period_end: subscriptionData.cancelAtPeriodEnd || false,
    canceled_at: subscriptionData.canceledAt || null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  };

  await knex('subscriptions').insert(subscription);

  // Sync is_pro flag
  await syncProfileIsPro(subscriptionData.userId);

  return subscription;
}

/**
 * Update subscription record in database
 * @param {string} subscriptionId - Subscription ID (UUID) or Stripe subscription ID
 * @param {Object} updates - Subscription updates
 * @returns {Promise<Object>} Updated subscription
 */
async function updateSubscription(subscriptionId, updates) {
  const whereClause = subscriptionId.length > 20 
    ? { stripe_subscription_id: subscriptionId } // Stripe subscription ID
    : { id: subscriptionId }; // Database subscription ID

  const updateData = {
    ...updates,
    updated_at: knex.fn.now()
  };

  await knex('subscriptions')
    .where(whereClause)
    .update(updateData);

  const subscription = await knex('subscriptions')
    .where(whereClause)
    .first();

  if (subscription) {
    // Sync is_pro flag
    await syncProfileIsPro(subscription.user_id);
  }

  return subscription;
}

module.exports = {
  getSubscriptionStatus,
  isSubscriptionActive,
  syncProfileIsPro,
  getTrialDaysRemaining,
  isInTrial,
  isCanceling,
  createSubscription,
  updateSubscription
};

