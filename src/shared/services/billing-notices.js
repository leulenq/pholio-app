/**
 * Billing notices — the pre-charge trial notice.
 *
 * Stripe fires `customer.subscription.trial_will_end` ~3 days before a trial
 * converts. That is the one moment where the talent must be told, before any
 * money moves, exactly when the charge lands, how much it is, and how to stop
 * it (ROSCA 15 U.S.C. §8403 / FTC negative-option practice). Until now the
 * handler only logged the event.
 *
 * IDEMPOTENCY
 * -----------
 * Stripe retries webhooks on any non-2xx, and a duplicated "we're about to
 * charge you" email is both alarming and evidence of a sloppy billing stack.
 * The repo has no webhook-event ledger, so this uses the marker that already
 * exists and is already enforced by the database: `notifications` carries a
 * UNIQUE (user_id, group_key) index
 * (migrations/20260526120000_create_user_notifications_table.js:36).
 *
 * The marker row is INSERTED FIRST, keyed
 * `billing:trial-will-end:<stripeSubscriptionId>:<trialEndUnix>`. The unique
 * index — not an application-level read-then-write — is what makes this
 * atomic, so two concurrent webhook deliveries cannot both pass. A duplicate
 * key means the notice already went out and we return without sending.
 *
 * Keying on the trial-end timestamp (not just the subscription) is deliberate:
 * if a trial is genuinely extended, the new end date is a new fact that
 * deserves its own notice, and it gets one.
 *
 * The marker doubles as the in-app bell notice, so the same statement reaches
 * the talent in both places from a single write. If the email send fails, the
 * marker is rolled back so Stripe's retry can try again rather than leaving a
 * member silently un-noticed.
 */

const { randomUUID } = require("crypto");
const knexDefault = require("../db/knex");
const config = require("../../config");
const { sendTrialEndingEmail } = require("../lib/email");
const { getStudioPlusPlanForPriceId } = require("../lib/billing-plan");
const { getEmailAppBaseUrl } = require("../lib/pholio-email");

const NOTIFICATION_TYPE = "billing_trial_ending";
const ROUTE_TARGET = "/dashboard/talent/settings/subscription";

function groupKeyFor(stripeSubscriptionId, trialEndUnix) {
  return `billing:trial-will-end:${stripeSubscriptionId}:${trialEndUnix}`;
}

/** SQLite says "UNIQUE constraint failed"; Postgres says SQLSTATE 23505. */
function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /unique constraint|duplicate key|UNIQUE constraint failed/i.test(
    String(error.message || ""),
  );
}

/**
 * "March 15, 2026" — spelled out, UTC, unambiguous for a legal notice.
 * @param {number|Date|string} trialEnd
 */
function formatTrialEndLabel(trialEnd) {
  const date =
    typeof trialEnd === "number" ? new Date(trialEnd * 1000) : new Date(trialEnd);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function priceIdFrom(stripeSubscription) {
  return stripeSubscription?.items?.data?.[0]?.price?.id || null;
}

/**
 * Send the pre-charge notice for a trial that is about to convert.
 *
 * Never gated by notification preferences — see the note on
 * `sendTrialEndingEmail` in shared/lib/email.js.
 *
 * @param {Object} stripeSubscription - the `customer.subscription.trial_will_end` object
 * @param {Object} [deps] - injection seam for tests
 * @param {import('knex')} [deps.knex]
 * @param {Function} [deps.sendEmail] - sendTrialEndingEmail replacement
 * @returns {Promise<{sent: boolean, reason: string}>}
 */
async function sendTrialWillEndNotice(stripeSubscription, deps = {}) {
  const db = deps.knex || knexDefault;
  const send = deps.sendEmail || sendTrialEndingEmail;

  const subscriptionId = stripeSubscription?.id;
  const customerId = stripeSubscription?.customer;
  if (!subscriptionId || !customerId) {
    return { sent: false, reason: "missing_identifiers" };
  }

  const trialEndUnix = stripeSubscription.trial_end;
  const trialEndLabel = trialEndUnix ? formatTrialEndLabel(trialEndUnix) : null;
  if (!trialEndUnix || !trialEndLabel) {
    // No date means no honest notice to send — better to stay silent than to
    // tell someone their card will be charged "soon".
    return { sent: false, reason: "no_trial_end" };
  }

  // Resolve the talent. metadata.userId is set at checkout; the customer id is
  // the fallback for subscriptions created outside that path.
  let user = null;
  const metadataUserId = stripeSubscription.metadata?.userId || null;
  if (metadataUserId) {
    user = await db("users").where({ id: metadataUserId }).first();
  }
  if (!user) {
    user = await db("users").where({ stripe_customer_id: customerId }).first();
  }
  if (!user || user.role !== "TALENT" || !user.email) {
    return { sent: false, reason: "no_talent" };
  }

  const stored = await db("subscriptions")
    .where({ stripe_subscription_id: subscriptionId })
    .first();
  const plan = getStudioPlusPlanForPriceId(
    priceIdFrom(stripeSubscription) || stored?.stripe_price_id || null,
    config,
  );
  const priceLabel = plan?.renewalLabel || "$9.99/month";

  const profile = await db("profiles")
    .where({ user_id: user.id })
    .select("first_name")
    .first();

  const groupKey = groupKeyFor(subscriptionId, trialEndUnix);
  const notificationId = randomUUID();
  const now = db.fn.now();

  // The idempotency gate. If this insert loses to a concurrent delivery, the
  // unique index rejects it and no second email is sent.
  try {
    await db("notifications").insert({
      id: notificationId,
      user_id: user.id,
      type: NOTIFICATION_TYPE,
      title: `Your Studio+ trial ends ${trialEndLabel}`,
      body: `After that you'll be charged ${priceLabel}. Cancel any time in Settings → Membership.`,
      route_target: ROUTE_TARGET,
      priority: "high",
      group_key: groupKey,
      source_type: "stripe_subscription",
      source_id: null,
      metadata: JSON.stringify({
        stripeSubscriptionId: subscriptionId,
        trialEnd: trialEndUnix,
        priceLabel,
      }),
      occurrence_count: 1,
      read_at: null,
      last_occurred_at: now,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.log(
        "[BillingNotices] Trial-end notice already sent for",
        subscriptionId,
        "— skipping duplicate.",
      );
      return { sent: false, reason: "already_sent" };
    }
    throw error;
  }

  try {
    await send({
      to: user.email,
      firstName: profile?.first_name || null,
      trialEndLabel,
      priceLabel,
      manageUrl: `${getEmailAppBaseUrl()}${ROUTE_TARGET}`,
    });
  } catch (error) {
    // Roll the marker back so Stripe's retry (or a manual replay) can send the
    // notice. A member must never lose their pre-charge notice to a transient
    // SMTP failure.
    await db("notifications").where({ id: notificationId }).delete();
    throw error;
  }

  return { sent: true, reason: "sent" };
}

module.exports = {
  sendTrialWillEndNotice,
  groupKeyFor,
  formatTrialEndLabel,
  NOTIFICATION_TYPE,
};
