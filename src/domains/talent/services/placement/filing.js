"use strict";

/**
 * Placement — how the talent would be filed (tasks/intel-placement.md §1).
 *
 * A mother agent's first job is deciding which boards someone belongs on.
 * Most unrepresented talent are never told, so they apply everywhere and hear
 * nothing. This reads the talent's stats against the typical ranges in
 * `data/industry/v1/boards.json` and says, in numbers, where they sit.
 *
 * Context, never a gate: nothing here stops an application, and the agencies'
 * own published requirements are evaluated separately (agencies.js).
 * Only boards with a real height or age convention are placed on stats. The
 * rest (commercial, lifestyle, curve…) are open, and the talent's own declared
 * booking lanes decide whether they are listed.
 */

const BOARDS = require("../../../../../data/industry/v1/boards.json");
const { computeAge } = require("../../../../shared/lib/talent-age");

function genderKey(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "female" || g === "woman" || g === "women") return "female";
  if (g === "male" || g === "man" || g === "men") return "male";
  return null;
}

function num(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** One board's reading for this talent. */
function readBoard(board, { gender, heightCm, age, lanes }) {
  const declared = Boolean(board.lane && lanes.includes(board.lane));
  const base = {
    slug: board.slug,
    label: board.label,
    note: board.note,
    rule: board.rule,
    declared,
    range: null,
  };

  if (board.rule === "height") {
    const range = gender ? board.height?.[gender] : null;
    if (!board.height?.[gender] && gender) {
      // Petite is a women's board; it does not apply to a men's book.
      return { ...base, state: "not_applicable" };
    }
    if (!gender) return { ...base, state: "unknown", missing: "gender" };
    if (heightCm == null) return { ...base, range, state: "unknown", missing: "height" };
    const [min, max] = range;
    const state = heightCm < min ? "below" : heightCm > max ? "above" : "within";
    return { ...base, range, state };
  }

  if (board.rule === "age_from") {
    if (age == null) return { ...base, state: "unknown", missing: "date_of_birth" };
    return { ...base, ageFrom: board.ageFrom, state: age >= board.ageFrom ? "within" : "below" };
  }

  return { ...base, state: "open" };
}

function buildFiling(profile, { lanes = [], now = new Date() } = {}) {
  const gender = genderKey(profile.gender);
  const heightCm = num(profile.height_cm);
  const age = computeAge(profile.date_of_birth, now);
  const facts = { gender, heightCm, age, lanes };

  const boards = BOARDS.boards.map((b) => readBoard(b, facts)).filter((b) => b.state !== "not_applicable");

  // Filed for: a ranged board the stats sit inside, or an open board the
  // talent has declared. Never an open board they haven't chosen.
  const filed = boards.filter(
    (b) => (b.rule !== "open" && b.state === "within") || (b.rule === "open" && b.declared),
  );
  // A declared board whose typical range the stats sit outside. Said plainly,
  // with numbers, because applying there is the most common wasted effort.
  const declaredOutside = boards.filter(
    (b) => b.declared && (b.state === "below" || b.state === "above"),
  );
  // Fashion and runway are where most new faces aim first, so their range is
  // always shown when stats sit outside it, declared or not.
  const fashionOutside = boards.filter(
    (b) => !b.declared && ["editorial", "runway"].includes(b.slug) && (b.state === "below" || b.state === "above"),
  );

  // The measuring wall draws every ranged height board for this gender.
  const wall = gender
    ? BOARDS.boards
        .filter((b) => b.rule === "height" && b.height?.[gender])
        .map((b) => ({ slug: b.slug, label: b.label, range: b.height[gender] }))
    : [];

  return {
    facts: {
      gender,
      heightCm,
      age,
      lanes,
      missing: [
        gender ? null : "gender",
        heightCm == null ? "height" : null,
        age == null ? "date_of_birth" : null,
      ].filter(Boolean),
    },
    boards,
    filed: filed.map((b) => b.slug),
    declaredOutside: declaredOutside.map((b) => b.slug),
    fashionOutside: fashionOutside.map((b) => b.slug),
    wall,
    basis: BOARDS.basis,
    reviewedOn: BOARDS.reviewedOn,
  };
}

module.exports = { buildFiling, readBoard, genderKey };
