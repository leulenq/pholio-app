const Stripe = require("stripe");
const config = require("../../config");
const { STUDIO_PLUS_PLAN, normalizeBillingInterval } = require("./billing-plan");
const { buildCheckoutBrandingSettings } = require("./stripe-checkout-branding");

// Initialize Stripe with secret key
const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, {
      apiVersion: "2024-12-18.acacia",
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
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId: userId,
      source: "pholio",
    },
  });

  return customer;
}

/**
 * Resolve the Stripe price ID for Studio+.
 * @param {('monthly'|'annual')} interval
 * @returns {string} Stripe price ID
 */
function resolvePriceId(interval = "monthly") {
  const normalizedInterval = normalizeBillingInterval(interval);
  if (normalizedInterval === "annual") {
    const id = config.stripe.priceIdAnnual;
    if (!id) {
      throw new Error(
        "Stripe annual price is not configured. Set STRIPE_PRICE_ID_ANNUAL.",
      );
    }
    return id;
  }

  const id = config.stripe.priceIdMonthly || config.stripe.priceId;
  if (!id) {
    throw new Error(
      "Stripe monthly price is not configured. Set STRIPE_PRICE_ID_MONTHLY (or STRIPE_PRICE_ID).",
    );
  }
  return id;
}

/**
 * Create Stripe Checkout Session for subscription with 14-day trial
 * @param {string} customerId - Stripe customer ID
 * @param {string} userId - User ID (UUID)
 * @param {string} userEmail - User email
 * @param {('monthly'|'annual')} interval - Billing interval
 * @returns {Promise<Object>} Stripe Checkout Session
 */
async function createCheckoutSession(
  customerId,
  userId,
  userEmail,
  interval = "monthly",
  options = {},
) {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
  }

  const normalizedInterval = normalizeBillingInterval(interval);
  const priceId = resolvePriceId(normalizedInterval);
  const trialEligible = options.trialEligible !== false;
  const subscriptionData = {
    metadata: { userId: userId },
  };
  if (trialEligible) {
    subscriptionData.trial_period_days = STUDIO_PLUS_PLAN.trialDays;
    subscriptionData.trial_settings = {
      end_behavior: { missing_payment_method: "cancel" },
    };
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    payment_method_collection: "always",
    subscription_data: subscriptionData,
    success_url: `${config.stripe.baseUrl}/stripe/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.stripe.baseUrl}/dashboard/talent/settings/subscription?checkout=canceled`,
    metadata: { userId: userId, userEmail: userEmail, interval: normalizedInterval },
    allow_promotion_codes: true,
    branding_settings: buildCheckoutBrandingSettings(config),
    custom_text: {
      submit: {
        message: `Begin your ${STUDIO_PLUS_PLAN.trialDays}-day Studio+ trial`,
      },
      after_submit: {
        message:
          "You'll return to Pholio when checkout is complete. Cancel anytime in Settings.",
      },
    },
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
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.stripe.baseUrl}/dashboard/talent/settings/subscription?billing=portal-return`,
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
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
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
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
  }

  if (immediately) {
    return await stripe.subscriptions.cancel(subscriptionId);
  } else {
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
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
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
    );
  }

  if (!config.stripe.webhookSecret) {
    throw new Error(
      "Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET environment variable.",
    );
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret,
  );
}

module.exports = {
  stripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscription,
  cancelSubscription,
  verifyWebhookSignature,
  resolvePriceId,
};
