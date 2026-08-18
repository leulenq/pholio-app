"use strict";

/*
 * The words an applicant actually read at submit time.
 *
 * There are two purposes and they are not variations of one another. A
 * representation submission asks an agency to consider signing someone; an
 * event cast asks an organizer to consider booking them for a dated job, then
 * shows the package to third-party designers who have no Pholio account. The
 * second needs sentences the first has no business saying, and vice versa.
 *
 * The representation copy below is frozen. Its version string is stamped on
 * every live draft's consent binding, so editing a byte of it invalidates
 * submissions people are in the middle of making (see `consent_package_changed`
 * in `applications.js`). New purposes get their own content and their own
 * version; they never bump the old one.
 */

const {
  CALL_PURPOSES,
  COMPENSATION_TYPES,
  DEFAULT_CALL_PURPOSE,
  EVENT_PACKAGE_RETENTION_DAYS,
} = require("../constants/event-casting");

const CURRENT_SUBMISSION_DISCLOSURE_VERSION = "2026-06-29";
const CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION = "2026-06-29.2";

const EVENT_CASTING_DISCLOSURE_VERSION = "2026-09-01";
const EVENT_CASTING_ACKNOWLEDGEMENT_VERSION = "2026-09-01.1";

/**
 * Purpose-keyed versions. Representation keeps the string it has always had.
 */
const DISCLOSURE_VERSIONS = Object.freeze({
  [CALL_PURPOSES.REPRESENTATION]: CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  [CALL_PURPOSES.EVENT_CASTING]: EVENT_CASTING_DISCLOSURE_VERSION,
});

const ACKNOWLEDGEMENT_VERSIONS = Object.freeze({
  [CALL_PURPOSES.REPRESENTATION]: CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  [CALL_PURPOSES.EVENT_CASTING]: EVENT_CASTING_ACKNOWLEDGEMENT_VERSION,
});

function normalizePurpose(purpose) {
  const value = String(purpose || "").trim().toLowerCase();
  return value === CALL_PURPOSES.EVENT_CASTING
    ? CALL_PURPOSES.EVENT_CASTING
    : DEFAULT_CALL_PURPOSE;
}

function disclosureVersionForPurpose(purpose) {
  return DISCLOSURE_VERSIONS[normalizePurpose(purpose)];
}

function acknowledgementVersionForPurpose(purpose) {
  return ACKNOWLEDGEMENT_VERSIONS[normalizePurpose(purpose)];
}

const SUBMISSION_DISCLOSURE_CONTENT = {
  termsLabel: "Submission Terms",
  handlingTemplate:
    "Your package is delivered to {{agencyName}} as a separate recipient for representation review.",
  adultDataCategories:
    "Shared data includes your name, age, city, contact details, measurements, selected images and book, comp card, note, and linked social profiles included in the package.",
  minorDataCategories:
    "Shared data includes the minor's name, under-18 age band, city, nationality, languages, guardian-authorized measurements, selected images and book, and comp card. Direct contact, social links, portfolio URL, optional note, and raw date of birth are omitted; the agency can communicate through Pholio.",
  retentionAndWithdrawal:
    "Pholio retains the package for up to 24 months. Withdrawal revokes access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the agency.",
  staticAcknowledgements: [
    "Your statistics and digitals are accurate, current, and unretouched.",
    "A submission is a request for review and does not guarantee representation.",
  ],
  adultAuthorityAcknowledgement:
    "You are 18 or older and authorised to submit your own work.",
  minorAccountConsentMissingAcknowledgement:
    "Guardian consent not yet recorded before submitting.",
  minorAgencyAuthorizedAcknowledgementTemplate:
    "A parent or guardian authorized this submission to {{agencyName}}.",
  minorAgencyUnauthorizedAcknowledgementTemplate:
    "Guardian authorization for {{agencyName}} has not been verified.",
  adultConsentStatementTemplate:
    "I have reviewed this package and consent to submitting it to {{agencyName}} through Pholio.",
  minorConsentStatementTemplate:
    "Guardian authorization verified for submission to {{agencyName}} through Pholio.",
  openCallInvitedStatementTemplate:
    "This is an invited open call submission to {{agencyName}}. It does not count toward your monthly discovery limit.",
};

/*
 * Event casting copy. Three sentences here exist because of specific, known
 * failure modes rather than legal habit:
 *
 *  - the third-party clause, because designers are the whole point of an event
 *    cast and an applicant who did not know strangers would see their walk
 *    video did not consent to it;
 *  - the compensation restatement, quoted verbatim from what the organizer
 *    typed, because "I thought it was paid" is the single most common grievance
 *    in unagented casting and the only cure is a signed record of the sentence;
 *  - the retention clause (ruling R4), because 24 months of holding a package
 *    for a one-week show is indefensible.
 */
