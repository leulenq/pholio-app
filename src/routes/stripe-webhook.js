const knex = require('../shared/db/knex');
const { verifyWebhookSignature, getSubscription } = require('../shared/lib/stripe');
const {
  updateSubscription,
  upsertSubscriptionFromStripe,
} = require('../shared/lib/subscriptions');

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
        // Optional: Send notification to user about trial ending
        console.log('[Stripe Webhook] Trial will end:', event.data.object.id);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    return res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error processing webhook:', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
}

module.exports = handleStripeWebhook;
