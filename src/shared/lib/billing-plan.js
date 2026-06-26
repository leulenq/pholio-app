const STUDIO_PLUS_PLAN = {
  id: "studio_plus",
  name: "Studio+",
  defaultInterval: "monthly",
  intervals: {
    monthly: {
      interval: "monthly",
      priceLabel: "$9.99",
      priceUnit: "/month",
      renewalLabel: "$9.99/month",
    },
    annual: {
      interval: "annual",
      priceLabel: "$95.88",
      priceUnit: "/year",
      renewalLabel: "$95.88/year",
      secondaryLabel: "$7.99/month equivalent",
    },
  },
  trialDays: 14,
  billingDisclosureVersion: "2026-06-25",
};

function normalizeBillingInterval(interval) {
  return interval === "annual" ? "annual" : "monthly";
}

function getStudioPlusPlan(interval = STUDIO_PLUS_PLAN.defaultInterval) {
  return STUDIO_PLUS_PLAN.intervals[normalizeBillingInterval(interval)];
}

function getStudioPlusPlanForPriceId(priceId, config) {
  if (priceId && config?.stripe?.priceIdAnnual && priceId === config.stripe.priceIdAnnual) {
    return STUDIO_PLUS_PLAN.intervals.annual;
  }
  return STUDIO_PLUS_PLAN.intervals.monthly;
}

function getStudioPlusCheckoutPlans() {
  return Object.values(STUDIO_PLUS_PLAN.intervals);
}

module.exports = {
  STUDIO_PLUS_PLAN,
  normalizeBillingInterval,
  getStudioPlusPlan,
  getStudioPlusPlanForPriceId,
  getStudioPlusCheckoutPlans,
};
