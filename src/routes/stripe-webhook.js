const knex = require('../shared/db/knex');
const { claimEvent, markApplied } = require('../shared/lib/stripe-events');
const { verifyWebhookSignature, getSubscription } = require('../shared/lib/stripe');
const {
  updateSubscription,
  upsertSubscriptionFromStripe,
} = require('../shared/lib/subscriptions');
const {
  applyProviderSession,
  syncVerification,
  markVerificationRedacted,
} = require('../domains/talent/services/age-verification');
const { sendTrialWillEndNotice } = require('../shared/services/billing-notices');

/**
 * Stripe Webhook Handler
 * POST /stripe/webhook
 * Note: This endpoint should NOT have authentication middleware
 * Stripe verifies requests using webhook signatures
 * Note: Raw body parsing is handled in app.js before this route is called
 */
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[Stripe Webhook] Missing signature header');
    return res.status(400).send('Missing signature header');
  }

  try {
    // Verify webhook signature
    const event = await verifyWebhookSignature(req.body, sig);

    console.log(`[Stripe Webhook] Received event: ${event.type} (id: ${event.id})`);

    /* Stripe delivers at least once and in no guaranteed order. A duplicate is
       Stripe doing its job; a STALE event is the dangerous one — an `updated`
       carrying status "active" arriving after a `deleted` would rewrite the row
       back to active and flip profiles.is_pro on again, restoring a paid
       entitlement to someone who cancelled, with nothing afterwards to correct
       it. Both are recorded either way, so a skipped event is visible to
       whoever asks later why nothing happened. */
    const claim = await claimEvent(knex, event);
    if (!claim.process) {
      console.log(
        `[Stripe Webhook] Skipping ${event.type} (${event.id}): ${claim.reason}`,
      );
      // 200: the event was received and deliberately not applied. A non-2xx
      // would make Stripe retry something we have already decided about.
      return res.json({ received: true, skipped: claim.reason });
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = session.subscription;
          const userId = session.metadata.userId;

          if (userId) {
            const subscription = await getSubscription(subscriptionId);
            await upsertSubscriptionFromStripe(subscription, { userId });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await upsertSubscriptionFromStripe(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await knex('users')
          .where({ stripe_customer_id: customerId })
          .first();

        if (user?.role === 'TALENT' && subscription.id) {
          await updateSubscription(subscription.id, {
            status: 'canceled',
            canceledAt: subscription.canceled_at || Math.floor(Date.now() / 1000),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        
        if (invoice.subscription) {
          const subscription = await getSubscription(invoice.subscription);
          const customerId = subscription.customer;

          const user = await knex('users')
            .where({ stripe_customer_id: customerId })
            .first();

          if (user?.role === 'TALENT') {
            await upsertSubscriptionFromStripe(subscription, { userId: user.id });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        
        if (invoice.subscription) {
          const subscription = await getSubscription(invoice.subscription);
          const customerId = subscription.customer;

          const user = await knex('users')
            .where({ stripe_customer_id: customerId })
            .first();

          if (user?.role === 'TALENT') {
            await upsertSubscriptionFromStripe(subscription, { userId: user.id });
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // The pre-charge notice: what date, what amount, how to cancel. Sent
        // exactly once per (subscription, trial-end) — the idempotency gate is a
        // unique-indexed marker row, see shared/services/billing-notices.js.
        //
        // Errors deliberately propagate to the handler-level catch below, which
        // returns a non-2xx so Stripe retries. A swallowed failure here would
        // mean a member is charged with no warning, which is the one outcome
        // this event exists to prevent.
        const result = await sendTrialWillEndNotice(event.data.object);
        console.log(
          '[Stripe Webhook] Trial will end:',
          event.data.object.id,
          '— notice:',
          result.reason,
        );
        break;
      }

      case 'identity.verification_session.verified': {
        await syncVerification(event.data.object.id);
        break;
      }

      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled': {
        await applyProviderSession(event.data.object);
        break;
      }

      case 'identity.verification_session.redacted': {
        await markVerificationRedacted(event.data.object.id);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    // Applied. Advance the high-water mark so anything older that arrives
    // later is recognised as stale rather than replayed over newer state.
    await markApplied(knex, event);

    return res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error processing webhook:', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
}

module.exports = handleStripeWebhook;
