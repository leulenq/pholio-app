/**
 * The call, stated in words — and the plain-English rendering of every coded
 * failure the apply API can return.
 *
 * Nothing here is invented on the organizer's behalf. Dates are formatted from
 * what they published, the compensation sentence is theirs verbatim, and a
 * validation code becomes a sentence about the field it names and nothing else.
 */

/** Marketing site, mirroring `MARKETING_SITE_URL` in `client/src/shared/lib/logout.js`.
 *  Redeclared rather than imported: that module pulls in Firebase, and this
 *  surface is anonymous and must not load an auth SDK to render a legal link. */
export const MARKETING_SITE_URL = (
  import.meta.env.VITE_MARKETING_SITE_URL || 'https://www.pholio.studio'
).replace(/\/$/, '');

/** Parsed as UTC so a published date never slips a day in a western timezone. */
export function formatDate(iso) {
  if (!iso) return null;
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatEventDates(event) {
  if (!event?.startsOn) return null;
  const start = formatDate(event.startsOn);
  if (!event.endsOn || event.endsOn === event.startsOn) return start;
  return `${start} – ${formatDate(event.endsOn)}`;
}

const COMPENSATION_LABELS = {
  paid: 'PAID',
  unpaid: 'UNPAID',
  stipend: 'A STIPEND',
};

/**
 * The compensation sentence, worded exactly as it is worded in the consent the
 * applicant signs at submit. Two different renderings of the same fact is how
 * "I thought it was paid" happens.
 *
 * Copied verbatim from `compensationLine` in
 * `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx` — the arrival
 * page still serves `account_required` links and authenticated visitors, so the
 * two surfaces have to say the identical sentence about the identical call.
 */
export function compensationLine(organizerName, compensation) {
  const label = COMPENSATION_LABELS[String(compensation?.type || '').toLowerCase()];
  if (!label) return null;
  const details = String(compensation.details || '').trim();
  return `${organizerName} states this is ${label}.${details ? ` ${details}` : ''}`;
}

/** A list, in prose. */
export function listSentence(items) {
  const parts = items.filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * `INTAKE_VALIDATION_FAILED` codes, in plain words. The server's codes are
 * stable; these sentences are not, and no code ever reaches a screen.
 */
export function fieldErrorMessage(code, label = 'That answer') {
  switch (code) {
    case 'invalid_email':
      return "That email address doesn't look right. Check it and try again.";
    case 'invalid_number':
      return 'Enter your height as a number, in centimetres.';
    case 'out_of_range':
      return 'Enter a height between 50 and 260 centimetres.';
    case 'invalid_url':
      return 'Enter the full link, starting with https://';
    case 'invalid_date':
      return 'Enter a valid date.';
    case 'invalid_date_range':
      return 'Enter a start date and an end date, with the start first.';
    case 'invalid_attestation':
      return 'Confirm this to carry on.';
    case 'unknown_field':
    case 'media_not_an_answer':
      return `${label} could not be saved. Reload the page and try again.`;
    default:
      return `${label} could not be saved. Check it and try again.`;
  }
}

/**
 * A submit blocker (`intake_missing:<key>`) as the sentence the applicant needs
 * to act on. Unknown codes degrade to something honest rather than to a code.
 */
export function blockerMessage(code, labelsByKey = {}) {
  const [kind, key] = String(code || '').split(':');
  if (kind === 'intake_missing' && key) {
    return `${labelsByKey[key] || key} is still missing.`;
  }
  return 'Something in your application is still missing.';
}
