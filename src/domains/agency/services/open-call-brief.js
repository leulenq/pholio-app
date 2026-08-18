"use strict";

/*
 * The open-call brief: who it is for, what to send, who is eligible, when it
 * closes, and what happens next.
 *
 * Kept in one module because the agency API validates it and the public arrival
 * page renders it, and those two must not drift. A brief the applicant reads
 * differently from the one the agency wrote is worse than no brief.
 *
 * The same module also owns the *call definition* (design A2): whether a link
 * is a standing representation call or a one-off event cast, and everything an
 * event cast has to state before it can take a submission. It lives here for
 * the same reason the brief does — the agency API validates it, the public
 * arrival page renders it, and the consent copy quotes it back verbatim. Three
 * readings of one sentence must come from one place.
 */

const {
  CALL_KINDS,
  CALL_KIND_VALUES,
  COMPENSATION_TYPES,
  COMPENSATION_TYPE_VALUES,
  DEFAULT_CALL_KIND,
  DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  isEventCastingCallKind,
} = require("../../../shared/constants/event-casting");

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

/* -------------------------------------------------------------------------
 * Call definition (design A2) — representation call vs event cast.
 * ---------------------------------------------------------------------- */

const EVENT_FIELD_LIMITS = Object.freeze({
  eventName: 180,
  eventLocation: 200,
  compensationDetails: 600,
});

// A review window shorter than a day is a clock nobody can answer, and one
// longer than a season is not a window. Same reasoning for the offer clock:
// an hour is the floor, two weeks the ceiling.
const REVIEW_WINDOW_DAYS = Object.freeze({ min: 1, max: 120 });
const OFFER_RESPONSE_WINDOW_HOURS = Object.freeze({ min: 1, max: 336 });

// Compensation an organizer *states*, not a number Pholio computes. "Unpaid"
// is an answer; silence is not. Paid and stipend must say what they pay,
// because the consent copy restates the sentence verbatim and "you will be
// paid, amount unstated" is the sentence this field exists to prevent.
const COMPENSATION_DETAILS_REQUIRED = Object.freeze([
  COMPENSATION_TYPES.PAID,
  COMPENSATION_TYPES.STIPEND,
]);
const COMPENSATION_DETAILS_MIN_LENGTH = 3;

const EMPTY_INTAKE = Object.freeze({
  walkVideo: false,
  availability: false,
  measurements: false,
});

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function optionalInt(value, { field, label, min, max, fallback = null }) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new OpenCallBriefError(
      "call_window_invalid",
      `${label} must be a whole number between ${min} and ${max}.`,
      field,
    );
  }
  return parsed;
}

function normalizeCallKind(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_CALL_KIND;
  const kind = String(value).trim().toLowerCase();
  if (!CALL_KIND_VALUES.includes(kind)) {
    throw new OpenCallBriefError(
      "call_kind_invalid",
      "A call is either a representation call or an event cast.",
      "callKind",
    );
  }
  return kind;
}

function normalizeEventDetails(input) {
  const event = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const name = text(event.name);
  if (!name) {
    throw new OpenCallBriefError(
      "event_name_required",
      "Name the event applicants are being cast for.",
      "event.name",
    );
  }
  if (name.length > EVENT_FIELD_LIMITS.eventName) {
    throw new OpenCallBriefError(
      "event_name_too_long",
      `Keep the event name under ${EVENT_FIELD_LIMITS.eventName} characters.`,
      "event.name",
    );
  }

  const startsOn = text(event.startsOn) || null;
  if (!startsOn) {
    throw new OpenCallBriefError(
      "event_dates_required",
      "Say when the event runs — applicants are being asked to hold those dates.",
      "event.startsOn",
    );
  }
  if (!isIsoDate(startsOn)) {
    throw new OpenCallBriefError(
      "event_dates_invalid",
      "The event start date must be a real date.",
      "event.startsOn",
    );
  }

  // A one-day event ends the day it starts. Left null the retention promise in
  // the consent copy would have no anchor to count 90 days from.
  const endsOnInput = text(event.endsOn) || null;
  if (endsOnInput && !isIsoDate(endsOnInput)) {
    throw new OpenCallBriefError(
      "event_dates_invalid",
      "The event end date must be a real date.",
      "event.endsOn",
    );
  }
  const endsOn = endsOnInput || startsOn;
  if (endsOn < startsOn) {
    throw new OpenCallBriefError(
      "event_dates_reversed",
      "The event cannot end before it starts.",
      "event.endsOn",
    );
  }

  const location = text(event.location);
  if (location.length > EVENT_FIELD_LIMITS.eventLocation) {
    throw new OpenCallBriefError(
      "event_location_too_long",
      `Keep the location under ${EVENT_FIELD_LIMITS.eventLocation} characters.`,
      "event.location",
    );
  }

  return { name, startsOn, endsOn, location: location || null };
}

