const knex = require('../db/knex');
const { verifyWebhookSignature, getSubscription } = require('../lib/stripe');
const { updateSubscription, syncProfileIsPro } = require('../lib/subscriptions');

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
            
            const subscriptionUpdates = {
              stripeSubscriptionId: subscription.id,
              status: subscription.status,
              trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
              trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
              currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
              currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
              cancelAtPeriodEnd: subscription.cancel_at_period_end || false
            };

            // Update subscription using Stripe subscription ID
            await updateSubscription(subscription.id, subscriptionUpdates);
            await syncProfileIsPro(userId);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by customer ID
        const user = await knex('users')
          .where({ stripe_customer_id: customerId })
          .first();

        if (user) {
          const subscriptionUpdates = {
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
          };

          // Update subscription using Stripe subscription ID
          await updateSubscription(subscription.id, subscriptionUpdates);
          await syncProfileIsPro(user.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await knex('users')
          .where({ stripe_customer_id: customerId })
          .first();

        if (user && subscription.id) {
          const subscriptionUpdates = {
            status: 'canceled',
            canceledAt: new Date()
          };

          // Update subscription using Stripe subscription ID
          await updateSubscription(subscription.id, subscriptionUpdates);
          await syncProfileIsPro(user.id);
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

          if (user) {
            // Update subscription status to active if it was past_due
            const subscriptionUpdates = {
              status: subscription.status,
              currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
              currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
            };

            await updateSubscription(user.id, subscriptionUpdates);
            await syncProfileIsPro(user.id);
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

          if (user) {
            const subscriptionUpdates = {
              status: subscription.status
            };

            await updateSubscription(user.id, subscriptionUpdates);
            await syncProfileIsPro(user.id);
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

