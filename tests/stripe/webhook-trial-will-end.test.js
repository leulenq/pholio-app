/**
 * The webhook wiring for the pre-charge notice.
 *
 * `customer.subscription.trial_will_end` used to be a console.log. It must now
 * reach the notice service, and a failure must NOT be swallowed — Stripe has to
 * see a non-2xx so it retries, because "charged with no warning" is the exact
 * outcome this event exists to prevent.
 */

const request = require("supertest");

jest.mock("../../src/shared/lib/stripe", () => ({
  verifyWebhookSignature: jest.fn(),
  getSubscription: jest.fn(),
  stripe: {},
}));

jest.mock("../../src/shared/services/billing-notices", () => ({
  sendTrialWillEndNotice: jest.fn(),
}));

const {
  useIsolatedDatabase,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("stripe-webhook-trial");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { verifyWebhookSignature } = require("../../src/shared/lib/stripe");
const {
  sendTrialWillEndNotice,
} = require("../../src/shared/services/billing-notices");

const SUBSCRIPTION = {
  id: "sub_webhook_test",
  customer: "cus_webhook_test",
  trial_end: 1788220800,
  metadata: {},
};

function post() {
  return request(app)
    .post("/stripe/webhook")
    .set("stripe-signature", "t=1,v1=fake")
    .set("Content-Type", "application/json")
    .send(Buffer.from(JSON.stringify({ ok: true })));
}

describe("POST /stripe/webhook — customer.subscription.trial_will_end", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyWebhookSignature.mockResolvedValue({
      id: "evt_test",
      type: "customer.subscription.trial_will_end",
      data: { object: SUBSCRIPTION },
    });
  });

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(TEST_DB_FILE);
  });

  it("hands the subscription to the notice service and acknowledges", async () => {
    sendTrialWillEndNotice.mockResolvedValue({ sent: true, reason: "sent" });

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(sendTrialWillEndNotice).toHaveBeenCalledTimes(1);
    expect(sendTrialWillEndNotice).toHaveBeenCalledWith(SUBSCRIPTION);
  });

  it("acknowledges a duplicate delivery without re-sending", async () => {
    sendTrialWillEndNotice.mockResolvedValue({ sent: false, reason: "already_sent" });

    const res = await post();

    expect(res.status).toBe(200);
    expect(sendTrialWillEndNotice).toHaveBeenCalledTimes(1);
  });

  it("returns non-2xx when the notice fails, so Stripe retries", async () => {
    sendTrialWillEndNotice.mockRejectedValue(new Error("SMTP down"));

    const res = await post();

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/SMTP down/);
  });
});
