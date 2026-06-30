"use strict";

const CURRENT_SUBMISSION_DISCLOSURE_VERSION = "2026-06-29";
const CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION = "2026-06-29.2";

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
};

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

/**
 * Build the exact disclosure copy the talent (or guardian path) saw at submit time.
 */
function buildSubmissionDisclosureSnapshot({
  agencyName,
  isMinor = false,
  minorAgencyAuthorized = false,
  accountGuardianConsent = false,
  accuracyConfirmed = false,
  adultAuthorityConfirmed = false,
} = {}) {
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

module.exports = {
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  SUBMISSION_DISCLOSURE_CONTENT,
  buildSubmissionDisclosureSnapshot,
};
