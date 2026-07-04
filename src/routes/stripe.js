const express = require("express");
const knex = require("../shared/db/knex");
const { requireRole } = require("../domains/auth/middleware/require-auth");
const { addMessage } = require("../shared/middleware/context");
const {
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscription,
} = require("../shared/lib/stripe");
const {
  getSubscriptionStatus,
  upsertSubscriptionFromStripe,
} = require("../shared/lib/subscriptions");
const { normalizeBillingInterval, STUDIO_PLUS_PLAN } = require("../shared/lib/billing-plan");

const router = express.Router();

const BILLING_HOME = "/dashboard/talent/settings/subscription";
const MANAGEABLE_STATUSES = new Set(["trialing", "active", "past_due", "unpaid"]);

/**
 * Create Stripe Checkout Session for subscription
 * POST /stripe/create-checkout-session
 */
router.post(
  "/create-checkout-session",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const user = await knex("users").where({ id: userId }).first();

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (req.body?.billing_disclosure_accepted !== true) {
        return res.status(400).json({
          error:
            "Please accept the Studio+ trial and auto-renewal terms before checkout.",
        });
      }

      // Existing non-canceled subscriptions should be managed in Stripe Portal.
      const existingSubscription = await getSubscriptionStatus(userId);
      if (
        existingSubscription &&
        MANAGEABLE_STATUSES.has(existingSubscription.status)
      ) {
        return res.status(400).json({
          error: "You already have a Studio+ subscription. Manage billing from the portal.",
          subscription: existingSubscription,
        });
      }

      // Get or create Stripe customer
      let customer;
      if (user.stripe_customer_id) {
        // Customer exists, retrieve it
        const { stripe } = require("../shared/lib/stripe");
        customer = await stripe.customers.retrieve(user.stripe_customer_id);
        if (customer?.deleted) {
          customer = await getOrCreateCustomer(userId, user.email);
          await knex("users")
            .where({ id: userId })
            .update({ stripe_customer_id: customer.id });
        }
      } else {
        // Create new customer
        customer = await getOrCreateCustomer(userId, user.email);

        // Save customer ID to user
        await knex("users")
          .where({ id: userId })
          .update({ stripe_customer_id: customer.id });
      }

      const interval = normalizeBillingInterval(req.body?.interval);
      const trialEligible = !existingSubscription?.trial_start;

      // Create checkout session
      const session = await createCheckoutSession(
        customer.id,
        userId,
        user.email,
        interval,
        { trialEligible },
      );

      return res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      console.error("[Stripe] Error creating checkout session:", error);
      return next(error);
    }
  },
);

/**
 * Handle successful Stripe Checkout
 * GET /stripe/checkout/success
 */
router.get(
  "/checkout/success",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { session_id } = req.query;

      if (!session_id) {
        addMessage(req, "error", "Invalid checkout session");
        return res.redirect(`${BILLING_HOME}?checkout=invalid`);
      }

      const { stripe } = require("../shared/lib/stripe");
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (!session || session.mode !== "subscription") {
        addMessage(req, "error", "Invalid checkout session");
        return res.redirect(`${BILLING_HOME}?checkout=invalid`);
      }

      const userId = session.metadata.userId;
      const subscriptionId = session.subscription;

      if (!subscriptionId) {
        addMessage(req, "error", "Subscription not found in checkout session");
        return res.redirect(`${BILLING_HOME}?checkout=missing-subscription`);
      }

      // Retrieve full subscription from Stripe
      const subscription = await getSubscription(subscriptionId);

      await upsertSubscriptionFromStripe(subscription, { userId });

      addMessage(
        req,
        "success",
        `Subscription started successfully! Your ${STUDIO_PLUS_PLAN.trialDays}-day free trial has begun.`,
      );
      return res.redirect(`${BILLING_HOME}?checkout=success`);
    } catch (error) {
      console.error("[Stripe] Error handling checkout success:", error);
      addMessage(
        req,
        "error",
        "There was an error processing your subscription. Please contact support.",
      );
      return res.redirect(`${BILLING_HOME}?checkout=error`);
    }
  },
);

/**
 * Handle canceled Stripe Checkout
 * GET /stripe/checkout/cancel
 */
router.get("/checkout/cancel", requireRole("TALENT"), (req, res) => {
  addMessage(req, "info", "Checkout was canceled. You can try again anytime.");
  return res.redirect(`${BILLING_HOME}?checkout=canceled`);
});

/**
 * Create Customer Portal session for subscription management
 * GET /stripe/customer-portal
 */
router.get(
  "/customer-portal",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const user = await knex("users").where({ id: userId }).first();

      if (!user || !user.stripe_customer_id) {
        addMessage(
          req,
          "error",
          "No subscription found. Please start a subscription first.",
        );
        return res.redirect(BILLING_HOME);
      }

      const session = await createCustomerPortalSession(
        user.stripe_customer_id,
      );

      return res.redirect(session.url);
    } catch (error) {
      console.error("[Stripe] Error creating customer portal session:", error);
      addMessage(
        req,
        "error",
        "There was an error accessing the billing portal. Please try again.",
      );
      return res.redirect(BILLING_HOME);
    }
  },
);

module.exports = router;
