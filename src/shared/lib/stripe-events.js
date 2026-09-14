"use strict";

const { randomUUID } = require('crypto');
const TABLE = 'stripe_webhook_events';
const LEASE_MS = 5 * 60 * 1000;
const FINISHED = ['completed', 'skipped_stale'];
const idOf = value => typeof value === 'string' ? value : value?.id;
function stripeObjectId(event) {
  const object = event?.data?.object || {};
  return object.object === 'subscription' ? object.id :
    idOf(object.subscription || object.parent?.subscription_details?.subscription) || object.id;
}
function resourceFor(event) {
  const object = event.data.object;
  return `stripe:${idOf(object.customer) || stripeObjectId(event)}`;
}
function recoveryPayload(event) {
  // Persist only fields the consumer uses. Invoice addresses, payment method
  // details and Identity verified_outputs must not become a second PII store.
  const source = event.data.object;
  const object = {
    id: source.id, object: source.object, customer: idOf(source.customer),
    subscription: idOf(source.subscription || source.parent?.subscription_details?.subscription),
    mode: source.mode, status: source.status,
    metadata: source.metadata?.userId ? { userId: source.metadata.userId } : {},
  };
  if (source.items?.data) object.items = { data: source.items.data.map(item => ({ price: { id: item.price?.id } })) };
  for (const key of ['trial_start', 'trial_end', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'canceled_at']) {
    if (source[key] !== undefined) object[key] = source[key];
  }
  return JSON.stringify({ id: event.id, created: event.created, type: event.type, data: { object } });
}
function lostClaim() { return new Error('Stripe processing lease unavailable; retry delivery'); }

async function claimEvent(db, event, { now = new Date() } = {}) {
  if (!event?.id || !Number.isFinite(Number(event.created))) throw new Error('Invalid Stripe event');
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  const nowValue = now.toISOString();
  return db.transaction(async trx => {
    await trx(TABLE).insert({ event_id: event.id, event_type: event.type,
      event_created: event.created, stripe_object_id: stripeObjectId(event),
      outcome: 'pending', payload: recoveryPayload(event) }).onConflict('event_id').ignore();
    const claimed = await trx(TABLE).where({ event_id: event.id }).whereNotIn('outcome', FINISHED)
      .where(q => q.whereNull('lease_until').orWhere('lease_until', '<=', nowValue))
      .update({ claim_token: token, lease_until: leaseUntil, outcome: 'processing',
        payload: recoveryPayload(event), attempts: trx.raw('attempts + 1'), note: null });
    if (!claimed) {
      const row = await trx(TABLE).where({ event_id: event.id }).first();
      return { process: false, reason: FINISHED.includes(row.outcome) ? 'duplicate' : 'busy' };
    }
    const resource = resourceFor(event);
    await trx('stripe_processing_locks').insert({ resource }).onConflict('resource').ignore();
    const locked = await trx('stripe_processing_locks').where({ resource })
      .where(q => q.whereNull('lease_until').orWhere('lease_until', '<=', nowValue))
      .update({ claim_token: token, lease_until: leaseUntil });
    if (!locked) {
      await trx(TABLE).where({ event_id: event.id, claim_token: token })
        .update({ outcome: 'pending', claim_token: null, lease_until: null });
      return { process: false, reason: 'busy' };
    }
    return { process: true, token, resource };
  });
}

async function failEvent(db, event, claim, error) {
  if (!claim?.token) return;
  await db.transaction(async trx => {
    await trx(TABLE).where({ event_id: event.id, claim_token: claim.token })
      .update({ outcome: 'pending', lease_until: null, claim_token: null, note: String(error.message).slice(0, 1000) });
    await trx('stripe_processing_locks').where({ resource: claim.resource, claim_token: claim.token })
      .update({ lease_until: null, claim_token: null });
  });
}

// Local effects, high-water mark and completion commit together. First writes
// fence expired workers and serialize SQLite as well as PostgreSQL.
async function applyEvent(db, event, claim, effect) {
  return db.transaction(async trx => {
    const now = new Date().toISOString();
    const owned = await trx(TABLE).where({ event_id: event.id, claim_token: claim.token, outcome: 'processing' })
      .where('lease_until', '>', now).update({ note: null });
    const locked = await trx('stripe_processing_locks').where({ resource: claim.resource, claim_token: claim.token })
      .where('lease_until', '>', now).update({ claim_token: claim.token });
    if (!owned || !locked) throw lostClaim();
    // Invoice/notice timestamps describe different facts; never use those to
    // suppress subscription lifecycle events.
    const stateEvent = /customer\.subscription\.(created|updated|deleted)$/.test(event.type);
    const row = stateEvent ? await trx('subscriptions').where({ stripe_subscription_id: stripeObjectId(event) }).first() : null;
    const stale = row?.last_stripe_event_at != null && Number(event.created) < Number(row.last_stripe_event_at);
    if (!stale) {
      await effect(trx);
      if (stateEvent) await trx('subscriptions').where({ stripe_subscription_id: stripeObjectId(event) })
        .update({ last_stripe_event_at: event.created });
    }
    await trx(TABLE).where({ event_id: event.id, claim_token: claim.token })
      .update({ outcome: stale ? 'skipped_stale' : 'completed', completed_at: now, lease_until: null });
    await trx('stripe_processing_locks').where({ resource: claim.resource, claim_token: claim.token })
      .update({ lease_until: null, claim_token: null });
    return { stale };
  });
}

async function replayPendingEvents(db, processEvent, { limit = 50, now = new Date() } = {}) {
  const rows = await db(TABLE).whereNotIn('outcome', FINISHED).whereNotNull('payload')
    .where(q => q.whereNull('lease_until').orWhere('lease_until', '<=', now.toISOString()))
    .orderBy('sequence').limit(limit);
  const results = [];
  for (const row of rows) {
    try { await processEvent(JSON.parse(row.payload)); results.push({ id: row.event_id, recovered: true }); }
    catch (error) { results.push({ id: row.event_id, recovered: false, error: error.message }); }
  }
  return results;
}

module.exports = { TABLE, LEASE_MS, claimEvent, failEvent, applyEvent, stripeObjectId, replayPendingEvents };
