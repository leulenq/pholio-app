"use strict";

/*
 * The open-call brief: who it is for, what to send, who is eligible, when it
 * closes, and what happens next.
 *
 * Kept in one module because the agency API validates it and the public arrival
 * page renders it, and those two must not drift. A brief the applicant reads
 * differently from the one the agency wrote is worse than no brief.
 */

const FIELD_LIMITS = Object.freeze({
  who: 600,
  what: 1200,
  eligibility: 800,
  nextSteps: 800,
});

const REQUIRED_FIELDS = Object.freeze(["who", "what", "nextSteps"]);

// Short enough to be a slip rather than an answer. An agency writing "n/a"
// still passes — this only catches an empty gesture, not a terse one.
const MIN_LENGTH = 10;

class OpenCallBriefError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "OpenCallBriefError";
    this.code = code;
    this.status = 400;
    this.field = field;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Validate and normalize a brief submitted by an agency.
 *
 * @param {object} input
 * @param {string} [today] YYYY-MM-DD, for the deadline-in-the-past check
 * @returns {{who,what,eligibility,nextSteps,deadline,ongoing}}
 */
function normalizeBrief(input, today = new Date().toISOString().slice(0, 10)) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new OpenCallBriefError("brief_required", "A brief is required.");
  }

  const brief = {
    who: text(input.who),
    what: text(input.what),
    eligibility: text(input.eligibility),
    nextSteps: text(input.nextSteps),
  };

  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (brief[field].length > limit) {
      throw new OpenCallBriefError(
        "brief_too_long",
        `Keep "${field}" under ${limit} characters.`,
        field,
      );
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (brief[field].length < MIN_LENGTH) {
      throw new OpenCallBriefError(
        "brief_incomplete",
        "Applicants need to know who the call is for, what to send, and what happens next.",
        field,
      );
    }
  }

  // Eligibility may legitimately be empty: an open call that is open to
  // everyone should say nothing rather than invent a restriction.
  const ongoing = input.ongoing === true;
  const deadline = text(input.deadline) || null;

  if (ongoing && deadline) {
    throw new OpenCallBriefError(
      "brief_deadline_conflict",
      "A call is either ongoing or has a closing date, not both.",
      "deadline",
    );
  }
  if (!ongoing && !deadline) {
    throw new OpenCallBriefError(
      "brief_deadline_required",
      "Give a closing date, or say the call runs continuously.",
      "deadline",
    );
  }
  if (deadline) {
    if (!isIsoDate(deadline)) {
      throw new OpenCallBriefError(
        "brief_deadline_invalid",
        "The closing date must be a real date.",
        "deadline",
      );
    }
    if (deadline < today) {
      throw new OpenCallBriefError(
        "brief_deadline_past",
        "That closing date has already passed.",
        "deadline",
      );
    }
  }

  return { ...brief, deadline, ongoing };
}

/** Columns for an `agency_open_call_links` insert or update. */
function briefColumns(brief, now) {
  return {
    brief_who: brief.who,
    brief_what: brief.what,
    brief_eligibility: brief.eligibility || null,
    brief_next_steps: brief.nextSteps,
    brief_deadline: brief.deadline,
    brief_ongoing: brief.ongoing,
    brief_completed_at: now,
  };
}

/** Whether a stored link carries a brief the agency actually wrote. */
function hasBrief(link) {
  return Boolean(link?.brief_completed_at);
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * A dated call stops accepting once its date has passed.
 *
 * Left open, it would keep taking submissions into a call the agency considers
 * finished — the exact silence the plan is trying to remove. Links with no
 * brief have no deadline and are never closed by this.
 */
function isClosedByDeadline(link, today = new Date().toISOString().slice(0, 10)) {
  const deadline = dateOnly(link?.brief_deadline);
  return Boolean(deadline) && deadline < today;
}

/** The brief as the applicant sees it. Null when the agency has not written one. */
function briefDTO(link) {
  if (!hasBrief(link)) return null;
  return {
    who: link.brief_who,
    what: link.brief_what,
    eligibility: link.brief_eligibility || null,
    nextSteps: link.brief_next_steps,
    deadline: dateOnly(link.brief_deadline),
    ongoing: Boolean(link.brief_ongoing),
  };
}

module.exports = {
  FIELD_LIMITS,
  MIN_LENGTH,
  OpenCallBriefError,
  REQUIRED_FIELDS,
  briefColumns,
  briefDTO,
  dateOnly,
  hasBrief,
  isClosedByDeadline,
  normalizeBrief,
};
