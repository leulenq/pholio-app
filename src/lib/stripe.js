const Stripe = require('stripe');
const config = require('../config');

// Initialize Stripe with secret key
const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, {
      apiVersion: '2024-12-18.acacia'
    })
  : null;

/**
 * Create or retrieve Stripe customer
 * @param {string} userId - User ID (UUID)
 * @param {string} email - User email
 * @param {string} name - User name (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function getOrCreateCustomer(userId, email, name = null) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  // Check if customer already exists by metadata
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId: userId,
      source: 'pholio'
    }
  });

  return customer;
}

/**
 * Create Stripe Checkout Session for subscription with 14-day trial
 * @param {string} customerId - Stripe customer ID
 * @param {string} userId - User ID (UUID)
 * @param {string} userEmail - User email
 * @returns {Promise<Object>} Stripe Checkout Session
 */
async function createCheckoutSession(customerId, userId, userEmail) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  if (!config.stripe.priceId) {
    throw new Error('Stripe Price ID is not configured. Please set STRIPE_PRICE_ID environment variable.');
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: config.stripe.priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        userId: userId
      }
    },
    success_url: `${config.stripe.baseUrl}/stripe/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.stripe.baseUrl}/pro/upgrade?canceled=true`,
    metadata: {
      userId: userId,
      userEmail: userEmail
    },
    allow_promotion_codes: true
  });

  return session;
}

/**
 * Create Customer Portal session for subscription management
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} Stripe Customer Portal session
 */
async function createCustomerPortalSession(customerId) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.stripe.baseUrl}/pro/upgrade`
  });

  return session;
}

/**
 * Retrieve Stripe subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Stripe subscription object
 */
async function getSubscription(subscriptionId) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Cancel Stripe subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {boolean} immediately - Cancel immediately or at period end
 * @returns {Promise<Object>} Stripe subscription object
 */
async function cancelSubscription(subscriptionId, immediately = false) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  if (immediately) {
    return await stripe.subscriptions.cancel(subscriptionId);
  } else {
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  }
}

/**
 * Verify webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Promise<Object>} Stripe event object
 */
async function verifyWebhookSignature(payload, signature) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  if (!config.stripe.webhookSecret) {
    throw new Error('Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET environment variable.');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

module.exports = {
  stripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscription,
  cancelSubscription,
  verifyWebhookSignature
};

