/**
 * The Agency Lens — materials desk (spec zone 6) + the Pulse materials verdict.
 *
 * Currency judged against real industry windows:
 *   digitals ≤ 12 weeks; measurements reconfirmed ≤ 90 days; comp card pegged
 *   to the latest photo/stat change.
 */

const knex = require("../../../../shared/db/knex");
const { parseDbDate } = require("./db-utils");

const DIGITALS_WINDOW_DAYS = 84; // 12 weeks
const MEASUREMENTS_WINDOW_DAYS = 90;

function ageInDays(dateValue, now = new Date()) {
  const d = parseDbDate(dateValue);
  if (!d || isNaN(d.getTime())) return null;
  return Math.max(0, (now.getTime() - d.getTime()) / 86_400_000);
}

function ringState(ageDays, windowDays) {
  if (ageDays === null) return "missing";
  if (ageDays <= windowDays) return "current";
  if (ageDays <= windowDays * 1.5) return "aging";
  return "stale";
}

/**
 * One dated material measured against its industry window.
 *
 * `daysLeft` (positive) and `daysOver` (past the window) are the decidable
 * numbers — "reshoot in 11 days" and "34 days past" are acts; a ring fill
 * fraction is not. Every item carries the same `windowDays` scale so the three
 * can be drawn on one axis and honestly compared.
 */
function item(key, label, ageDays, windowDays) {
  const age = ageDays === null ? null : Math.round(ageDays);
  return {
    key,
    label,
    ageDays: age,
    windowDays,
    daysLeft: age === null ? null : Math.max(0, windowDays - age),
    daysOver: age === null ? null : Math.max(0, age - windowDays),
    state: ringState(ageDays, windowDays),
  };
}

async function latestCardGeneration(profileId) {
  const row = await knex("analytics")
    .where({ profile_id: profileId, event_type: "download" })
    .orderBy("created_at", "desc")
    .select("created_at")
    .first();
  return row ? parseDbDate(row.created_at) : null;
}

/**
 * Build the three Currency Rings + the range read from real dated materials.
 */
async function buildLens(profile, images) {
  const now = new Date();

  // Digitals age: newest active digital frame (captured_at, else created_at).
  const digitals = images.filter(
    (img) =>
      String(img.image_type || "").toLowerCase() === "digital" &&
      (img.status == null || img.status === "active"),
  );
  const newestDigital = digitals
    .map((img) => parseDbDate(img.captured_at) || parseDbDate(img.created_at))
    .filter((d) => d && !isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];
  const digitalsAge = newestDigital ? ageInDays(newestDigital, now) : null;

  // Measurements recency (stamped only on true value change).
  const measurementsAge = ageInDays(profile.measurements_updated_at, now);

  // Card currency: pegged to the latest photo/stat change since the last
  // generation — an out-of-date card is one that predates the book it sells.
  const lastCard = await latestCardGeneration(profile.id);
  const latestMaterialChange = [
    ...images.map(
      (img) => parseDbDate(img.captured_at) || parseDbDate(img.created_at),
    ),
    parseDbDate(profile.measurements_updated_at),
  ]
    .filter((d) => d && !isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];

  // The card is not judged on age but on whether it predates the book it sells.
  // It shares the item shape (so it can sit on the same axis) but reports its
  // own scale explicitly rather than borrowing another material's window.
  let cardItem;
  if (!lastCard) {
    cardItem = {
      key: "card",
      label: "Comp card",
      ageDays: null,
      windowDays: null,
      daysLeft: null,
      daysOver: null,
      state: "missing",
      note: "never generated",
    };
  } else if (latestMaterialChange && latestMaterialChange > lastCard) {
    const behindDays = Math.round(ageInDays(latestMaterialChange, now));
    cardItem = {
      key: "card",
      label: "Comp card",
      ageDays: Math.round(ageInDays(lastCard, now)),
      windowDays: null,
      daysLeft: null,
      // The card is out of date by however long ago the book moved past it.
      daysOver: behindDays,
      state: "stale",
      note: "your book changed after it was made",
    };
  } else {
    cardItem = {
      key: "card",
      label: "Comp card",
      ageDays: Math.round(ageInDays(lastCard, now)),
      windowDays: null,
      daysLeft: null,
      daysOver: 0,
      state: "current",
      note: "matches your book",
    };
  }

  const rings = [
    item("digitals", "Digitals", digitalsAge, DIGITALS_WINDOW_DAYS),
    item(
      "measurements",
      "Measurements",
      measurementsAge,
      MEASUREMENTS_WINDOW_DAYS,
    ),
    cardItem,
  ];

  // Range read — what a booker scans a book for.
  const shotTypes = new Set(
    images
      .filter((img) => img.status == null || img.status === "active")
      .map((img) => String(img.shot_type || "").toLowerCase())
      .filter(Boolean),
  );
  const range = [
    {
      key: "headshot",
      label: "Clean headshot",
      present: shotTypes.has("headshot") || shotTypes.has("beauty"),
    },
    {
      key: "full_length",
      label: "Full length",
      present: shotTypes.has("full_length"),
    },
    {
      key: "profile",
      label: "Profile",
      present:
        shotTypes.has("profile") ||
        shotTypes.has("profile_left") ||
        shotTypes.has("profile_right"),
    },
  ];

  return { rings, range };
}

/**
 * Can this package be sent today?
 *
 * `hold` / `caveat` / `ready` is the decision; `verdict` keeps the older
 * currency word for copy that reads about materials rather than about sending.
 * Digitals and range coverage are what a board rejects a package over, so they
 * alone can force a hold — an aging comp card is a caveat, not a blocker.
 */
function materialsVerdict(rings, range = []) {
  const states = rings.map((r) => r.state);
  const byKey = Object.fromEntries(rings.map((r) => [r.key, r]));
  const drivers = rings.filter((r) => r.state !== "current").map((r) => r.key);
  const missingRange = (range || []).filter((r) => !r.present);

  let verdict = "current";
  if (states.includes("stale") || states.includes("missing")) verdict = "stale";
  else if (states.includes("aging")) verdict = "aging";

  const digitalsBad =
    byKey.digitals &&
    (byKey.digitals.state === "stale" || byKey.digitals.state === "missing");

  let sendability = "ready";
  if (digitalsBad || missingRange.length > 0) sendability = "hold";
  else if (verdict !== "current") sendability = "caveat";

  return {
    verdict,
    sendability,
    drivers,
    missingRange: missingRange.map((r) => r.key),
  };
}

module.exports = {
  DIGITALS_WINDOW_DAYS,
  MEASUREMENTS_WINDOW_DAYS,
  buildLens,
  materialsVerdict,
};