const EVENT_CASTING_DISCLOSURE_CONTENT = {
  termsLabel: "Event Casting Terms",
  handlingTemplate:
    "Your package is delivered to {{organizerName}} for casting consideration for {{eventName}}.",
  handlingUndatedTemplate:
    "Your package is delivered to {{organizerName}} for casting consideration for this event.",
  thirdPartyAccess:
    "Designers see your name, digitals, height, measurements, availability and walk video through a read-only link. They cannot see your email, phone, socials or date of birth, and they have no Pholio account.",
  adultDataCategories:
    "Shared with the organizer: your name, age, city, contact details, measurements, digitals and selected images, comp card, stated availability, walk video link, and note included in the package.",
  minorDataCategories:
    "Shared data includes the minor's name, under-18 age band, city, guardian-authorized measurements, digitals and selected images, comp card and stated availability. Direct contact, social links, portfolio URL, optional note, and raw date of birth are omitted.",
  retentionTemplate:
    "Pholio retains this event package until {{retentionUntil}} — {{retentionDays}} days after {{eventName}} ends — and then deletes it.",
  retentionUndatedTemplate:
    "Pholio retains this event package until {{retentionDays}} days after the event ends, and then deletes it.",
  withdrawal:
    "Withdrawal revokes access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the organizer or a designer.",
  staticAcknowledgements: [
    "Your statistics and digitals are accurate, current, and unretouched.",
    "A submission is a request for review and does not guarantee selection, a booking, or payment.",
  ],
  adultAuthorityAcknowledgement:
    "You are 18 or older. This call does not accept applicants under 18.",
  minorAccountConsentMissingAcknowledgement:
    "Guardian consent not yet recorded before submitting.",
  minorAgencyAuthorizedAcknowledgementTemplate:
    "A parent or guardian authorized this submission to {{organizerName}}.",
  minorAgencyUnauthorizedAcknowledgementTemplate:
    "Guardian authorization for {{organizerName}} has not been verified.",
  compensationRestatementTemplate:
    "{{organizerName}} states this is {{compensationLabel}}. {{compensationDetails}}",
  compensationUnstated:
    "{{organizerName}} has not stated what this event pays.",
  adultConsentStatementTemplate:
    "I have reviewed this package and consent to submitting it to {{organizerName}} for {{eventName}} through Pholio.",
  minorConsentStatementTemplate:
    "Guardian authorization verified for submission to {{organizerName}} for {{eventName}} through Pholio.",
  openCallInvitedStatementTemplate:
    "This is an invited submission to {{organizerName}}'s casting for {{eventName}}.",
};

const COMPENSATION_LABELS = Object.freeze({
  [COMPENSATION_TYPES.PAID]: "PAID",
  [COMPENSATION_TYPES.UNPAID]: "UNPAID",
  [COMPENSATION_TYPES.STIPEND]: "A STIPEND",
});

function formatAgencyName(agencyName) {
  const trimmed = String(agencyName || "").trim();
  return trimmed || "this agency";
}

function interpolate(template, agencyName) {
  return String(template || "").replace(
    /\{\{agencyName\}\}/g,
    formatAgencyName(agencyName),
  );
}

/*
 * Interpolate without touching the interior of a substituted value. The
 * compensation restatement is quoted verbatim from the organizer, so
 * normalizing its whitespace would make the "verbatim" claim untrue; the only
 * tidy-up is the trailing space left behind by an omitted trailing slot.
 */
function fill(template, values) {
  return String(template || "")
    .replace(/\{\{(\w+)\}\}/g, (match, key) =>
      values[key] === undefined || values[key] === null ? match : String(values[key]),
    )
    .trim();
}

function formatOrganizerName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "this organizer";
}

function formatEventName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "this event";
}

