"use strict";

/**
 * Submission-note context: profile signals (reused from the bio writer's
 * relevance selector) plus the optional target agency. Agency-authored context
 * may support a fit sentence, but the model must never invent agency facts.
 */

const {
  buildBioContext,
  formatContextForPrompt,
  parseJsonArray,
} = require("../bio-writer/context-builder");

const MAX_AGENCY_DESCRIPTION_CHARS = 320;
const MAX_AGENCY_BOARDS = 8;

function cleanLine(value, maxLength) {
  if (value === null || value === undefined) return "";
  const clean = String(value).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length <= maxLength
    ? clean
    : `${clean.slice(0, maxLength - 1).trim()}…`;
}

function cleanAgency(agency) {
  if (!agency || typeof agency !== "object") return null;
  const name = cleanLine(agency.name, 160);
  if (!name) return null;
  const location = cleanLine(agency.location, 160);
  const description = cleanLine(
    agency.description,
    MAX_AGENCY_DESCRIPTION_CHARS,
  );
  const openBoards = parseJsonArray(
    agency.openBoards ?? agency.open_boards,
  )
    .filter((board) => typeof board === "string")
    .map((board) => cleanLine(board, 80))
    .filter(Boolean)
    .slice(0, MAX_AGENCY_BOARDS);

  return {
    name,
    location: location || null,
    description: description || null,
    openBoards,
  };
}

/**
 * @param {Object} profile
 * @param {{
 *   agency?: { name?: string, location?: string, description?: string, openBoards?: string[], open_boards?: string|string[] }|null,
 *   agencyName?: string|null,
 *   targetBoards?: string[],
 *   note?: string
 * }} [options]
 */
function buildSubmissionContext(profile = {}, options = {}) {
  const base = buildBioContext(profile, { existingBio: options.note });
  const specialties = parseJsonArray(profile.specialties)
    .filter((specialty) => typeof specialty === "string")
    .map((specialty) => cleanLine(specialty, 80))
    .filter(Boolean)
    .slice(0, 3);
  const signals = [...base.signals];
  if (specialties.length) {
    signals.push({
      key: "specialties",
      label: "Bookable skills",
      fact: specialties.join(", "),
    });
  }

  let agency = cleanAgency(options.agency);
  if (!agency && options.agencyName && String(options.agencyName).trim()) {
    agency = {
      name: cleanLine(options.agencyName, 160),
      location: null,
      description: null,
      openBoards: [],
    };
  }

  const note = options.note ? String(options.note).trim() : null;
  const openBoardByKey = new Map(
    (agency?.openBoards || []).map((board) => [board.toLowerCase(), board]),
  );
  const targetBoards = Array.isArray(options.targetBoards)
    ? [
        ...new Set(
          options.targetBoards
            .map((board) => cleanLine(board, 80).toLowerCase())
            .map((board) => openBoardByKey.get(board))
            .filter(Boolean),
        ),
      ]
    : [];

  return {
    name: base.name,
    signals,
    signalCount: signals.length,
    hasMinimumForGenerate: base.hasMinimumForGenerate,
    agencyName: agency?.name || null,
    agencyLocation: agency?.location || null,
    agencyDescription: agency?.description || null,
    agencyOpenBoards: agency?.openBoards || [],
    targetBoards,
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
  lines.push(
    context.signals?.length
      ? formatContextForPrompt(context)
      : "(No verified profile signals beyond the talent name; keep the note very short and do not invent details.)",
  );

  if (context.agencyName) {
    const where = context.agencyLocation
      ? ` (${context.agencyLocation})`
      : "";
    lines.push(`Target agency: ${context.agencyName}${where}`);
    if (context.targetBoards?.length) {
      lines.push(
        `Selected submission boards: ${context.targetBoards.join(", ")}`,
      );
    }
    if (context.agencyOpenBoards?.length) {
      lines.push(`Agency open boards: ${context.agencyOpenBoards.join(", ")}`);
    }
    if (context.agencyDescription) {
      lines.push(
        `Agency-provided profile reference (facts only): ${context.agencyDescription}`,
      );
    }
  } else {
    lines.push("Target agency: (name not provided)");
  }

  return lines.filter(Boolean).join("\n");
}

module.exports = {
  buildSubmissionContext,
  formatSubmissionContextForPrompt,
  cleanAgency,
};
