"use strict";

/**
 * Discover presentation — the booker-facing surface of the parsed contract.
 *
 * Everything a booker reads about a search is built here, in their own
 * language and never in field names (tasks/discover-audit-2026-09.md §4):
 *
 *   buildFilters()      the removable/editable chip strip ("5'9\" and up")
 *   roleSummary()       one line per role for the role switcher
 *   buildFacts()        per result, the declared values that answered the brief
 *   buildResultNotes()  per result, each miss or blank in plain words
 *   buildResponseNotes()at most two sentences about what the search could not do
 *
 * Rules for every string in this file: plain agency register, no em-dashes, no
 * field names, no exclamation marks, and never a number that ranks a person.
 */

const {
  tierFor,
  HERITAGE_LABELS,
  normalizeExperienceLevel,
} = require("./field-whitelist");
const { cmToFeetInches } = require("../../../../shared/lib/stats-formatter");
const { MARKET_LABELS } = require("../../../talent/services/market-resolve");
const { BOOKING_LANES } = require("../../../../shared/constants/booking-lanes");

const LANE_LABELS = Object.fromEntries(
  BOOKING_LANES.map((lane) => [lane.slug, lane.label]),
);

const CM_PER_IN = 2.54;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The order facts, notes and chips are read in (stats convention). */
const FIELD_ORDER = [
  "gender_presentation",
  "height_cm",
  "playing_age",
  "measurements.bust_cm",
  "measurements.chest_cm",
  "measurements.waist_cm",
  "measurements.hips_cm",
  "measurements.inseam_cm",
  "measurements.dress_size",
  "measurements.suit_size",
  "shoe",
  "location",
  "availability",
  "visible_tattoos",
  "boards",
  "hair_color",
  "eye_color",
  "heritage",
  "union",
  "representation_status",
  "experience_level",
];

const MEASUREMENT_LABELS = {
  "measurements.bust_cm": "Bust",
  "measurements.chest_cm": "Chest",
  "measurements.waist_cm": "Waist",
  "measurements.hips_cm": "Hips",
  "measurements.inseam_cm": "Inseam",
};

/** Sentence subject per field, for the whole-pool "not listed" note. */
const FIELD_SUBJECTS = {
  gender_presentation: "Gender",
  height_cm: "Height",
  playing_age: "Playing age",
  "measurements.bust_cm": "Bust",
  "measurements.chest_cm": "Chest",
  "measurements.waist_cm": "Waist",
  "measurements.hips_cm": "Hips",
  "measurements.inseam_cm": "Inseam",
  "measurements.dress_size": "Dress size",
  "measurements.suit_size": "Suit size",
  shoe: "Shoe size",
  location: "Market",
  availability: "Availability",
  visible_tattoos: "Tattoos",
  boards: "Boards",
  hair_color: "Hair color",
  eye_color: "Eye color",
  heritage: "Heritage",
  union: "Union status",
  representation_status: "Representation",
  experience_level: "Experience",
};

const GENDER_CHIP = { female: "Women", male: "Men", non_binary: "Non-binary" };
const GENDER_FACT = { female: "Woman", male: "Man", "non-binary": "Non-binary" };
const UNION_CHIP = {
  union: "Union",
  non_union: "Non-union",
  either: "Union or non-union",
};
const REPRESENTATION_LABELS = {
  unrepresented: "Unrepresented",
  seeking: "Seeking representation",
  represented: "Represented",
  exclusive_elsewhere: "Exclusive elsewhere",
};
const EXPERIENCE_CHIP = {
  new_face: "New faces",
  developing: "Developing",
  experienced: "Experienced",
  established: "Established",
};
const EXPERIENCE_FACT = {
  new_face: "New face",
  developing: "Developing",
  experienced: "Experienced",
  established: "Established",
};

// ── small formatters ─────────────────────────────────────────────────────────