/** ISO date `days` after `isoDate`, or null when there is no date to count from. */
function addDays(isoDate, days) {
  if (!isoDate) return null;
  const parsed = Date.parse(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Ruling R4: the date an event package is deleted. */
function eventPackageRetentionDate(eventEndsOn) {
  return addDays(eventEndsOn, EVENT_PACKAGE_RETENTION_DAYS);
}

/**
 * The compensation sentence, restated verbatim from what the organizer typed.
 * Never paraphrased, never summarised — the point is that the applicant and
 * the audit record hold the same sentence.
 */
function buildCompensationRestatement({ organizerName, compensationType, compensationDetails }) {
  const name = formatOrganizerName(organizerName);
  const label = COMPENSATION_LABELS[String(compensationType || "").toLowerCase()];
  if (!label) {
    return fill(EVENT_CASTING_DISCLOSURE_CONTENT.compensationUnstated, {
      organizerName: name,
    });
  }
  return fill(EVENT_CASTING_DISCLOSURE_CONTENT.compensationRestatementTemplate, {
    organizerName: name,
    compensationLabel: label,
    compensationDetails: String(compensationDetails || "").trim(),
  });
}

function buildEventDisclosureSnapshot({
  agencyName,
  eventContext,
  isMinor,
  minorAgencyAuthorized,
  accountGuardianConsent,
  accuracyConfirmed,
  adultAuthorityConfirmed,
}) {
  const content = EVENT_CASTING_DISCLOSURE_CONTENT;
  const context = eventContext && typeof eventContext === "object" ? eventContext : {};
  const organizerName = formatOrganizerName(context.organizerName || agencyName);
  const eventName = formatEventName(context.eventName);
  const named = Boolean(String(context.eventName || "").trim());
  const retentionUntil = eventPackageRetentionDate(context.eventEndsOn);

  const acknowledgements = [content.staticAcknowledgements[0]];

  if (isMinor) {
    if (!accountGuardianConsent) {
      acknowledgements.push(content.minorAccountConsentMissingAcknowledgement);
    } else if (minorAgencyAuthorized) {
      acknowledgements.push(
        fill(content.minorAgencyAuthorizedAcknowledgementTemplate, { organizerName }),
      );
    } else {
      acknowledgements.push(
        fill(content.minorAgencyUnauthorizedAcknowledgementTemplate, { organizerName }),
      );
    }
  } else {
    acknowledgements.push(content.adultAuthorityAcknowledgement);
  }

  acknowledgements.push(content.staticAcknowledgements[1]);

  const compensation = buildCompensationRestatement({
    organizerName,
    compensationType: context.compensationType,
    compensationDetails: context.compensationDetails,
  });

  const retention =
    named && retentionUntil
      ? fill(content.retentionTemplate, {
          retentionUntil,
          retentionDays: EVENT_PACKAGE_RETENTION_DAYS,
          eventName,
        })
      : fill(content.retentionUndatedTemplate, {
          retentionDays: EVENT_PACKAGE_RETENTION_DAYS,
        });

  return {
    purpose: CALL_PURPOSES.EVENT_CASTING,
    termsLabel: content.termsLabel,
    handling: named
      ? fill(content.handlingTemplate, { organizerName, eventName })
      : fill(content.handlingUndatedTemplate, { organizerName }),
    dataCategories: isMinor ? content.minorDataCategories : content.adultDataCategories,
    thirdPartyAccess: content.thirdPartyAccess,
    compensation,
    compensationDisclosure: {
      type: String(context.compensationType || "").toLowerCase() || null,
      details: String(context.compensationDetails || "").trim() || null,
      statement: compensation,
    },
    event: {
      name: String(context.eventName || "").trim() || null,
      startsOn: context.eventStartsOn || null,
      endsOn: context.eventEndsOn || null,
      location: context.eventLocation || null,
    },
    retentionAndWithdrawal: `${retention} ${content.withdrawal}`,
    acknowledgements,
    consentMethod: isMinor ? "minor_guardian_authorization" : "talent_checkbox",
    consentStatement: fill(
      isMinor ? content.minorConsentStatementTemplate : content.adultConsentStatementTemplate,
      { organizerName, eventName },
    ),
    attestations: isMinor
      ? {
          packageAccuracy: "system_validated",
          adultAuthority: null,
          disclosureConsent: "guardian_authorization",
        }
      : {
          packageAccuracy: accuracyConfirmed === true,
          adultAuthority: adultAuthorityConfirmed === true,
          disclosureConsent: true,
        },
  };
}

/**
 * Build the exact disclosure copy the talent (or guardian path) saw at submit time.
 *
 * `purpose` defaults to representation and that branch is byte-for-byte what it
 * has always produced — no new keys, no reordering. Callers that know nothing
 * about event casting keep working and keep hashing to the same thing.
 */
function buildSubmissionDisclosureSnapshot({
  agencyName,
  isMinor = false,
  minorAgencyAuthorized = false,
  accountGuardianConsent = false,
  accuracyConfirmed = false,
  adultAuthorityConfirmed = false,
  purpose = DEFAULT_CALL_PURPOSE,
  eventContext = null,
} = {}) {
  if (normalizePurpose(purpose) === CALL_PURPOSES.EVENT_CASTING) {
    return buildEventDisclosureSnapshot({
      agencyName,
      eventContext,
      isMinor,
      minorAgencyAuthorized,
      accountGuardianConsent,
      accuracyConfirmed,
      adultAuthorityConfirmed,
    });
  }

  const name = formatAgencyName(agencyName);
  const acknowledgements = [SUBMISSION_DISCLOSURE_CONTENT.staticAcknowledgements[0]];

  if (isMinor) {
    if (!accountGuardianConsent) {
      acknowledgements.push(
        SUBMISSION_DISCLOSURE_CONTENT.minorAccountConsentMissingAcknowledgement,
      );
    } else if (minorAgencyAuthorized) {
      acknowledgements.push(
        interpolate(
          SUBMISSION_DISCLOSURE_CONTENT.minorAgencyAuthorizedAcknowledgementTemplate,
          name,
        ),
      );
    } else {
      acknowledgements.push(
        interpolate(
          SUBMISSION_DISCLOSURE_CONTENT.minorAgencyUnauthorizedAcknowledgementTemplate,
          name,
        ),
      );
    }
  } else {
    acknowledgements.push(
      SUBMISSION_DISCLOSURE_CONTENT.adultAuthorityAcknowledgement,
    );
  }

  acknowledgements.push(
    SUBMISSION_DISCLOSURE_CONTENT.staticAcknowledgements[1],
  );

  const consentMethod = isMinor
    ? "minor_guardian_authorization"
    : "talent_checkbox";

  return {
    termsLabel: SUBMISSION_DISCLOSURE_CONTENT.termsLabel,
    handling: interpolate(
      SUBMISSION_DISCLOSURE_CONTENT.handlingTemplate,
      name,
    ),
    dataCategories: isMinor
      ? SUBMISSION_DISCLOSURE_CONTENT.minorDataCategories
      : SUBMISSION_DISCLOSURE_CONTENT.adultDataCategories,
    retentionAndWithdrawal:
      SUBMISSION_DISCLOSURE_CONTENT.retentionAndWithdrawal,
    acknowledgements,
    consentMethod,
    consentStatement: interpolate(
      isMinor
        ? SUBMISSION_DISCLOSURE_CONTENT.minorConsentStatementTemplate
        : SUBMISSION_DISCLOSURE_CONTENT.adultConsentStatementTemplate,
      name,
    ),
    attestations: isMinor
      ? {
          packageAccuracy: "system_validated",
          adultAuthority: null,
          disclosureConsent: "guardian_authorization",
        }
      : {
          packageAccuracy: accuracyConfirmed === true,
          adultAuthority: adultAuthorityConfirmed === true,
          disclosureConsent: true,
        },
  };
}

/**
 * Disclosure fragment recorded when a submission is exempt via an agency
 * open call claim — the audit record must state the same thing the UI did.
 *
 * The monthly-allowance sentence is a representation promise. An event cast
 * has no allowance to spend, so saying so there would be reassurance about a
 * limit that was never in play.
 */
function buildOpenCallDisclosure(agencyName, { purpose, eventName } = {}) {
  if (normalizePurpose(purpose) === CALL_PURPOSES.EVENT_CASTING) {
    return {
      invited: true,
      purpose: CALL_PURPOSES.EVENT_CASTING,
      statement: fill(
        EVENT_CASTING_DISCLOSURE_CONTENT.openCallInvitedStatementTemplate,
        {
          organizerName: formatOrganizerName(agencyName),
          eventName: formatEventName(eventName),
        },
      ),
    };
  }
  return {
    invited: true,
    statement: interpolate(
      SUBMISSION_DISCLOSURE_CONTENT.openCallInvitedStatementTemplate,
      agencyName,
    ),
  };
}

module.exports = {
  ACKNOWLEDGEMENT_VERSIONS,
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  DISCLOSURE_VERSIONS,
  EVENT_CASTING_ACKNOWLEDGEMENT_VERSION,
  EVENT_CASTING_DISCLOSURE_CONTENT,
  EVENT_CASTING_DISCLOSURE_VERSION,
  SUBMISSION_DISCLOSURE_CONTENT,
  acknowledgementVersionForPurpose,
  buildCompensationRestatement,
  buildOpenCallDisclosure,
  buildSubmissionDisclosureSnapshot,
  disclosureVersionForPurpose,
  eventPackageRetentionDate,
  normalizeDisclosurePurpose: normalizePurpose,
};
