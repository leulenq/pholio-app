"use strict";

/*
 * Digitals freshness.
 *
 * Digitals are a dated claim about how someone looks now. A set shot eight
 * months ago is not wrong, it is just old, and an agency needs to know which it
 * is looking at. No product in the category tracks this: the closest competitor
 * ships a manual "talent update" prompt with no expiry, no staleness detection
 * and no versions.
 *
 * Four states, and the fourth is the point:
 *
 *   current   captured recently enough to stand as a present likeness
 *   aging     still useful, past the window an agency would call fresh
 *   stale     old enough that it should be reshot before it is sent
 *   undated   we do not know when it was taken
 *
 * **Undated is never reported as current.** The upload path already refuses to
 * stamp `captured_at` with the upload time — an image uploaded today may have
 * been taken three years ago — and this module refuses to undo that by
 * inference. A set whose age cannot be established is reported as `undated`
 * even when every dated image in it is recent, because "current" is a claim
 * about the whole set and one unknown makes it unsupportable.
 */

const { DIGITALS_MAX_AGE_DAYS } = require("../../../shared/constants/package-intelligence");
const { isDigitalSlot } = require("./profile-readiness-images");

/** Past this, a set is no longer a present likeness. */
const CURRENT_MAX_DAYS = DIGITALS_MAX_AGE_DAYS;
/** Past this, it should be reshot rather than merely refreshed. */
const AGING_MAX_DAYS = 180;

const STATES = Object.freeze({
  CURRENT: "current",
  AGING: "aging",
  STALE: "stale",
  UNDATED: "undated",
});

/** Worst-first, so a set takes the weakest state among its dated images. */
const DATED_SEVERITY = Object.freeze([STATES.STALE, STATES.AGING, STATES.CURRENT]);

