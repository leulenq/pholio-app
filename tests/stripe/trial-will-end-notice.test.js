/**
 * `customer.subscription.trial_will_end` must produce exactly one pre-charge
 * notice per (subscription, trial end) — stating the date, the price, and where
 * to cancel — no matter how many times Stripe redelivers the event.
 */

const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("stripe-trial-will-end");

const knex = require("../../src/shared/db/knex");
const {
  sendTrialWillEndNotice,
  groupKeyFor,
  formatTrialEndLabel,
} = require("../../src/shared/services/billing-notices");
const {
  buildTrialEndingEmailHtml,
} = require("../../src/shared/lib/pholio-email");

// 2026-09-01T00:00:00Z
const TRIAL_END = 1788220800;

describe("trial_will_end pre-charge notice", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const CUSTOMER_ID = `cus_${uuidv4().slice(0, 8)}`;
  const SUBSCRIPTION_ID = `sub_${uuidv4().slice(0, 8)}`;

  function stripeSubscription(overrides = {}) {
    return {
      id: SUBSCRIPTION_ID,
      customer: CUSTOMER_ID,
      status: "trialing",
      trial_end: TRIAL_END,
      metadata: { userId: TALENT_ID },
      items: { data: [{ price: { id: "price_monthly_test" } }] },
      ...overrides,
    };
  }

  beforeAll(async () => {
    await migrate(knex);

    await knex("users").insert({
      id: TALENT_ID,
      email: `trial-${TALENT_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      stripe_customer_id: CUSTOMER_ID,
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `trial-${PROFILE_ID}`,
      first_name: "Trial",
      last_name: "Tester",
      city: "New York",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
    });
  }, 60000);

  beforeEach(async () => {
    await knex("notifications").where({ user_id: TALENT_ID }).delete();
  });

  afterAll(async () => {
    await knex("notifications").where({ user_id: TALENT_ID }).delete();
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").where({ id: TALENT_ID }).delete();
    await knex.destroy();
    dropIsolatedDatabase(TEST_DB_FILE);
  });

  it("sends the notice with the date, the price, and the cancel path", async () => {
    const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });

    const result = await sendTrialWillEndNotice(stripeSubscription(), {
      knex,
      sendEmail,
    });

    expect(result).toEqual({ sent: true, reason: "sent" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toContain("@example.com");
    expect(payload.firstName).toBe("Trial");
    expect(payload.trialEndLabel).toBe("September 1, 2026");
    expect(payload.priceLabel).toBe("$9.99/month");
    expect(payload.manageUrl).toMatch(/\/dashboard\/talent\/settings\/subscription$/);
  });

  it("is idempotent: a redelivered event sends nothing further", async () => {
    const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });

    const first = await sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail });
    const second = await sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail });
    const third = await sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail });

    expect(first.sent).toBe(true);
    expect(second).toEqual({ sent: false, reason: "already_sent" });
    expect(third).toEqual({ sent: false, reason: "already_sent" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const markers = await knex("notifications")
      .where({ user_id: TALENT_ID, group_key: groupKeyFor(SUBSCRIPTION_ID, TRIAL_END) })
      .select("id");
    expect(markers).toHaveLength(1);
  });

  it("is idempotent under concurrent delivery (the unique index is the gate)", async () => {
    const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });

    const results = await Promise.all([
      sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail }),
      sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail }),
      sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail }),
    ]);

    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("a moved trial end is a new fact and earns its own notice", async () => {
    const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });

    await sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail });
    await sendTrialWillEndNotice(
      stripeSubscription({ trial_end: TRIAL_END + 7 * 86400 }),
      { knex, sendEmail },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][0].trialEndLabel).toBe("September 8, 2026");
  });

  it("rolls the marker back when the email fails, so a retry can resend", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("SMTP down"));

    await expect(
      sendTrialWillEndNotice(stripeSubscription(), { knex, sendEmail: failing }),
    ).rejects.toThrow("SMTP down");

    expect(
      await knex("notifications").where({ user_id: TALENT_ID }).count({ n: "*" }).first(),
    ).toEqual(expect.objectContaining({ n: 0 }));

    const succeeding = jest.fn().mockResolvedValue({ messageId: "m1" });
    const retry = await sendTrialWillEndNotice(stripeSubscription(), {
      knex,
      sendEmail: succeeding,
    });
    expect(retry.sent).toBe(true);
  });

  it("stays silent when there is no trial end date to state", async () => {
    const sendEmail = jest.fn();
    const result = await sendTrialWillEndNotice(
      stripeSubscription({ trial_end: null }),
      { knex, sendEmail },
    );
    expect(result).toEqual({ sent: false, reason: "no_trial_end" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ignores subscriptions that resolve to no talent", async () => {
    const sendEmail = jest.fn();
    const result = await sendTrialWillEndNotice(
      stripeSubscription({ customer: "cus_unknown", metadata: {} }),
      { knex, sendEmail },
    );
    expect(result).toEqual({ sent: false, reason: "no_talent" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("formats the trial end as an unambiguous UTC date", () => {
    expect(formatTrialEndLabel(TRIAL_END)).toBe("September 1, 2026");
    expect(formatTrialEndLabel("not a date")).toBeNull();
  });

  describe("email copy", () => {
    const html = buildTrialEndingEmailHtml({
      firstName: "Trial",
      trialEndLabel: "September 1, 2026",
      priceLabel: "$9.99/month",
      manageUrl: "https://app.pholio.studio/dashboard/talent/settings/subscription",
    });

    it("states the date, the price, and how to cancel", () => {
      expect(html).toContain("September 1, 2026");
      expect(html).toContain("$9.99/month");
      expect(html).toMatch(/Settings/);
      expect(html).toMatch(/cancel/i);
    });

    it("does not sell reach, ranking, or submission volume", () => {
      expect(html).not.toMatch(/unlimited/i);
      expect(html).not.toMatch(/submission volume/i);
      expect(html).not.toMatch(/agency applications/i);
    });
  });
});
