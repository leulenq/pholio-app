/**
 * Studio+ membership copy, kept out of index.jsx so it stays testable and so
 * the page file exports components only (react-refresh).
 */

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Craft only. Studio+ sells what the talent KEEPS — premium comp-card themes
 * and their own portfolio analytics — never reach, ranking, review speed, or
 * submission volume. The application quota is flat and tier-blind on every plan
 * (`src/domains/talent/services/application-quota.js`), so the previous lede
 * ("expanded insight, submission volume, and premium presentation") sold
 * something that does not exist. Converged with the two other statements of
 * this promise: RightSidebar.jsx:92-95 and PRODUCT_DESCRIPTION in
 * scripts/setup-stripe-billing.js.
 */
export const STUDIO_LEDE =
  'Premium comp-card themes and 90-day portfolio analytics. Nothing an agency sees or receives changes with it.';

/**
 * What is true about this membership right now, in one sentence.
 *
 * Shown after a return from the Stripe billing portal (`?billing=portal-return`),
 * where the talent has just done something consequential — usually cancelling —
 * and Stripe hands them back with no confirmation of what landed. State the
 * fact. No "sorry to see you go", no win-back, no celebration.
 */
export function portalReturnStatus(subscription) {
  if (!subscription) return 'Checking your billing status with Stripe…';

  const { status, isPro, isTrialing, cancelAtPeriodEnd } = subscription;

  if (cancelAtPeriodEnd) {
    return subscription.renewalDate
      ? `Studio+ is set to end on ${formatDate(subscription.renewalDate)}. It stays active until then, and you won't be charged again.`
      : "Studio+ is set to end at the close of this billing period. It stays active until then, and you won't be charged again.";
  }
  if (status === 'canceled' || (!isPro && status !== 'free')) {
    return "Studio+ is canceled. You're on the free plan — your profile, portfolio, comp card, and submissions are unchanged.";
  }
  if (isTrialing) {
    return subscription.trialEndDate
      ? `Studio+ is active on trial. The trial ends ${formatDate(subscription.trialEndDate)}, then ${subscription.renewalLabel || '$9.99/month'}.`
      : `Studio+ is active on trial, then ${subscription.renewalLabel || '$9.99/month'}.`;
  }
  if (isPro) {
    return subscription.renewalDate
      ? `Studio+ is active. It renews ${formatDate(subscription.renewalDate)} at ${subscription.renewalLabel || '$9.99/month'}.`
      : `Studio+ is active at ${subscription.renewalLabel || '$9.99/month'}.`;
  }
  return "You're on the free plan. Nothing is scheduled to be charged.";
}
