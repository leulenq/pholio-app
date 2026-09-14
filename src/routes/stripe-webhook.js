const knex = require('../shared/db/knex');
const { claimEvent, failEvent, applyEvent, stripeObjectId } = require('../shared/lib/stripe-events');
const { verifyWebhookSignature, getSubscription } = require('../shared/lib/stripe');
const { upsertSubscriptionFromStripe } = require('../shared/lib/subscriptions');
const { syncVerification, markVerificationRedacted } = require('../domains/talent/services/age-verification');
const { sendTrialWillEndNotice } = require('../shared/services/billing-notices');

// Also used by the durable recovery consumer. Only pass verified provider
// events, or payloads already stored by a verified webhook delivery.
async function processStripeEvent(event) {
  const claim = await claimEvent(knex, event);
  if (!claim.process) {
    if (claim.reason === 'busy') throw new Error('Stripe event is still processing');
    return { received: true, skipped: claim.reason };
  }
  try {
    const object = event.data.object;
    let subscription = null;
    let userId;
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        // Fetch after acquiring the customer lease, outside a DB transaction.
        // Equal-second events therefore converge on provider state.
        subscription = await getSubscription(object.id);
        break;
      case 'customer.subscription.deleted':
        // Preserve a tombstone even if deletion arrives before creation.
        subscription = { ...object, status: 'canceled' };
        break;
      case 'checkout.session.completed':
        if (object.mode === 'subscription' && object.subscription) {
          subscription = await getSubscription(stripeObjectId(event));
          userId = object.metadata?.userId;
        }
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        if (object.subscription || object.parent?.subscription_details?.subscription) {
          subscription = await getSubscription(stripeObjectId(event));
        }
        break;
      case 'customer.subscription.trial_will_end':
        await sendTrialWillEndNotice(object);
        break;
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
        await syncVerification(object.id);
        break;
      case 'identity.verification_session.redacted':
        await markVerificationRedacted(object.id);
        break;
      default:
        break;
    }
    const result = await applyEvent(knex, event, claim, async db => {
      if (subscription) await upsertSubscriptionFromStripe(subscription, { userId, db });
    });
    return { received: true, ...(result.stale ? { skipped: 'stale' } : {}) };
  } catch (error) {
    await failEvent(knex, event, claim, error);
    throw error;
  }
}

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature header');
  let event;
  try { event = await verifyWebhookSignature(req.body, sig); }
  catch { return res.status(400).send('Invalid webhook signature'); }
  try { return res.json(await processStripeEvent(event)); }
  catch (error) {
    console.error('[Stripe Webhook] Processing failed:', error.message);
    return res.status(503).send('Webhook processing failed; retry delivery');
  }
}

module.exports = handleStripeWebhook;
module.exports.processStripeEvent = processStripeEvent;
