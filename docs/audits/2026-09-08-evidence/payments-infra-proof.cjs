// Offline adversarial proofs. Run from repository root with node <this file>.
// Never loads application config/.env, contacts a provider, or uses a disk DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const db = require('knex')({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name),
    module, exports: module.exports, console, process, Date, setTimeout, Buffer,
  }, { filename });
  return module.exports;
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } };
}
async function main() {
  await db.schema.createTable('users', t => { t.string('id').primary(); t.string('role'); t.string('stripe_customer_id'); });
  await db.schema.createTable('profiles', t => { t.string('user_id'); t.boolean('is_pro'); t.timestamp('updated_at'); });
  await require(path.join(root, 'migrations/20250115000000_create_subscriptions_table')).up(db);
  await require(path.join(root, 'migrations/20260825100000_stripe_webhook_events')).up(db);
  const ledger = require(path.join(root, 'src/shared/lib/stripe-events'));
  const subscriptions = load('src/shared/lib/subscriptions.js', { '../db/knex': db });
  await db('users').insert({ id: 'talent', role: 'TALENT', stripe_customer_id: 'cus_proof' });
  await db('profiles').insert({ user_id: 'talent', is_pro: false });
  const sub = { object: 'subscription', id: 'sub_proof', customer: 'cus_proof', status: 'active',
    metadata: { userId: 'talent' }, items: { data: [{ price: { id: 'price_proof' } }] } };
  let event = { id: 'evt_failed_notice', created: 100, type: 'customer.subscription.trial_will_end', data: { object: sub } };
  let sendAttempts = 0;
  let fail = true;
  const handler = load('src/routes/stripe-webhook.js', {
    '../shared/db/knex': db,
    '../shared/lib/stripe-events': ledger,
    '../shared/lib/stripe': { verifyWebhookSignature: async () => event, getSubscription: async () => sub },
    '../shared/lib/subscriptions': subscriptions,
    '../domains/talent/services/age-verification': {},
    '../shared/services/billing-notices': { sendTrialWillEndNotice: async () => {
      sendAttempts++; if (fail) throw new Error('Synthetic transient SMTP failure'); return { reason: 'sent' };
    } },
  });
  const req = { headers: { 'stripe-signature': 'stubbed-only-in-proof' }, body: Buffer.from('{}') };
  const first = response(); await handler(req, first);
  fail = false;
  const retry = response(); await handler(req, retry);
  assert.equal(first.statusCode, 400); assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.skipped, 'duplicate'); assert.equal(sendAttempts, 1);
  console.log('PROVED: failed notice receives 400; healthy retry receives 200 duplicate; notice never retried.');

  // Two different event handlers can both pass the ordering read before either writes.
  await subscriptions.upsertSubscriptionFromStripe(sub);
  const older = { id: 'evt_older', created: 200, type: 'customer.subscription.updated', data: { object: sub } };
  const newer = { id: 'evt_newer', created: 201, type: 'customer.subscription.deleted', data: { object: { ...sub, status: 'canceled' } } };
  assert.equal((await ledger.claimEvent(db, older)).process, true);
  assert.equal((await ledger.claimEvent(db, newer)).process, true);
  await subscriptions.updateSubscription('sub_proof', { status: 'canceled' });
  await ledger.markApplied(db, newer);
  await subscriptions.upsertSubscriptionFromStripe(sub);
  await ledger.markApplied(db, older);
  let stored = await db('subscriptions').first();
  assert.equal(stored.status, 'active'); assert.equal(stored.last_stripe_event_at, 201);
  assert.equal((await db('profiles').first()).is_pro, 1);
  console.log('PROVED: older active handler finishing after cancellation restores Pro while high-water mark remains newer.');

  // Two checkout completions are supported by Stripe; local storage collapses them.
  await subscriptions.upsertSubscriptionFromStripe({ ...sub, id: 'sub_second' });
  assert.equal((await db('subscriptions')).length, 1);
  assert.equal((await db('subscriptions').first()).stripe_subscription_id, 'sub_second');
  await subscriptions.updateSubscription('sub_second', { status: 'canceled' });
  assert.equal((await db('profiles').first()).is_pro, 0);
  console.log('PROVED: second subscription overwrites first; canceling second removes Pro despite first still being active upstream.');

  await db.schema.createTable('agencies', t => { t.string('id'); t.integer('application_review_window_days'); });
  await db.schema.createTable('applications', t => {
    t.string('id'); t.string('profile_id'); t.string('agency_id'); t.string('status');
    for (const c of ['status_changed_at', 'updated_at', 'created_at', 'auto_closed_at']) t.timestamp(c);
  });
  await db.schema.createTable('application_activities', t => {
    for (const c of ['id','application_id','agency_id','user_id','activity_type','description','metadata']) t.string(c);
    t.timestamp('created_at');
  });
  const old = new Date('2026-01-01');
  await db('agencies').insert({ id: 'agency', application_review_window_days: 30 });
  await db('applications').insert({ id: 'application', profile_id: 'profile', agency_id: 'agency', status: 'submitted', status_changed_at: old, updated_at: old, created_at: old });
  let injected = false;
  // Place an agency acceptance exactly after candidate selection and before cleanup UPDATE.
  const racingDb = (...args) => {
    const q = db(...args);
    if (args[0] === 'applications') {
      const originalUpdate = q.update.bind(q);
      q.update = async (...updates) => {
        if (!injected) {
          injected = true;
          await db('applications').where({ id: 'application' }).update({ status: 'accepted', status_changed_at: new Date('2026-09-08') });
        }
        return originalUpdate(...updates);
      };
    }
    return q;
  };
  racingDb.schema = db.schema;
  const autoClose = load('src/shared/lib/application-auto-close.js', {
    '../services/notify-talent-application': { notifyTalentForApplicationStatus: async () => {} },
  });
  await autoClose.runApplicationAutoClose(racingDb, { now: new Date('2026-09-08') });
  assert.equal(injected, true);
  assert.equal((await db('applications').first()).status, 'closed_no_response');
  console.log('PROVED: auto-close overwrites concurrent agency acceptance with closed_no_response.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.destroy());
