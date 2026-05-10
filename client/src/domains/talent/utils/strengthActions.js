const PRIORITIES = ['high', 'med', 'low'];

const STEP_REASONS = {
  'portfolio': "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'image':     "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'photo':     "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'measurement': "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'height':    "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'weight':    "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'bio':       "Helps agencies understand your background and experience at a glance.",
  'about':     "Helps agencies understand your background and experience at a glance.",
};

function inferReason(text) {
  const lower = text.toLowerCase();
  for (const [key, reason] of Object.entries(STEP_REASONS)) {
    if (lower.includes(key)) return reason;
  }
  return '';
}

/**
 * Maps completeness.nextSteps (any shape from the backend) → PresencePanel action items.
 * Handles both string arrays and object arrays.
 *
 * @param {Array<string|{label?:string, text?:string, title?:string, reason?:string, hint?:string}>} nextSteps
 * @returns {Array<{text: string, reason: string, priority: 'high'|'med'|'low'}>}
 */
export function normalizeStrengthActions(nextSteps = []) {
  return nextSteps.slice(0, 4).map((step, i) => {
    const text =
      typeof step === 'string'
        ? step
        : (step.label ?? step.text ?? step.title ?? '');

    const reason =
      typeof step === 'object'
        ? (step.reason ?? step.hint ?? step.description ?? inferReason(text))
        : inferReason(text);

    return { text, reason, priority: PRIORITIES[i] ?? 'low' };
  });
}

/**
 * Generates a single-sentence interpretation of the profile strength state.
 *
 * @param {number} score       0–100
 * @param {number} actionCount Number of remaining gaps
 * @returns {string}
 */
export function getStrengthInterpretation(score, actionCount) {
  if (score >= 95 || actionCount === 0) {
    return 'Your profile is complete and presenting well.';
  }
  if (score >= 70) {
    return actionCount === 1
      ? 'One gap is limiting your visibility to agencies. Closing it would meaningfully change how you appear.'
      : `${actionCount} specific gaps are limiting your visibility to agencies. Closing them would meaningfully change how you appear.`;
  }
  if (score >= 40) {
    return 'Your profile needs attention. Several key areas are incomplete, reducing how agencies discover you.';
  }
  return 'Your profile is incomplete. Finishing the key sections will unlock your visibility to agencies.';
}
