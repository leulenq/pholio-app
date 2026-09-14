const express = require("express");
const knex = require("../shared/db/knex");
const { requireRole } = require("../domains/auth/middleware/require-auth");
const { addMessage } = require("../shared/middleware/context");
const {
  createCustomerPortalSession,
} = require("../shared/lib/stripe");
const { normalizeBillingInterval, STUDIO_PLUS_PLAN } = require("../shared/lib/billing-plan");
const { getOrCreateReservedCheckout } = require("../shared/lib/stripe-checkout-reservation");
const {
  evaluateCheckoutJurisdiction,
} = require("../shared/lib/checkout-jurisdiction");

const router = express.Router();

const BILLING_HOME = "/dashboard/talent/settings/subscription";

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

      // NY-first rollout: refuse paid checkout from states whose talent-services
      // rules are still under review (Cal. Lab. Code §1702.1 / §1701 — advance-fee
      // talent services registration and bonding; see checkout-jurisdiction.js for
      // the full reasoning). This gate covers the PAID TIER ONLY — the free
      // profile, portfolio, comp card, and submission flows are untouched
      // everywhere. It FAILS OPEN: any geolocation timeout, error, or unknown
      // region allows checkout, so a geo outage can never block a sale.
      const jurisdiction = await evaluateCheckoutJurisdiction(
        // req.clientIp is set by the IP-resolution middleware in app.js; req.ip
        // is undefined under serverless-http, hence the ordering.
        req.clientIp || req.ip || null,
      );
      if (!jurisdiction.allowed) {
        console.warn(
          "[Stripe] Checkout blocked by jurisdiction gate:",
          jurisdiction.regionCode,
        );
        return res.status(403).json({
          error: jurisdiction.message,
          code: "region_unavailable",
          region: jurisdiction.regionCode,
        });
      }

      const session = await getOrCreateReservedCheckout(knex, userId,
        normalizeBillingInterval(req.body?.interval), require("../shared/lib/stripe"));

      return res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      console.error("[Stripe] Error creating checkout session:", error);
      if (error.status === 409) return res.status(409).json({ error: error.message, code: error.code });
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

      const userId = session.metadata?.userId;
      if (userId !== req.session.userId || session.status !== 'complete') {
        return res.redirect(`${BILLING_HOME}?checkout=invalid`);
      }
      const subscriptionId = session.subscription;

      if (!subscriptionId) {
        addMessage(req, "error", "Subscription not found in checkout session");
        return res.redirect(`${BILLING_HOME}?checkout=missing-subscription`);
      }

      // Entitlements are written by the serialized webhook/recovery consumer.
      // A delayed browser return must not overwrite newer provider events.

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
