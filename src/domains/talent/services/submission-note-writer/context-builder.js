"use strict";

/**
 * Submission-note context: profile signals (reused from the bio writer's
 * relevance selector) plus the optional target agency. The note is a
 * first-person letter, so the agency name is allowed as an addressee but the
 * model must never invent facts ABOUT the agency.
 */

const {
  buildBioContext,
  formatContextForPrompt,
} = require("../bio-writer/context-builder");

function cleanAgency(agency) {
  if (!agency || typeof agency !== "object") return null;
  const name = agency.name ? String(agency.name).trim() : "";
  if (!name) return null;
  const location = agency.location ? String(agency.location).trim() : "";
  return { name, location: location || null };
}

/**
 * @param {Object} profile
 * @param {{ agency?: { name?: string, location?: string }|null, agencyName?: string|null, note?: string }} [options]
 */
function buildSubmissionContext(profile = {}, options = {}) {
  const base = buildBioContext(profile, { existingBio: options.note });

  let agency = cleanAgency(options.agency);
  if (!agency && options.agencyName && String(options.agencyName).trim()) {
    agency = { name: String(options.agencyName).trim(), location: null };
  }

  const note = options.note ? String(options.note).trim() : null;

  return {
    name: base.name,
    signals: base.signals,
    signalCount: base.signalCount,
    hasMinimumForGenerate: base.hasMinimumForGenerate,
    agencyName: agency?.name || null,
    agencyLocation: agency?.location || null,
    note: note || null,
  };
}

/**
 * Compact, token-efficient verified brief for the prompt.
 * @param {ReturnType<typeof buildSubmissionContext>} context
 */
function formatSubmissionContextForPrompt(context) {
  const lines = [];
  lines.push(`Talent name: ${context.name}`);
  lines.push(formatContextForPrompt(context));

  if (context.agencyName) {
    const where = context.agencyLocation
      ? ` (${context.agencyLocation})`
      : "";
    lines.push(`Addressed to agency: ${context.agencyName}${where}`);
  } else {
    lines.push("Addressed to agency: (name not provided — keep it warm but unaddressed)");
  }

  return lines.filter(Boolean).join("\n");
}

module.exports = {
  buildSubmissionContext,
  formatSubmissionContextForPrompt,
};
