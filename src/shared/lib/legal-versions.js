/**
 * Legal document versions — single source of truth for the app.
 *
 * The documents themselves are published by pholio-landing (/terms, /privacy,
 * /cookies, …). This constant is what the acceptance gate compares against, so
 * it MUST track `CURRENT_LEGAL_VERSION` in
 * `pholio-landing/lib/legal-constants.ts`.
 *
 * This used to be hardcoded in four places — shared/lib/legal-acceptance.js,
 * domains/agency/services/legal-acceptance.js, the SPA's LegalAcceptanceGate,
 * and (unused) the landing — which is how the app ended up gating on
 * 2026-06-25 for weeks after the landing published 2026-07-18. Every user's
 * acceptance row then claimed consent to a version that was no longer served,
 * and nobody was re-prompted.
 *
 * WHEN THE LANDING PUBLISHES A NEW VERSION:
 *   1. bump CURRENT_LEGAL_VERSION here to match, and
 *   2. add a matching TERMS_CHANGELOG entry (a plain-language summary of what
 *      changed) — tests/shared/legal-versions.test.js fails without it.
 * Bumping re-prompts every user, which is the intended behaviour of the gate.
 */

const CURRENT_LEGAL_VERSION = "2026-07-18";

/**
 * Plain-language "what changed", keyed by version. Shown in the re-acceptance
 * dialog so users are told what they are agreeing to, not just that something
 * moved. Summaries describe the actual published revision.
 */
const TERMS_CHANGELOG = Object.freeze({
  "2026-07-18": Object.freeze([
    "Broadened who can receive a submission — agencies, casting organizations, event producers, brands, and other clients are now covered as “Recipients,” each with defined obligations and the ability to add opportunity-specific terms.",
    "Added explicit age and guardian rules — a 13+ minimum, guardian authorization for under-18 Talent, and a statement that a self-reported date of birth is not verification.",
    "Restructured the Privacy Policy — public profiles and discoverability, portfolio analytics, children's and teen privacy, retention and deletion, and your rights and requests.",
    "Clarified optional processing and AI activities — acknowledging the Privacy Policy is not consent to optional processing that requires a separate choice; image-analysis and profile-search embeddings are separate AI activities.",
    "Detailed subscription and billing notices — renewal, cancellation, tax, and price-change notices; a paid plan never buys review, selection, representation, or booking.",
  ]),
  "2026-06-25": Object.freeze([
    "Clarified our role as a software platform rather than a talent agency, and incorporated our Community Guidelines to prohibit scamming, fake scouting, and unauthorized data use.",
    "Updated our Privacy Policy to detail how we process portfolio data, verify locations, host images on Cloudflare R2, and use AI features like photo analysis and match scoring.",
  ]),
});

function changelogFor(version = CURRENT_LEGAL_VERSION) {
  return TERMS_CHANGELOG[version] || [];
}

module.exports = {
  CURRENT_LEGAL_VERSION,
  TERMS_CHANGELOG,
  changelogFor,
};
