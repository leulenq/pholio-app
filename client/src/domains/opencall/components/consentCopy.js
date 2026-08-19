/**
 * The words the anonymous applicant reads before pressing send.
 *
 * THIS FILE IS A MIRROR, NOT AN AUTHOR. Every string in
 * `EVENT_CASTING_DISCLOSURE_COPY` is quoted verbatim from
 * `src/shared/lib/submission-disclosure-content.js`'s
 * `EVENT_CASTING_DISCLOSURE_CONTENT` (adult path). The server builds the
 * snapshot that is hashed into the consent record at submit; this builds the
 * sentences on screen. Two renderings of the same fact is how "I thought it was
 * paid" happens, so the two are pinned together by
 * `tests/unit/open-call-consent-copy-parity.test.js` — if the server's copy
 * moves, that test fails before an applicant ever reads a different sentence
 * from the one that was recorded.
 *
 * Only the adult branch lives here. This flow is 18-and-over by platform policy
 * (ruling R8 / `normalizeIntakeSpec`'s `adult_attestation` invariant), so a
 * minor branch on an anonymous surface would be copy for a state that cannot
 * exist.
 */

/** Ruling R4, mirrored from `EVENT_PACKAGE_RETENTION_DAYS` in the server constants. */
export const EVENT_PACKAGE_RETENTION_DAYS = 90;

/** Mirrored from `COMPENSATION_LABELS` in `submission-disclosure-content.js`. */
export const COMPENSATION_LABELS = Object.freeze({
  paid: 'PAID',
  unpaid: 'UNPAID',
  stipend: 'A STIPEND',
});

/** Verbatim from `EVENT_CASTING_DISCLOSURE_CONTENT` — adult path only. */
export const EVENT_CASTING_DISCLOSURE_COPY = Object.freeze({
  termsLabel: 'Event Casting Terms',
  handlingTemplate:
    'Your package is delivered to {{organizerName}} for casting consideration for {{eventName}}.',
  handlingUndatedTemplate:
    'Your package is delivered to {{organizerName}} for casting consideration for this event.',
  thirdPartyAccess:
    'Designers see your name, digitals, height, measurements, availability and walk video through a read-only link. They cannot see your email, phone, socials or date of birth, and they have no Pholio account.',
  adultDataCategories:
    'Shared with the organizer: your name, age, city, contact details, measurements, digitals and selected images, comp card, stated availability, walk video link, and note included in the package.',
  retentionTemplate:
    'Pholio retains this event package until {{retentionUntil}} — {{retentionDays}} days after {{eventName}} ends — and then deletes it.',
  retentionUndatedTemplate:
    'Pholio retains this event package until {{retentionDays}} days after the event ends, and then deletes it.',
  withdrawal:
    'Withdrawal revokes access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the organizer or a designer.',
  staticAcknowledgements: Object.freeze([
    'Your statistics and digitals are accurate, current, and unretouched.',
    'A submission is a request for review and does not guarantee selection, a booking, or payment.',
  ]),
  adultAuthorityAcknowledgement:
    'You are 18 or older. This call does not accept applicants under 18.',
  compensationRestatementTemplate:
    '{{organizerName}} states this is {{compensationLabel}}. {{compensationDetails}}',
  compensationUnstated: '{{organizerName}} has not stated what this event pays.',
  adultConsentStatementTemplate:
    'I have reviewed this package and consent to submitting it to {{organizerName}} for {{eventName}} through Pholio.',
});

/** `fill` from the server module: substitute, never touch the interior. */
function fill(template, values) {
  return String(template || '')
    .replace(/\{\{(\w+)\}\}/g, (match, key) =>
      values[key] === undefined || values[key] === null ? match : String(values[key]),
    )
    .trim();
}

export function formatOrganizerName(name) {
  const trimmed = String(name || '').trim();
  return trimmed || 'this organizer';
}

export function formatEventName(name) {
  const trimmed = String(name || '').trim();
  return trimmed || 'this event';
}

/** ISO date `days` after `isoDate`, or null when there is no date to count from. */
function addDays(isoDate, days) {
  if (!isoDate) return null;
  const parsed = Date.parse(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Ruling R4: the date an event package is deleted. */
export function eventPackageRetentionDate(eventEndsOn) {
  return addDays(eventEndsOn, EVENT_PACKAGE_RETENTION_DAYS);
}

/**
 * The compensation sentence, restated verbatim from what the organizer typed.
 * Mirrors `buildCompensationRestatement` exactly, including the unstated case.
 */
export function buildCompensationRestatement({
  organizerName,
  compensationType,
  compensationDetails,
} = {}) {
  const name = formatOrganizerName(organizerName);
  const label = COMPENSATION_LABELS[String(compensationType || '').toLowerCase()];
  if (!label) {
    return fill(EVENT_CASTING_DISCLOSURE_COPY.compensationUnstated, { organizerName: name });
  }
  return fill(EVENT_CASTING_DISCLOSURE_COPY.compensationRestatementTemplate, {
    organizerName: name,
    compensationLabel: label,
    compensationDetails: String(compensationDetails || '').trim(),
  });
}

/**
 * Everything the consent screen renders, in the order it is read.
 *
 * @param {object}  args
 * @param {string}  args.organizerName
 * @param {object}  [args.event]         `{name, endsOn}` from the call payload.
 * @param {object}  [args.compensation]  `{type, details}` from the call payload.
 * @returns {{
 *   termsLabel: string, handling: string, dataCategories: string,
 *   thirdPartyAccess: string, compensation: string, retentionAndWithdrawal: string,
 *   consentStatement: string, accuracyStatement: string, adultStatement: string,
 *   noGuaranteeStatement: string
 * }}
 */
export function buildConsentCopy({ organizerName, event, compensation } = {}) {
  const copy = EVENT_CASTING_DISCLOSURE_COPY;
  const name = formatOrganizerName(organizerName);
  const eventName = formatEventName(event?.name);
  const named = Boolean(String(event?.name || '').trim());
  const retentionUntil = eventPackageRetentionDate(event?.endsOn);

  const retention =
    named && retentionUntil
      ? fill(copy.retentionTemplate, {
          retentionUntil,
          retentionDays: EVENT_PACKAGE_RETENTION_DAYS,
          eventName,
        })
      : fill(copy.retentionUndatedTemplate, { retentionDays: EVENT_PACKAGE_RETENTION_DAYS });

  return {
    termsLabel: copy.termsLabel,
    handling: named
      ? fill(copy.handlingTemplate, { organizerName: name, eventName })
      : fill(copy.handlingUndatedTemplate, { organizerName: name }),
    dataCategories: copy.adultDataCategories,
    thirdPartyAccess: copy.thirdPartyAccess,
    compensation: buildCompensationRestatement({
      organizerName: name,
      compensationType: compensation?.type,
      compensationDetails: compensation?.details,
    }),
    retentionAndWithdrawal: `${retention} ${copy.withdrawal}`,
    consentStatement: fill(copy.adultConsentStatementTemplate, {
      organizerName: name,
      eventName,
    }),
    accuracyStatement: copy.staticAcknowledgements[0],
    adultStatement: copy.adultAuthorityAcknowledgement,
    noGuaranteeStatement: copy.staticAcknowledgements[1],
  };
}
