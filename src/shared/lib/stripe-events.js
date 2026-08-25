"use strict";

/**
 * Should this Stripe webhook be applied?
 *
 * Stripe delivers AT LEAST ONCE and IN NO GUARANTEED ORDER, and the handler
 * previously assumed the opposite of both. Two guards, and they answer
 * different questions:
 *
 * IDEMPOTENCY — have we seen this exact event id before? A duplicate delivery
 * is Stripe doing its job, not an error, so it is skipped quietly.
 *
 * ORDERING — does this event describe a world that has already been superseded?
 * Every Stripe event carries `created`. If an event is older than the last one
 * applied to that subscription, applying it would be time travel. The case that
 * matters: a `customer.subscription.updated` with `status: "active"` arriving
 * after a `deleted` would rewrite the row back to active and flip
 * `profiles.is_pro` on again, with nothing afterwards to correct it. That is a
 * paid entitlement restored to someone who cancelled.
 *
 * `created` is the only ordering authority available. Arrival order is what
 * Stripe explicitly does not promise, and local clocks are not comparable with
 * a remote system's. Ties within the same second are possible and are allowed
 * through — the alternative, dropping same-second events, would lose real
 * state changes to protect against a rarer problem.
 *
 * FAIL OPEN, DELIBERATELY, and only here. If the ledger cannot be read, the
 * event is processed. A payment system that silently stops applying events
 * because a bookkeeping table is missing is worse than one that occasionally
 * applies an event twice — an upsert survives that, whereas a dropped
 * cancellation does not. This is the one place in this codebase where the
 * failure mode is deliberately open, and it is because the guarded action is
 * itself idempotent.
 */

const TABLE = "stripe_webhook_events";

let schemaPromise = null;

/** Cached per process; the answer only changes when a migration runs. */
async function hasEventLedger(db) {
  if (!schemaPromise) schemaPromise = db.schema.hasTable(TABLE).catch(() => false);
  return schemaPromise;
}

/** Test seam. */
function resetEventLedgerCache() {
  schemaPromise = null;
}

/** The subscription-ish id an event is about, when it has one. */
function stripeObjectId(event) {
  const object = event?.data?.object || {};
  if (object.object === "subscription") return object.id || null;
  return object.subscription || object.id || null;
}

/**
 * Has this exact event already been recorded?
 *
 * @param {import('knex')} db
 * @param {string} eventId
 */
async function alreadySeen(db, eventId) {
  if (!eventId) return false;
  if (!(await hasEventLedger(db))) return false;
  const row = await db(TABLE).where({ event_id: eventId }).first("sequence");
  return Boolean(row);
}

/**
 * Is this event older than what has already been applied to its subscription?
 *
 * @param {import('knex')} db
 * @param {object} event
 * @returns {Promise<boolean>}
 */
async function isStale(db, event) {
  const created = Number(event?.created);
  if (!Number.isFinite(created)) return false;

  const objectId = stripeObjectId(event);
  if (!objectId) return false;

  let row;
  try {
    row = await db("subscriptions")
      .where({ stripe_subscription_id: objectId })
      .first("last_stripe_event_at");
  } catch {
    // Column not there yet (deploy before migrate). Ordering is unenforceable,
    // so do not pretend otherwise.
    return false;
  }

  const seen = Number(row?.last_stripe_event_at);
  if (!Number.isFinite(seen)) return false;
  // Strictly older. Same-second events are allowed through: dropping them would
  // lose real state changes to guard against a rarer problem.
  return created < seen;
}

/**
 * The one call a handler needs. Records the decision either way, so a skipped
 * event is still visible to whoever asks later why nothing happened.
 *
 * @param {import('knex')} db
 * @param {object} event
 * @returns {Promise<{process: boolean, reason: string|null}>}
 */
async function claimEvent(db, event) {
  const eventId = event?.id;
  if (!eventId) return { process: true, reason: null };

  try {
    if (!(await hasEventLedger(db))) return { process: true, reason: null };

    if (await alreadySeen(db, eventId)) {
      return { process: false, reason: "duplicate" };
    }

    const stale = await isStale(db, event);

    await db(TABLE).insert({
      event_id: eventId,
      event_type: event.type || "unknown",
      event_created: Number(event.created) || 0,
      stripe_object_id: stripeObjectId(event),
      outcome: stale ? "skipped_stale" : "processed",
      note: stale
        ? "Older than the last event applied to this subscription; applying it would undo newer state."
        : null,
    });

    return stale
      ? { process: false, reason: "stale" }
      : { process: true, reason: null };
  } catch (error) {
    // A unique-violation here means a concurrent delivery of the same event won
    // the race — which is exactly what the constraint is for.
    if (String(error?.message || "").match(/unique|duplicate/i)) {
      return { process: false, reason: "duplicate" };
    }
    // See the header: fail open, because the guarded action is idempotent and a
    // dropped cancellation is worse than a repeated upsert.
    console.warn("[StripeEvents] ledger unavailable, processing anyway:", error.message);
    return { process: true, reason: null };
  }
}

/**
 * Advance the high-water mark after an event has been applied.
 *
 * @param {import('knex')} db
 * @param {object} event
 */
async function markApplied(db, event) {
  const created = Number(event?.created);
  const objectId = stripeObjectId(event);
  if (!Number.isFinite(created) || !objectId) return;

  try {
    await db("subscriptions")
      .where({ stripe_subscription_id: objectId })
      // Never move the mark backwards: a same-second event applied after a
      // newer one must not lower it.
      .where((builder) =>
        builder
          .whereNull("last_stripe_event_at")
          .orWhere("last_stripe_event_at", "<", created),
      )
      .update({ last_stripe_event_at: created });
  } catch {
    // Column absent (deploy before migrate). Nothing to advance.
  }
}

module.exports = {
  TABLE,
  alreadySeen,
  claimEvent,
  hasEventLedger,
  isStale,
  markApplied,
  resetEventLedgerCache,
  stripeObjectId,
};