function normalizeCompensation(input) {
  const compensation =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const type = text(compensation.type).toLowerCase();
  if (!type) {
    throw new OpenCallBriefError(
      "compensation_required",
      "State whether this is paid, unpaid, or a stipend. Applicants consent to that sentence.",
      "compensation.type",
    );
  }
  if (!COMPENSATION_TYPE_VALUES.includes(type)) {
    throw new OpenCallBriefError(
      "compensation_type_invalid",
      "Compensation must be paid, unpaid, or a stipend.",
      "compensation.type",
    );
  }

  const details = text(compensation.details);
  if (details.length > EVENT_FIELD_LIMITS.compensationDetails) {
    throw new OpenCallBriefError(
      "compensation_details_too_long",
      `Keep the compensation detail under ${EVENT_FIELD_LIMITS.compensationDetails} characters.`,
      "compensation.details",
    );
  }
  if (
    COMPENSATION_DETAILS_REQUIRED.includes(type) &&
    details.length < COMPENSATION_DETAILS_MIN_LENGTH
  ) {
    throw new OpenCallBriefError(
      "compensation_details_required",
      "Say what the rate or stipend is. A payment nobody has stated is not a payment.",
      "compensation.details",
    );
  }

  return { type, details: details || null };
}

function normalizeIntake(input) {
  const intake = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    walkVideo: bool(intake.walkVideo),
    availability: bool(intake.availability),
    measurements: bool(intake.measurements),
  };
}

/**
 * Validate and normalize the call definition submitted by an agency.
 *
 * Representation calls carry no event, no compensation and no event intake —
 * supplying them is not an error, they are simply not part of that kind of
 * call and are cleared, so switching a call's kind leaves nothing stale
 * behind. Event casts must answer for the event and for compensation before
 * they can exist at all: the consent an applicant signs quotes both back.
 *
 * @param {object} [input]
 * @returns {{callKind,event,compensation,intake,reviewWindowDays,offerResponseWindowHours}}
 */
function normalizeEventCall(input = {}) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const callKind = normalizeCallKind(body.callKind);

  const reviewWindowDays = optionalInt(body.reviewWindowDays, {
    field: "reviewWindowDays",
    label: "The review window",
    min: REVIEW_WINDOW_DAYS.min,
    max: REVIEW_WINDOW_DAYS.max,
  });
  const offerResponseWindowHours = optionalInt(body.offerResponseWindowHours, {
    field: "offerResponseWindowHours",
    label: "The offer response window",
    min: OFFER_RESPONSE_WINDOW_HOURS.min,
    max: OFFER_RESPONSE_WINDOW_HOURS.max,
    fallback: DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  });

  if (callKind !== CALL_KINDS.EVENT_CASTING) {
    return {
      callKind,
      event: null,
      compensation: null,
      intake: { ...EMPTY_INTAKE },
      reviewWindowDays,
      offerResponseWindowHours,
    };
  }

  return {
    callKind,
    event: normalizeEventDetails(body.event),
    compensation: normalizeCompensation(body.compensation),
    intake: normalizeIntake(body.intake),
    reviewWindowDays,
    offerResponseWindowHours,
  };
}

/** Columns for an `agency_open_call_links` insert or update. */
function eventCallColumns(call) {
  return {
    call_kind: call.callKind,
    compensation_type: call.compensation ? call.compensation.type : null,
    compensation_details: call.compensation ? call.compensation.details : null,
    event_name: call.event ? call.event.name : null,
    event_starts_on: call.event ? call.event.startsOn : null,
    event_ends_on: call.event ? call.event.endsOn : null,
    event_location: call.event ? call.event.location : null,
    requires_walk_video: call.intake.walkVideo,
    requires_availability: call.intake.availability,
    requires_measurements: call.intake.measurements,
    review_window_days: call.reviewWindowDays,
    offer_response_window_hours: call.offerResponseWindowHours,
  };
}

