const express = require('express');
const knex = require('../db/knex');
const { requireRole } = require('../middleware/auth');
const { addMessage } = require('../middleware/context');
const {
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  verifyWebhookSignature,
  getSubscription
} = require('../lib/stripe');
const {
  createSubscription,
  updateSubscription,
  getSubscriptionStatus,
  syncProfileIsPro
} = require('../lib/subscriptions');
const config = require('../config');

const router = express.Router();

/**
 * Create Stripe Checkout Session for subscription
 * POST /stripe/create-checkout-session
 */
router.post('/create-checkout-session', requireRole('TALENT'), async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const user = await knex('users').where({ id: userId }).first();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has an active subscription
    const existingSubscription = await getSubscriptionStatus(userId);
    if (existingSubscription && (existingSubscription.status === 'trialing' || existingSubscription.status === 'active')) {
      return res.status(400).json({ 
        error: 'You already have an active subscription',
        subscription: existingSubscription
      });
    }

    // Get or create Stripe customer
    let customer;
    if (user.stripe_customer_id) {
      // Customer exists, retrieve it
      const { stripe } = require('../lib/stripe');
      customer = await stripe.customers.retrieve(user.stripe_customer_id);
    } else {
      // Create new customer
      customer = await getOrCreateCustomer(userId, user.email);
      
      // Save customer ID to user
      await knex('users')
        .where({ id: userId })
        .update({ stripe_customer_id: customer.id });
    }

    // Create checkout session
    const session = await createCheckoutSession(customer.id, userId, user.email);

    // Create subscription record in database (status: trialing, trial starts after checkout)
    // We'll update this when webhook confirms checkout completion
    const subscriptionData = {
      userId,
      stripeCustomerId: customer.id,
      stripePriceId: config.stripe.priceId,
      status: 'trialing',
      trialStart: null, // Will be set when checkout is confirmed
      trialEnd: null // Will be set when checkout is confirmed
    };

    // Check if subscription record already exists
    const existingSubRecord = await knex('subscriptions')
      .where({ user_id: userId })
      .first();

    if (!existingSubRecord) {
      await createSubscription(subscriptionData);
    }

    return res.json({ 
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    return next(error);
  }
});

/**
 * Handle successful Stripe Checkout
 * GET /stripe/checkout/success
 */
router.get('/checkout/success', requireRole('TALENT'), async (req, res, next) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      addMessage(req, 'error', 'Invalid checkout session');
      return res.redirect('/pro/upgrade');
    }

    const { stripe } = require('../lib/stripe');
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session || session.mode !== 'subscription') {
      addMessage(req, 'error', 'Invalid checkout session');
      return res.redirect('/pro/upgrade');
    }

    const userId = session.metadata.userId;
    const subscriptionId = session.subscription;

    if (!subscriptionId) {
      addMessage(req, 'error', 'Subscription not found in checkout session');
      return res.redirect('/pro/upgrade');
    }

    // Retrieve full subscription from Stripe
    const subscription = await getSubscription(subscriptionId);

    // Update subscription record in database
    const subscriptionUpdates = {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false
    };

    await updateSubscription(userId, subscriptionUpdates);

    // Sync is_pro flag
    await syncProfileIsPro(userId);

    addMessage(req, 'success', 'Subscription started successfully! Your 14-day free trial has begun.');
    return res.redirect('/pro/upgrade');
  } catch (error) {
    console.error('[Stripe] Error handling checkout success:', error);
    addMessage(req, 'error', 'There was an error processing your subscription. Please contact support.');
    return res.redirect('/pro/upgrade');
  }
});

/**
 * Handle canceled Stripe Checkout
 * GET /stripe/checkout/cancel
 */
router.get('/checkout/cancel', requireRole('TALENT'), (req, res) => {
  addMessage(req, 'info', 'Checkout was canceled. You can try again anytime.');
  return res.redirect('/pro/upgrade');
});

/**
 * Create Customer Portal session for subscription management
 * GET /stripe/customer-portal
 */
router.get('/customer-portal', requireRole('TALENT'), async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const user = await knex('users').where({ id: userId }).first();

    if (!user || !user.stripe_customer_id) {
      addMessage(req, 'error', 'No subscription found. Please start a subscription first.');
      return res.redirect('/pro/upgrade');
    }

    const session = await createCustomerPortalSession(user.stripe_customer_id);

    return res.redirect(session.url);
  } catch (error) {
    console.error('[Stripe] Error creating customer portal session:', error);
    addMessage(req, 'error', 'There was an error accessing the billing portal. Please try again.');
    return res.redirect('/pro/upgrade');
  }
});

module.exports = router;

