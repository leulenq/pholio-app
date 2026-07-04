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

function ring(key, label, ageDays, windowDays) {
  return {
    key,
    label,
    ageDays: ageDays === null ? null : Math.round(ageDays),
    windowDays,
    // How much of the window remains (0 = spent). Drives the depleting ring.
    remaining:
      ageDays === null ? 0 : Math.max(0, Math.min(1, 1 - ageDays / windowDays)),
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

  let cardRing;
  if (!lastCard) {
    cardRing = { ...ring("card", "Comp card", null, 1), state: "missing" };
  } else if (latestMaterialChange && latestMaterialChange > lastCard) {
    const staleness = ageInDays(latestMaterialChange, now);
    cardRing = {
      key: "card",
      label: "Comp card",
      ageDays: staleness === null ? null : Math.round(staleness),
      windowDays: null,
      remaining: 0,
      state: "stale", // material changed after the card was generated
    };
  } else {
    cardRing = {
      key: "card",
      label: "Comp card",
      ageDays: Math.round(ageInDays(lastCard, now)),
      windowDays: null,
      remaining: 1,
      state: "current",
    };
  }

  const rings = [
    ring("digitals", "Digitals", digitalsAge, DIGITALS_WINDOW_DAYS),
    ring(
      "measurements",
      "Measurements",
      measurementsAge,
      MEASUREMENTS_WINDOW_DAYS,
    ),
    cardRing,
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

/** One-word verdict for the Pulse, with the drivers that set it. */
function materialsVerdict(rings) {
  const states = rings.map((r) => r.state);
  const drivers = rings
    .filter((r) => r.state !== "current")
    .map((r) => r.key);
  let verdict = "current";
  if (states.includes("stale") || states.includes("missing")) verdict = "stale";
  else if (states.includes("aging")) verdict = "aging";
  return { verdict, drivers };
}

/**
 * Next Moves — max three ranked actions, each observation + industry reason +
 * one act, ranked by expected effect on Tier 1–3 signal (spec zone 6).
 */
function nextMoves({ rings, range, inMotionRows, flow, periodDays }) {
  const moves = [];
  const byKey = Object.fromEntries(rings.map((r) => [r.key, r]));

  const urgentRequest = (inMotionRows || []).find((r) => r.urgent);
  if (urgentRequest) {
    moves.push({
      key: "respond_requested_more",
      observation: `${urgentRequest.agencyName} requested more ${
        urgentRequest.daysAgo != null ? `${urgentRequest.daysAgo} days ago` : "recently"
      }.`,
      reason:
        "A request for more materials is the strongest live signal a submission can carry — response time is part of the read.",
      action: "Respond with the requested materials today.",
      to: "/dashboard/talent/applications",
    });
  }

  if (byKey.digitals && byKey.digitals.state !== "current") {
    const age = byKey.digitals.ageDays;
    moves.push({
      key: "reshoot_digitals",
      observation:
        byKey.digitals.state === "missing"
          ? "No digitals in your book."
          : `Your digitals are ${Math.round(age / 7)} weeks old.`,
      reason:
        "Agencies expect digitals no older than 3 months — they read the date before the frame.",
      action: "Shoot fresh digitals before your next submission.",
      to: "/dashboard/talent/media",
    });
  }

  if (byKey.measurements && byKey.measurements.state !== "current") {
    moves.push({
      key: "reconfirm_measurements",
      observation:
        byKey.measurements.state === "missing"
          ? "Your measurements have never been confirmed."
          : `Your measurements were last confirmed ${byKey.measurements.ageDays} days ago.`,
      reason:
        "Bookers work from current numbers; stats older than 90 days get re-asked or passed over.",
      action: "Re-measure and confirm your stats.",
      to: "/dashboard/talent/profile",
    });
  }

  if (byKey.card && byKey.card.state !== "current") {
    moves.push({
      key: "regenerate_card",
      observation:
        byKey.card.state === "missing"
          ? "You haven't generated a comp card yet."
          : "Your book changed after your card was last generated.",
      reason:
        "The card is what gets pulled and filed — it should carry your current strongest frames.",
      action: "Regenerate your comp card.",
      to: "/dashboard/talent/media",
    });
  }

  const missingRange = (range || []).filter((r) => !r.present);
  if (missingRange.length > 0) {
    moves.push({
      key: "complete_range",
      observation: `Your book is missing: ${missingRange
        .map((r) => r.label.toLowerCase())
        .join(", ")}.`,
      reason:
        "A booker scans for headshot, full length and profile before anything else — a gap reads as unfinished.",
      action: "Add the missing frames to your book.",
      to: "/dashboard/talent/media",
    });
  }

  if (
    moves.length === 0 &&
    flow &&
    flow.entered === 0 &&
    periodDays >= 30
  ) {
    moves.push({
      key: "submit",
      observation: "Your materials are current, and nothing is in the pipeline.",
      reason:
        "Current materials age; the window to use them is while they're fresh.",
      action: "Submit to an agency this week.",
      to: "/dashboard/talent/applications",
    });
  }

  return moves.slice(0, 3);
}

module.exports = {
  DIGITALS_WINDOW_DAYS,
  MEASUREMENTS_WINDOW_DAYS,
  buildLens,
  materialsVerdict,
  nextMoves,
};