/** The stored call definition in the shape `normalizeEventCall` accepts. */
function eventCallFromLink(link) {
  const callKind = callKindOf(link);
  if (callKind !== CALL_KINDS.EVENT_CASTING) {
    return {
      callKind,
      event: null,
      compensation: null,
      intake: { ...EMPTY_INTAKE },
      reviewWindowDays: link?.review_window_days ?? null,
      offerResponseWindowHours:
        link?.offer_response_window_hours ?? DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
    };
  }
  return {
    callKind,
    event: {
      name: link?.event_name || "",
      startsOn: dateOnly(link?.event_starts_on) || "",
      endsOn: dateOnly(link?.event_ends_on) || "",
      location: link?.event_location || "",
    },
    compensation: {
      type: link?.compensation_type || "",
      details: link?.compensation_details || "",
    },
    intake: {
      walkVideo: bool(link?.requires_walk_video),
      availability: bool(link?.requires_availability),
      measurements: bool(link?.requires_measurements),
    },
    reviewWindowDays: link?.review_window_days ?? null,
    offerResponseWindowHours:
      link?.offer_response_window_hours ?? DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  };
}

/** What kind of call a stored link is. Anything unrecognised reads as the default. */
function callKindOf(link) {
  return isEventCastingCallKind(link?.call_kind)
    ? CALL_KINDS.EVENT_CASTING
    : DEFAULT_CALL_KIND;
}

function isEventCall(link) {
  return callKindOf(link) === CALL_KINDS.EVENT_CASTING;
}

/** The event, as the applicant sees it. Null on a representation call. */
function eventDTO(link) {
  if (!isEventCall(link)) return null;
  return {
    name: link.event_name || null,
    startsOn: dateOnly(link.event_starts_on),
    endsOn: dateOnly(link.event_ends_on),
    location: link.event_location || null,
  };
}

/** The compensation sentence, as the applicant sees it. Null on a representation call. */
function compensationDTO(link) {
  if (!isEventCall(link) || !link.compensation_type) return null;
  return {
    type: link.compensation_type,
    details: link.compensation_details || null,
  };
}

/** What the call asks an applicant to send beyond the standard package. */
function intakeDTO(link) {
  if (!isEventCall(link)) return { ...EMPTY_INTAKE };
  return {
    walkVideo: bool(link.requires_walk_video),
    availability: bool(link.requires_availability),
    measurements: bool(link.requires_measurements),
  };
}

/**
 * The call definition alongside the brief. Purely additive: a representation
 * link reports `callKind: 'representation'` with nothing else attached, which
 * is what every link in the database was before this shipped.
 */
function eventCallDTO(link) {
  return {
    callKind: callKindOf(link),
    event: eventDTO(link),
    compensation: compensationDTO(link),
    intake: intakeDTO(link),
    reviewWindowDays: link?.review_window_days ?? null,
    offerResponseWindowHours:
      link?.offer_response_window_hours ?? DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  };
}

/**
 * The context the event consent copy interpolates. Built here because this is
 * the module that knows the column names; the content module knows the words.
 */
function eventDisclosureContextFromLink(link, organizerName = null) {
  if (!isEventCall(link)) return null;
  return {
    organizerName: organizerName || link.agency_name || null,
    eventName: link.event_name || null,
    eventStartsOn: dateOnly(link.event_starts_on),
    eventEndsOn: dateOnly(link.event_ends_on),
    eventLocation: link.event_location || null,
    compensationType: link.compensation_type || null,
    compensationDetails: link.compensation_details || null,
  };
}

/**
 * Deploy-before-migrate guard for the event-call columns, mirroring the brief
 * guard: link management keeps working on an older schema, only the event
 * definition is withheld. Cached per knex instance.
 */
const eventSchemaPromises = new WeakMap();
function hasEventCallColumns(db) {
  let promise = eventSchemaPromises.get(db);
  if (!promise) {
    promise = db.schema
      .hasColumn("agency_open_call_links", "call_kind")
      .catch(() => {
        eventSchemaPromises.delete(db);
        return false;
      });
    eventSchemaPromises.set(db, promise);
  }
  return promise;
}

module.exports = {
  COMPENSATION_DETAILS_MIN_LENGTH,
  EVENT_FIELD_LIMITS,
  FIELD_LIMITS,
  MIN_LENGTH,
  OFFER_RESPONSE_WINDOW_HOURS,
  OpenCallBriefError,
  // Same class, honest name at the call site: the event fields are part of the
  // call definition, not of the brief.
  OpenCallDefinitionError: OpenCallBriefError,
  REQUIRED_FIELDS,
  REVIEW_WINDOW_DAYS,
  briefColumns,
  briefDTO,
  callKindOf,
  compensationDTO,
  dateOnly,
  eventCallColumns,
  eventCallDTO,
  eventCallFromLink,
  eventDTO,
  eventDisclosureContextFromLink,
  hasBrief,
  hasEventCallColumns,
  intakeDTO,
  isClosedByDeadline,
  isEventCall,
  normalizeBrief,
  normalizeEventCall,
};