function spanOffsets(brief, spanText) {
  if (!brief || !spanText) return null;
  const index = String(brief).indexOf(String(spanText));
  if (index < 0) return null;
  return [index, index + String(spanText).length];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bounds(constraint) {
  const c = constraint || {};
  if (c.value != null) {
    if (typeof c.value === "object") {
      return { a: num(c.value.a), b: num(c.value.b) };
    }
    return { a: num(c.value), b: null };
  }
  return { a: num(c.a), b: num(c.b) };
}

function cmToIn(cm) {
  const n = num(cm);
  return n == null ? null : Math.round(n / CM_PER_IN);
}

function capitalize(text) {
  const value = String(text || "");
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : "";
}

function joinOr(list) {
  const items = (list || []).filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function joinAnd(list) {
  const items = (list || []).filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function marketLabel(slug) {
  if (!slug) return null;
  return (
    MARKET_LABELS[String(slug).toLowerCase()] ||
    String(slug)
      .split("-")
      .map((part) => capitalize(part))
      .join(" ")
  );
}

function laneLabel(slug) {
  return LANE_LABELS[slug] || capitalize(String(slug || "").replace(/_/g, " "));
}

/** ISO date → "Jul 9". */
function formatDate(iso) {
  const text = String(iso || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}`;
}

/** ISO range → "Jul 9", "Jul 9 to 14", "Jul 30 to Aug 2". */
function formatDateRange(from, to) {
  const start = formatDate(from);
  if (!start) return null;
  const end = formatDate(to);
  if (!end || end === start) return start;
  const sameMonth = String(from).slice(0, 7) === String(to).slice(0, 7);
  return sameMonth ? `${start} to ${end.split(" ")[1]}` : `${start} to ${end}`;
}

function isApplied(constraint) {
  return !(
    constraint &&
    typeof constraint === "object" &&
    constraint.needs_confirmation === true
  );
}

// ── chip text ────────────────────────────────────────────────────────────────

function heightText(constraint) {
  const { a, b } = bounds(constraint);
  const low = cmToFeetInches(a);
  const high = cmToFeetInches(b);
  if (!low) return null;
  switch (constraint.op) {
    case "min":
      return `${low} and up`;
    case "max":
      return `Under ${low}`;
    case "between":
      return high ? `${low} to ${high}` : `${low} and up`;
    case "approx":
      return `Around ${low}`;
    case "exact":
      return low;
    default:
      return high ? `${low} to ${high}` : `${low} and up`;
  }
}

function playingAgeText(constraint) {
  const { a, b } = bounds(constraint);
  if (a == null && b == null) return null;
  if (a != null && b != null) return `Plays ${a} to ${b}`;
  if (constraint.op === "max") return `Plays up to ${a ?? b}`;
  if (constraint.op === "approx") return `Plays around ${a ?? b}`;
  if (constraint.op === "exact") return `Plays ${a ?? b}`;
  return `Plays ${a ?? b} and up`;
}

function measurementText(field, constraint) {
  const label = MEASUREMENT_LABELS[field];
  const { a, b } = bounds(constraint);
  if (a == null) return null;
  const one = `${Math.round(a)} cm (${cmToIn(a)} in)`;
  switch (constraint.op) {
    case "min":
      return `${label} ${one} and up`;
    case "max":
      return `${label} up to ${one}`;
    case "between":
      return b == null
        ? `${label} ${one}`
        : `${label} ${Math.round(a)} to ${Math.round(b)} cm (${cmToIn(a)} to ${cmToIn(b)} in)`;
    default:
      return `${label} ${one}`;
  }
}

function sizeText(prefix, size) {
  if (!size || size.value == null) return null;
  const region = size.region ? `${size.region} ` : "";
  return `${prefix} ${region}${size.value}`.replace(/\s+/g, " ").trim();
}

function availabilityText(windows) {
  const parts = [];
  for (const window of windows) {
    if (!window || !window.from) continue;
    const range = formatDateRange(window.from, window.to);
    if (!range) continue;
    parts.push(range.includes(" to ") ? range : `from ${range}`);
  }
  if (!parts.length) return null;
  return `Available ${parts.join(", ")}`;
}

function hairText(values) {
  const list = values.map((v, i) => (i === 0 ? capitalize(v) : String(v).toLowerCase()));
  return `${joinOr(list)} hair`;
}

function eyeText(values) {
  const list = values.map((v, i) => (i === 0 ? capitalize(v) : String(v).toLowerCase()));
  return `${joinOr(list)} eyes`;
}

function heritageText(slugs) {
  return joinOr(slugs.map((slug) => HERITAGE_LABELS[slug] || capitalize(slug)));
}

function locationText(location) {
  const label = marketLabel(location.market);
  if (!label) return null;
  return location.local_only === true ? `${label}, local only` : label;
}

// ── the filter strip ─────────────────────────────────────────────────────────

function chip(field, options) {
  return {
    id: options.id || field,
    field,
    op: options.op ?? null,
    value: options.value ?? null,
    text: options.text,
    span: options.span ?? null,
    editable: options.editable ?? null,
    unit: options.unit ?? null,
    edit_value: options.edit_value ?? null,
    tier: tierFor(field),
  };
}

/**
 * The chip strip. One entry per APPLIED requirement, in booker language, with
 * the provenance span and the edit affordance the filter bar needs.
 *
 * @param {string} brief — the raw query text (for span offsets)
 * @param {object} hard — a validated role's `hard` block
 * @returns {Array<object>}
 */
function buildFilters(brief, hard) {
  const h = hard || {};
  const out = [];

  if (Array.isArray(h.gender_presentation) && h.gender_presentation.length) {
    out.push(
      chip("gender_presentation", {
        value: h.gender_presentation,
        text: joinOr(h.gender_presentation.map((g) => GENDER_CHIP[g] || capitalize(g))),
      }),
    );
  }

  if (h.height_cm && isApplied(h.height_cm)) {
    const text = heightText(h.height_cm);
    const { a, b } = bounds(h.height_cm);
    if (text) {
      out.push(
        chip("height_cm", {
          op: h.height_cm.op || null,
          value: { a, b },
          text,
          span: spanOffsets(brief, h.height_cm.span),
          editable: "number",
          unit: "cm",
          edit_value: a == null ? null : String(a),
        }),
      );
    }
  }

  if (h.playing_age && isApplied(h.playing_age)) {
    const text = playingAgeText(h.playing_age);
    const { a, b } = bounds(h.playing_age);
    if (text) {
      out.push(
        chip("playing_age", {
          op: h.playing_age.op || null,
          value: { a, b },
          text,
          span: spanOffsets(brief, h.playing_age.span),
          editable: "number",
          unit: "years",
          edit_value: a == null ? null : String(a),
        }),
      );
    }
  }

  if (h.measurements && typeof h.measurements === "object") {
    for (const field of [
      "measurements.bust_cm",
      "measurements.chest_cm",
      "measurements.waist_cm",
      "measurements.hips_cm",
      "measurements.inseam_cm",
    ]) {
      const key = field.split(".")[1];
      const constraint = h.measurements[key];
      if (!constraint || !isApplied(constraint)) continue;
      const text = measurementText(field, constraint);
      const { a, b } = bounds(constraint);
      if (!text) continue;
      out.push(
        chip(field, {
          op: constraint.op || null,
          value: { a, b },
          text,
          span: spanOffsets(brief, constraint.span),
          editable: "number",
          unit: "cm",
          edit_value: a == null ? null : String(a),
        }),
      );
    }
    for (const [key, prefix] of [
      ["dress_size", "Dress"],
      ["suit_size", "Suit"],
    ]) {
      const size = h.measurements[key];
      if (!size || size.value == null || !isApplied(size)) continue;
      const text = sizeText(prefix, size);
      if (!text) continue;
      out.push(
        chip(`measurements.${key}`, {
          value: { value: size.value, region: size.region ?? null },
          text,
          span: spanOffsets(brief, size.span),
          editable: "number",
          unit: size.region || null,
          edit_value: String(size.value),
        }),
      );
    }
  }

  if (h.shoe && h.shoe.size != null && isApplied(h.shoe)) {
    out.push(
      chip("shoe", {
        value: { size: h.shoe.size, region: h.shoe.region ?? null },
        text: `Shoe ${h.shoe.region ? `${h.shoe.region} ` : ""}${h.shoe.size}`,
        span: spanOffsets(brief, h.shoe.span),
        editable: "number",
        unit: h.shoe.region || null,
        edit_value: String(h.shoe.size),
      }),
    );
  }

  if (h.location && h.location.market) {
    const text = locationText(h.location);
    if (text) {
      out.push(
        chip("location", {
          value: h.location.market,
          text,
          span: spanOffsets(brief, h.location.span),
        }),
      );
    }
  }

  if (Array.isArray(h.availability) && h.availability.length) {
    const applied = h.availability.filter(isApplied);
    const text = availabilityText(applied);
    if (text) {
      const first = applied.find((w) => w && w.from);
      out.push(
        chip("availability", {
          value: applied.map((w) => ({
            kind: w.kind,
            from: w.from ?? null,
            to: w.to ?? null,
          })),
          text,
          span: spanOffsets(brief, applied.map((w) => w.span).find(Boolean) || null),
          editable: "date",
          edit_value: first ? first.from : null,
        }),
      );
    }
  }

  if (h.visible_tattoos === true || h.visible_tattoos === false) {
    out.push(
      chip("visible_tattoos", {
        value: h.visible_tattoos,
        text: h.visible_tattoos ? "Visible tattoos" : "No visible tattoos",
      }),
    );
  }

  if (Array.isArray(h.boards) && h.boards.length) {
    out.push(
      chip("boards", {
        value: h.boards,
        text: joinOr(h.boards.map(laneLabel)),
      }),
    );
  }

  if (Array.isArray(h.hair_color) && h.hair_color.length) {
    out.push(chip("hair_color", { value: h.hair_color, text: hairText(h.hair_color) }));
  }

  if (Array.isArray(h.eye_color) && h.eye_color.length) {
    out.push(chip("eye_color", { value: h.eye_color, text: eyeText(h.eye_color) }));
  }

  if (Array.isArray(h.heritage) && h.heritage.length) {
    out.push(chip("heritage", { value: h.heritage, text: heritageText(h.heritage) }));
  }

  if (h.union) {
    out.push(
      chip("union", { value: h.union, text: UNION_CHIP[h.union] || capitalize(h.union) }),
    );
  }

  if (Array.isArray(h.representation_status) && h.representation_status.length) {
    out.push(
      chip("representation_status", {
        value: h.representation_status,
        text: joinOr(
          h.representation_status.map(
            (status) => REPRESENTATION_LABELS[status] || capitalize(status),
          ),
        ),
      }),
    );
  }

  if (h.experience_level) {
    out.push(
      chip("experience_level", {
        value: h.experience_level,
        text: EXPERIENCE_CHIP[h.experience_level] || capitalize(h.experience_level),
      }),
    );
  }

  return out;
}

/** One line describing a role, for the role switcher. */
function roleSummary(role, brief) {
  const texts = buildFilters(brief || "", role && role.hard).map((f) => f.text);
  if (texts.length) return texts.join(", ");
  const soft = String((role && role.soft_query) || "").trim();
  return soft || "Everyone";
}

// ── per-result facts ─────────────────────────────────────────────────────────

function heightFact(profile) {
  return cmToFeetInches(profile.height_cm);
}

function playingAgeFact(profile) {
  const min = num(profile.playing_age_min);
  const max = num(profile.playing_age_max);
  if (min != null && max != null) return `Plays ${min} to ${max}`;
  if (min != null) return `Plays ${min} and up`;
  if (max != null) return `Plays up to ${max}`;
  return null;
}

function measurementFact(field, value) {
  const cm = num(value);
  if (cm == null) return null;
  return `${MEASUREMENT_LABELS[field]} ${Math.round(cm)} cm (${cmToIn(cm)} in)`;
}

function unionFact(membership) {
  const text = String(membership || "").toLowerCase();
  if (!text.trim()) return null;
  return /non|none|not?\b|independent/.test(text) ? "Non-union" : "Union";
}

function experienceFact(value) {
  const slug = normalizeExperienceLevel(value);
  return slug ? EXPERIENCE_FACT[slug] : null;
}

/**
 * The declared values that answered the brief, in stats convention order.
 * Only ever the talent's own data, and only for requirements they passed.
 */
function buildFacts(evaluations, profile, hard) {
  const p = profile || {};
  const h = hard || {};
  const byField = new Map((evaluations || []).map((e) => [e.field, e]));
  const facts = [];
  const add = (text) => {
    if (text && !facts.includes(text)) facts.push(text);
  };

  for (const field of FIELD_ORDER) {
    const evaluation = byField.get(field);
    if (!evaluation || evaluation.status !== "pass") continue;

    if (field === "gender_presentation") {
      const key = String(p.gender || "").toLowerCase();
      add(GENDER_FACT[key] || (p.gender ? capitalize(p.gender) : null));
    } else if (field === "height_cm") {
      add(heightFact(p));
    } else if (field === "playing_age") {
      add(playingAgeFact(p));
    } else if (MEASUREMENT_LABELS[field]) {
      add(measurementFact(field, p[field.split(".")[1]]));
    } else if (field === "measurements.dress_size") {
      const region = h.measurements?.dress_size?.region;
      add(`Dress ${region ? `${region} ` : ""}${p.dress_size}`.trim());
    } else if (field === "measurements.suit_size") {
      const region = h.measurements?.suit_size?.region;
      add(`Suit ${region ? `${region} ` : ""}${p.suit_size}`.trim());
    } else if (field === "shoe") {
      const actual = evaluation.actual || {};
      if (actual.size != null) {
        add(`Shoe ${actual.region ? `${actual.region} ` : ""}${actual.size}`.trim());
      }
    } else if (field === "location") {
      add(marketLabel(p.market));
    } else if (field === "availability") {
      add("Available");
    } else if (field === "visible_tattoos") {
      add(h.visible_tattoos ? "Visible tattoos" : "No visible tattoos");
    } else if (field === "boards") {
      const have = Array.isArray(evaluation.actual) ? evaluation.actual : [];
      const matched = have.filter((slug) => (h.boards || []).includes(slug));
      add(joinAnd((matched.length ? matched : have).map(laneLabel)));
    } else if (field === "hair_color") {
      add(`${capitalize(p.hair_color)} hair`);
    } else if (field === "eye_color") {
      add(`${capitalize(p.eye_color)} eyes`);
    } else if (field === "heritage") {
      const actual = evaluation.actual || {};
      const slugs = Array.isArray(actual.slugs) ? actual.slugs : [];
      const matched = slugs.filter((slug) => (h.heritage || []).includes(slug));
      add(
        joinAnd(
          (matched.length ? matched : slugs).map((slug) => HERITAGE_LABELS[slug] || slug),
        ),
      );
    } else if (field === "union") {
      add(unionFact(p.union_membership));
    } else if (field === "representation_status") {
      add(REPRESENTATION_LABELS[evaluation.actual] || null);
    } else if (field === "experience_level") {
      add(experienceFact(p.experience_level));
    }
  }

  return facts;
}

// ── per-result notes ─────────────────────────────────────────────────────────

function heightMissNote(profile, constraint) {
  const actual = num(profile.height_cm);
  const feet = cmToFeetInches(actual);
  if (actual == null || !feet) return "Height not listed";
  const { a, b } = bounds(constraint);
  const lo = a;
  const hi = b == null ? a : b;
  let diffIn = null;
  let direction = null;
  if (constraint.op === "max") {
    diffIn = (actual - lo) / CM_PER_IN;
    direction = "over";
  } else if (constraint.op === "between") {
    if (actual < Math.min(lo, hi)) {
      diffIn = (Math.min(lo, hi) - actual) / CM_PER_IN;
      direction = "under";
    } else {
      diffIn = (actual - Math.max(lo, hi)) / CM_PER_IN;
      direction = "over";
    }
  } else if (actual < lo) {
    diffIn = (lo - actual) / CM_PER_IN;
    direction = "under";
  } else {
    diffIn = (actual - lo) / CM_PER_IN;
    direction = "over";
  }
  const inches = Math.max(1, Math.round(Math.abs(diffIn)));
  return `${feet}, ${inches} in ${direction}`;
}

/**
 * Each miss or blank, in plain booker language. Never prints a talent's
 * heritage on a miss (only as a fact on a pass).
 */
function buildResultNotes(evaluations, profile, hard) {
  const p = profile || {};
  const h = hard || {};
  const byField = new Map((evaluations || []).map((e) => [e.field, e]));
  const notes = [];
  const add = (text) => {
    if (text && !notes.includes(text)) notes.push(text);
  };

  for (const field of FIELD_ORDER) {
    const evaluation = byField.get(field);
    if (!evaluation || evaluation.status === "pass") continue;
    const unknown = evaluation.status === "unknown";

    switch (field) {
      case "gender_presentation":
        add("Gender not listed");
        break;
      case "height_cm":
        add(unknown ? "Height not listed" : heightMissNote(p, h.height_cm));
        break;
      case "playing_age":
        add(unknown ? "Playing age not listed" : playingAgeFact(p));
        break;
      case "measurements.bust_cm":
      case "measurements.chest_cm":
      case "measurements.waist_cm":
      case "measurements.hips_cm":
      case "measurements.inseam_cm":
        add(
          unknown
            ? `${MEASUREMENT_LABELS[field]} not listed`
            : measurementFact(field, p[field.split(".")[1]]),
        );
        break;
      case "measurements.dress_size":
        add(unknown ? "Dress size not listed" : `Dress US ${p.dress_size}`);
        break;
      case "measurements.suit_size":
        add(unknown ? "Suit size not listed" : `Suit US ${p.suit_size}`);
        break;
      case "shoe": {
        const actual = evaluation.actual || {};
        add(
          unknown || actual.size == null
            ? "Shoe size not listed"
            : `Shoe ${actual.region ? `${actual.region} ` : "US "}${actual.size}`,
        );
        break;
      }
      case "location":
        add(unknown ? "Market not listed" : `Based in ${marketLabel(p.market)}`);
        break;
      case "availability": {
        const actual = evaluation.actual || {};
        if (unknown) add("Availability not listed");
        else if (actual.overlap) {
          const range = formatDateRange(actual.overlap.starts_on, actual.overlap.ends_on);
          add(range ? `Booked out ${range}` : "Booked out");
        } else add("Marked unavailable");
        break;
      }
      case "visible_tattoos":
        if (unknown) add("Tattoos not listed");
        else add(h.visible_tattoos === false ? "Has visible tattoos" : "No visible tattoos");
        break;
      case "boards": {
        const have = Array.isArray(evaluation.actual) ? evaluation.actual : [];
        if (unknown || !have.length) add("Board not listed");
        else {
          const labels = have.map(laneLabel);
          add(`${joinAnd(labels)} ${labels.length > 1 ? "boards" : "board"}`);
        }
        break;
      }
      case "hair_color":
        add(unknown ? "Hair color not listed" : `${capitalize(p.hair_color)} hair`);
        break;
      case "eye_color":
        add(unknown ? "Eye color not listed" : `${capitalize(p.eye_color)} eyes`);
        break;
      case "heritage":
        // A miss never prints what the talent declared.
        add(unknown ? "Heritage not listed" : "Heritage differs");
        break;
      case "union":
        add(unknown ? "Union status not listed" : unionFact(p.union_membership));
        break;
      case "representation_status":
        if (unknown) add("Representation not listed");
        else if (
          evaluation.actual === "represented" ||
          evaluation.actual === "exclusive_elsewhere"
        )
          add("Represented elsewhere");
        else add(REPRESENTATION_LABELS[evaluation.actual] || "Representation not listed");
        break;
      case "experience_level":
        add(unknown ? "Experience not listed" : experienceFact(p.experience_level));
        break;
      default:
        break;
    }
  }

  return notes;
}

// ── response notes ───────────────────────────────────────────────────────────

const UNREADABLE_NOTES = {
  height_cm:
    "The height in the brief couldn't be read, so it wasn't used. State it as 5'9\" or 175 cm.",
  playing_age:
    "The playing age in the brief couldn't be read, so it wasn't used. State it as 22 to 30.",
  shoe: "The shoe size in the brief couldn't be read, so it wasn't used. State it as US 9.",
  "measurements.dress_size":
    "The dress size in the brief couldn't be read, so it wasn't used. State it as US 4.",
  "measurements.suit_size":
    "The suit size in the brief couldn't be read, so it wasn't used. State it as US 40.",
  availability:
    "The dates in the brief couldn't be read, so they weren't used. State them as Jul 9 to 14.",
};

function unreadableNote(field) {
  if (UNREADABLE_NOTES[field]) return UNREADABLE_NOTES[field];
  if (field.startsWith("availability")) return UNREADABLE_NOTES.availability;
  if (field.startsWith("measurements.")) {
    const label = (MEASUREMENT_LABELS[field] || "measurement").toLowerCase();
    return `The ${label} in the brief couldn't be read, so it wasn't used. State it in cm or inches.`;
  }
  return null;
}

/**
 * At most two plain sentences about what the search could not do. This is the
 * only place the product talks about the data instead of the talent.
 *
 * @param {object} opts
 * @param {Array}  opts.needsConfirmation — validate-contract's report
 * @param {Array}  opts.setAside — unsupported asks (skin tone)
 * @param {boolean} opts.credentialAsked
 * @param {Array<string>} opts.poolUnknownFields — applied fields blank for the
 *   whole eligible pool
 */
function buildResponseNotes(opts = {}) {
  const notes = [];
  const add = (text) => {
    if (text && !notes.includes(text)) notes.push(text);
  };

  for (const entry of opts.needsConfirmation || []) {
    add(unreadableNote(entry.field || ""));
  }

  if (opts.credentialAsked) {
    add(
      "Tearsheets and show credits aren't listed on profiles yet, so that part of the brief wasn't used.",
    );
  }

  if ((opts.setAside || []).length) {
    add("Skin tone isn't a profile field, so it wasn't used.");
  }

  for (const field of opts.poolUnknownFields || []) {
    const subject = FIELD_SUBJECTS[field];
    if (subject) add(`${subject} isn't listed on any profile yet.`);
  }

  return notes.slice(0, 2);
}

module.exports = {
  spanOffsets,
  buildFilters,
  roleSummary,
  buildFacts,
  buildResultNotes,
  buildResponseNotes,
  // formatting helpers (test surface)
  formatDate,
  formatDateRange,
  heightText,
  playingAgeText,
  measurementText,
  marketLabel,
  laneLabel,
  FIELD_ORDER,
  FIELD_SUBJECTS,
};
