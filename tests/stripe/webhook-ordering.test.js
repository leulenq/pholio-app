"use strict";

/**
 * Stripe delivers webhooks AT LEAST ONCE and IN NO GUARANTEED ORDER, and the
 * handler assumed the opposite of both.
 *
 * The duplicate case is mildly wasteful. The ordering case costs money in the
 * wrong direction: a `customer.subscription.updated` carrying status "active"
 * arriving after a `deleted` rewrote the row back to active and flipped
 * `profiles.is_pro` on again — a paid entitlement restored to someone who had
 * cancelled, with nothing afterwards to correct it.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("stripe-webhook-ordering");
const knex = require("../../src/shared/db/knex");
const { v4: uuidv4 } = require("uuid");
const {
  TABLE,
  alreadySeen,
  claimEvent,
  isStale,
  markApplied,
  resetEventLedgerCache,
  stripeObjectId,
} = require("../../src/shared/lib/stripe-events");

const USER_ID = uuidv4();
const SUB_ID = "sub_test_123";

const event = (overrides = {}) => ({
  id: `evt_${Math.random().toString(16).slice(2, 10)}`,
  type: "customer.subscription.updated",
  created: 1_700_000_100,
  data: { object: { object: "subscription", id: SUB_ID, status: "active" } },
  ...overrides,
});

beforeAll(async () => {
  await migrate(knex);
  await knex("users").insert({
    id: USER_ID,
    email: `stripe-${USER_ID.slice(0, 8)}@example.com`,
    role: "TALENT",
  });
}, 60000);

beforeEach(async () => {
  resetEventLedgerCache();
  await knex(TABLE).del();
  await knex("subscriptions").del();
  await knex("subscriptions").insert({
    id: uuidv4(),
    user_id: USER_ID,
    stripe_customer_id: `cus_${USER_ID.slice(0, 8)}`,
    stripe_subscription_id: SUB_ID,
    stripe_price_id: "price_test",
    status: "active",
  });
});

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("a cancelled subscription cannot be resurrected by a late event", () => {
  test("an older 'active' arriving after a cancellation is refused", async () => {
    const cancelled = event({
      type: "customer.subscription.deleted",
      created: 1_700_000_200,
      data: { object: { object: "subscription", id: SUB_ID, status: "canceled" } },
    });
    expect((await claimEvent(knex, cancelled)).process).toBe(true);
    await markApplied(knex, cancelled);

    // Stripe re-delivers an earlier 'updated' that says active.
    const stale = event({ created: 1_700_000_100 });
    const claim = await claimEvent(knex, stale);

    expect(claim.process).toBe(false);
    expect(claim.reason).toBe("stale");
  });

  test("the skip is recorded, so nothing happening is explainable later", async () => {
    const newer = event({ created: 1_700_000_500 });
    await claimEvent(knex, newer);
    await markApplied(knex, newer);

    await claimEvent(knex, event({ created: 1_700_000_100 }));

    const skipped = await knex(TABLE).where({ outcome: "skipped_stale" }).first();
    expect(skipped).toBeDefined();
    expect(skipped.note).toMatch(/undo newer state/i);
  });

  test("a genuinely newer event is applied", async () => {
    const first = event({ created: 1_700_000_100 });
    await claimEvent(knex, first);
    await markApplied(knex, first);

    const later = event({ created: 1_700_000_900 });
    expect((await claimEvent(knex, later)).process).toBe(true);
  });

  test("same-second events are allowed through rather than dropped", async () => {
    // Dropping them would lose real state changes to guard against a rarer
    // problem, so equality is not staleness.
    const first = event({ created: 1_700_000_100 });
    await claimEvent(knex, first);
    await markApplied(knex, first);

    expect(await isStale(knex, event({ created: 1_700_000_100 }))).toBe(false);
  });
});

describe("at-least-once delivery", () => {
  test("the same event id is applied once", async () => {
    const e = event();
    expect((await claimEvent(knex, e)).process).toBe(true);

    const second = await claimEvent(knex, e);
    expect(second.process).toBe(false);
    expect(second.reason).toBe("duplicate");
  });

  test("alreadySeen reports it independently", async () => {
    const e = event();
    expect(await alreadySeen(knex, e.id)).toBe(false);
    await claimEvent(knex, e);
    expect(await alreadySeen(knex, e.id)).toBe(true);
  });

  test("a different event about the same subscription is not a duplicate", async () => {
    await claimEvent(knex, event({ created: 1_700_000_100 }));
    const other = await claimEvent(knex, event({ created: 1_700_000_200 }));
    expect(other.process).toBe(true);
  });
});

describe("the high-water mark never moves backwards", () => {
  test("applying an older event does not lower it", async () => {
    await markApplied(knex, event({ created: 1_700_000_900 }));
    await markApplied(knex, event({ created: 1_700_000_100 }));

    const row = await knex("subscriptions").where({ stripe_subscription_id: SUB_ID }).first();
    expect(Number(row.last_stripe_event_at)).toBe(1_700_000_900);
  });
});

describe("which subscription an event is about", () => {
  test.each([
    [{ object: "subscription", id: "sub_a" }, "sub_a"],
    [{ object: "invoice", subscription: "sub_b", id: "in_1" }, "sub_b"],
    [{ object: "checkout.session", subscription: "sub_c", id: "cs_1" }, "sub_c"],
  ])("%p resolves to %s", (object, expected) => {
    expect(stripeObjectId({ data: { object } })).toBe(expected);
  });

  test("an event about nothing subscription-shaped is never stale", async () => {
    expect(await isStale(knex, { created: 1, data: { object: {} } })).toBe(false);
  });
});

describe("the ledger fails open, deliberately", () => {
  test("an unreadable ledger processes the event rather than dropping it", async () => {
    resetEventLedgerCache();
    const broken = () => { throw new Error("no table"); };
    broken.schema = { hasTable: async () => { throw new Error("nope"); } };

    // A payment system that silently stops applying events because a
    // bookkeeping table is missing is worse than one that occasionally applies
    // an event twice — the guarded action is an idempotent upsert.
    const claim = await claimEvent(broken, event());
    expect(claim.process).toBe(true);
    resetEventLedgerCache();
  });
});