const STATE_LABELS = Object.freeze({
  [STATES.CURRENT]: "Current",
  [STATES.AGING]: "Aging",
  [STATES.STALE]: "Stale",
  [STATES.UNDATED]: "Undated",
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayOnly(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function stateForAge(ageDays) {
  if (ageDays <= CURRENT_MAX_DAYS) return STATES.CURRENT;
  if (ageDays <= AGING_MAX_DAYS) return STATES.AGING;
  return STATES.STALE;
}

/**
 * One image's freshness.
 *
 * `created_at` is deliberately not a fallback: it records when the file was
 * uploaded, which says nothing about when the picture was taken.
 */
function imageFreshness(image, now = new Date()) {
  const captured = toDate(image?.captured_at);
  if (!captured) {
    return {
      imageId: image?.id ?? null,
      state: STATES.UNDATED,
      capturedOn: null,
      ageDays: null,
    };
  }
  // A capture date in the future is not a fresher picture, it is a bad date.
  const ageDays = Math.max(0, daysBetween(captured, now));
  return {
    imageId: image?.id ?? null,
    state: stateForAge(ageDays),
    capturedOn: dayOnly(captured),
    ageDays,
  };
}

/**
 * Group images into capture sets.
 *
 * `set_id` is the explicit grouping. Images without one are grouped by capture
 * date, which is what a set is: pictures taken on the same day. Anything with
 * neither lands in a single undated group rather than being invented into one.
 */
function groupSets(images) {
  const groups = new Map();
  for (const image of images || []) {
    const captured = dayOnly(image?.captured_at);
    const key = image?.set_id
      ? `set:${image.set_id}`
      : captured
        ? `date:${captured}`
        : "undated";
    if (!groups.has(key)) groups.set(key, { key, images: [] });
    groups.get(key).images.push(image);
  }
  return [...groups.values()];
}

/**
 * A set's freshness, taken from its weakest member.
 *
 * A set is sent as a unit, so it is only as current as its oldest picture — and
 * only as knowable as its least-known one.
 */
function setFreshness(images, now = new Date()) {
  const list = images || [];
  const perImage = list.map((image) => imageFreshness(image, now));
  const dated = perImage.filter((item) => item.state !== STATES.UNDATED);
  const undatedCount = perImage.length - dated.length;

  const base = {
    imageIds: perImage.map((item) => item.imageId),
    imageCount: perImage.length,
    undatedCount,
    images: perImage,
  };

  if (!perImage.length || !dated.length) {
    return {
      ...base,
      state: STATES.UNDATED,
      capturedOn: null,
      ageDays: null,
      agingOn: null,
      staleOn: null,
    };
  }

  const oldest = dated.reduce((worst, item) => (item.ageDays >= worst.ageDays ? item : worst));
  const worstState =
    DATED_SEVERITY.find((state) => dated.some((item) => item.state === state)) ||
    STATES.CURRENT;

  // The honesty rule. A set with an undated image cannot be called current:
  // that would assert something about a picture whose age nobody knows.
  const state =
    undatedCount > 0 && worstState === STATES.CURRENT ? STATES.UNDATED : worstState;

  const capturedAt = toDate(
    list.find((image) => dayOnly(image?.captured_at) === oldest.capturedOn)?.captured_at,
  );

  return {
    ...base,
    state,
    capturedOn: oldest.capturedOn,
    ageDays: oldest.ageDays,
    // When this set crosses each threshold — the dates a refresh prompt is
    // scheduled against, rather than a nag on an arbitrary cadence.
    agingOn: capturedAt ? dayOnly(addDays(capturedAt, CURRENT_MAX_DAYS)) : null,
    staleOn: capturedAt ? dayOnly(addDays(capturedAt, AGING_MAX_DAYS)) : null,
  };
}

/** Newest datable set first; undated sets last, since they cannot be ordered. */
function sortSets(sets) {
  return [...sets].sort((left, right) => {
    if (left.capturedOn && right.capturedOn) {
      return right.capturedOn.localeCompare(left.capturedOn);
    }
    if (left.capturedOn) return -1;
    if (right.capturedOn) return 1;
    return 0;
  });
}

function guidanceFor(state, freshness) {
  switch (state) {
    case STATES.CURRENT:
      return freshness.staleOn
        ? `These stand as current digitals. Plan a reshoot around ${freshness.agingOn}.`
        : "These stand as current digitals.";
    case STATES.AGING:
      return `Shot ${freshness.ageDays} days ago. Still usable, but agencies expect a set from the last ${CURRENT_MAX_DAYS} days.`;
    case STATES.STALE:
      return `Shot ${freshness.ageDays} days ago. Reshoot before sending these to anyone.`;
    case STATES.UNDATED:
    default:
      return freshness.undatedCount === freshness.imageCount
        ? "Nobody knows when these were taken. Add the shoot date, or reshoot."
        : "Some of these have no shoot date, so this set cannot be called current. Add the missing dates.";
  }
}

/**
 * Freshness across a talent's digitals.
 *
 * @param {Array<object>} images  image rows; non-digitals are ignored
 * @param {Date} now
 */
function digitalsFreshness(images, now = new Date()) {
  const digitals = (images || []).filter(isDigitalSlot);
  if (!digitals.length) {
    return {
      state: STATES.UNDATED,
      hasDigitals: false,
      sets: [],
      currentSet: null,
      undatedCount: 0,
      guidance: "No digitals yet. A dated set is what an agency reviews first.",
    };
  }

  const sets = sortSets(groupSets(digitals).map((group) => setFreshness(group.images, now)));
  // The newest datable set is what a submission actually carries. If nothing is
  // datable, the whole thing is undated and no set can claim to lead.
  const currentSet = sets.find((set) => set.capturedOn) || sets[0] || null;
  const state = currentSet ? currentSet.state : STATES.UNDATED;

  return {
    state,
    label: STATE_LABELS[state],
    hasDigitals: true,
    sets,
    currentSet,
    undatedCount: sets.reduce((total, set) => total + set.undatedCount, 0),
    // What a refresh prompt fires against, and what "refresh once, everywhere"
    // reads to know a newer set has superseded an older one.
    refreshDueOn: currentSet?.agingOn || null,
    guidance: currentSet ? guidanceFor(state, currentSet) : null,
  };
}

module.exports = {
  AGING_MAX_DAYS,
  CURRENT_MAX_DAYS,
  STATES,
  STATE_LABELS,
  digitalsFreshness,
  groupSets,
  imageFreshness,
  setFreshness,
};
