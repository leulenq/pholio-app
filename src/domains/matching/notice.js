/**
 * matching/notice.js — decision-support & candidate-notice copy (compliance).
 *
 * Pholio's match system ranks people for work, so it operates as an automated
 * employment/job-matching tool (NYC LL144, EU AI Act high-risk). The score is
 * DECISION SUPPORT, never an automated verdict — these strings make that
 * explicit wherever a ranked output is surfaced to an agency or a candidate.
 * Keep them here so legal/product own one source of truth.
 */

"use strict";

// Shown to the agency alongside any ranked list.
const AGENCY_DISCLOSURE =
  "This ranking is decision support, not a decision. Fit briefs are suggestions " +
  "built from the criteria you set and the talent's own data — a person makes the " +
  "call. Feasibility flags (age, availability, exclusivity) are hard checks; " +
  "everything else is a graded, explainable signal you can override.";

// Candidate-facing notice (LL144-style): what the tool does and what it uses.
const CANDIDATE_NOTICE =
  "Agencies on Pholio may use an automated tool to help sort and shortlist talent. " +
  "It uses the profile information and materials you provide (measurements, digitals, " +
  "experience, availability) and the agency's stated requirements to produce an " +
  "explainable fit assessment. It does not make hiring or representation decisions on " +
  "its own — a person reviews and decides. It does not use race, ethnicity, or skin " +
  "tone as a ranking factor.";

module.exports = { AGENCY_DISCLOSURE, CANDIDATE_NOTICE };
