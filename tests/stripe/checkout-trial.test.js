/**
 * Studio+ checkout applies a 14-day trial via subscription_data.trial_period_days.
 */

const mockSessionsCreate = jest.fn().mockResolvedValue({
  id: "cs_test_trial",
  url: "https://checkout.stripe.test/session",
});

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
  }));
});

jest.mock("../../src/config", () => ({
  stripe: {
    secretKey: "sk_test_mock",
    priceIdMonthly: "price_monthly_test",
    priceIdAnnual: "price_annual_test",
    baseUrl: "http://localhost:3000",
  },
  appUrl: "http://localhost:3000",
}));

const { createCheckoutSession } = require("../../src/shared/lib/stripe");
const { STUDIO_PLUS_PLAN } = require("../../src/shared/lib/billing-plan");

describe("createCheckoutSession trial", () => {
  beforeEach(() => {
    mockSessionsCreate.mockClear();
  });

  it("sets trial_period_days when trialEligible is true", async () => {
    await createCheckoutSession(
      "cus_test",
      "user-1",
      "talent@example.com",
      "monthly",
      { trialEligible: true },
    );

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        payment_method_collection: "always",
        subscription_data: expect.objectContaining({
          trial_period_days: STUDIO_PLUS_PLAN.trialDays,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" },
          },
        }),
      }),
    );
  });

  it("omits trial when trialEligible is false", async () => {
    await createCheckoutSession(
      "cus_test",
      "user-1",
      "talent@example.com",
      "annual",
      { trialEligible: false },
    );

    const payload = mockSessionsCreate.mock.calls[0][0];
    expect(payload.subscription_data.trial_period_days).toBeUndefined();
    expect(payload.subscription_data.trial_settings).toBeUndefined();
  });
});
