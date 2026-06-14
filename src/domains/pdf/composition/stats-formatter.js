/**
 * Comp Card Stats Formatter (composition engine, WS-A)
 *
 * Pure, deterministic formatting of a talent profile's physical stats into an
 * agency-grade comp-card stats block. No DB access, no external dependencies.
 *
 * Industry rules implemented (see tasks/comp-card-composition-spec.md):
 *   - Women order: Height, Bust, Waist, Hips, Dress, Shoes, Hair, Eyes.
 *   - Men order:   Height, Chest, Waist, Inseam, Suit, Shoes, Hair, Eyes.
 *     Suit = chest-in-inches + length letter: S (< 173cm), R (173–183cm),
 *     L (> 183cm) → e.g. `40R`.
 *   - Kids (< 18): Age, Height, Clothing Size, Shoes, Hair, Eyes.
 *     No bust/waist/hips. Age IS shown (only for kids).
 *   - Dual units default: `178 cm / 5'10"`, `86 cm / 34"` (inches rounded to
 *     the nearest half, ½ rendered as `.5`).
 *   - Shoe dual: `US 9 / EU 40` (women EU ≈ US + 31, men EU ≈ US + 33).
 *   - Dress dual: `US 4 / EU 36` (EU ≈ US + 32).
 *   - NEVER printed: age/DOB for adults, weight (unless fitness), address.
 *   - Missing values: line is skipped (never a placeholder) + a warning.
 *
 * Resolved ambiguities (documented decisions):
 *   - Kids (< 18) wins over gender when auto-resolving the category — a
 *     12-year-old boy still gets the kids track.
 *   - Fitness weight line is placed immediately after Height (common on
 *     fitness cards). Kids never get a weight line, fitness or not.
 *   - Kids clothing size and kids shoe sizes are rendered without US↔EU
 *     conversion (adult offsets do not apply to children's sizing).
 *   - A bare numeric shoe size ≥ 32 is assumed to be EU (US adult sizes top
 *     out well below 32; EU sizing starts around 32).
 *   - Suit size is rendered identically in all unit modes (it is an
 *     imperial-native convention with no metric form).
 */

const CM_PER_INCH = 2.54;
const LBS_PER_KG = 2.20462;

/** Suit length letter boundaries (height, cm): S < 173, R 173–183, L > 183. */
const SUIT_SHORT_BELOW_CM = 173;
const SUIT_REGULAR_MAX_CM = 183;

/** EU ≈ US shoe-size offsets by presentation track. */
const SHOE_EU_OFFSET = { women: 31, men: 33 };
/** EU ≈ US + 32 for dresses. */
const DRESS_EU_OFFSET = 32;

/** Bare numeric shoe sizes at/above this are assumed to already be EU. */
const EU_SHOE_ASSUME_THRESHOLD = 32;

const VALID_UNITS = new Set(["dual", "imperial", "metric"]);
const VALID_CATEGORIES = new Set(["women", "men", "kids"]);

/** Legacy `measurements` values ≤ 50 are inches; larger values are cm. */
const MEASUREMENT_INCH_MAX = 50;

const KIDS_AGE_MAX = 18;

/**
 * Coerce a value to a finite positive number, else null.
 * @param {*} value
 * @returns {number|null}
 */
function toPositiveNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Render a number without a trailing `.0` (JS default `${40}` / `${40.5}`).
 * @param {number} n
 * @returns {string}
 */
function fmtNum(n) {
  return String(n);
}

/**
 * Title-case a free-text descriptor ("dark brown" → "Dark Brown",
 * "blue-green" → "Blue-Green").
 * @param {*} raw
 * @returns {string|null} Title-cased string, or null when empty/missing.
 */
function titleCase(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Convert centimeters to a feet-inches string with no space: `5'10"`.
 * Total inches are rounded to the nearest whole inch (carrying 12" → 1').
 * @param {*} cm
 * @returns {string|null} e.g. `5'10"`, or null for missing/invalid input.
 */
function cmToFeetInches(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  const totalInches = Math.round(n / CM_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return `${feet}'${inches}"`;
}

/**
 * Convert centimeters to inches rounded to the nearest half inch.
 * @param {*} cm
 * @returns {number|null} e.g. 34 or 34.5, or null for missing/invalid input.
 */
function cmToInchesHalf(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  return Math.round((n / CM_PER_INCH) * 2) / 2;
}

/**
 * Parse a raw shoe-size string.
 * Accepts: "9", "9.5", "9.5 US", "US 9.5", "40 EU", "EU 40".
 * Bare numerics ≥ EU_SHOE_ASSUME_THRESHOLD are assumed EU.
 * @param {*} raw
 * @returns {{ numeric: boolean, system?: 'us'|'eu', value?: number, raw: string }|null}
 */
function parseShoeSize(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(?:(us|eu)\s*)?(\d+(?:\.\d+)?)(?:\s*(us|eu))?$/i);
  if (!m) return { numeric: false, raw: s };
  const value = parseFloat(m[2]);
  let system = (m[1] || m[3] || "").toLowerCase();
  if (!system) {
    system = value >= EU_SHOE_ASSUME_THRESHOLD ? "eu" : "us";
  }
  return { numeric: true, system, value, raw: s };
}

/**
 * Render a shoe size for the given track and unit mode.
 * @param {*} raw — raw `shoe_size` value
 * @param {'women'|'men'|'kids'} category
 * @param {'dual'|'imperial'|'metric'} units
 * @returns {string|null} e.g. `US 9 / EU 40`; raw string when non-numeric;
 *   null when missing.
 */
function renderShoe(raw, category, units) {
  const parsed = parseShoeSize(raw);
  if (!parsed) return null;
  if (!parsed.numeric) return parsed.raw;

  // Kids sizing has no reliable adult US↔EU offset: render natively.
  if (category === "kids") {
    const prefix = parsed.system === "eu" ? "EU" : "US";
    return `${prefix} ${fmtNum(parsed.value)}`;
  }

  const offset = SHOE_EU_OFFSET[category] ?? SHOE_EU_OFFSET.women;
  const us = parsed.system === "eu" ? parsed.value - offset : parsed.value;
  const eu = parsed.system === "eu" ? parsed.value : parsed.value + offset;

  if (units === "imperial") return `US ${fmtNum(us)}`;
  if (units === "metric") return `EU ${fmtNum(eu)}`;
  return `US ${fmtNum(us)} / EU ${fmtNum(eu)}`;
}

/**
 * Dual-unit shoe string: `US 9 / EU 40`.
 * Women EU ≈ US + 31; men EU ≈ US + 33. Non-numeric input renders as-is.
 * @param {*} raw — raw `shoe_size` value
 * @param {'women'|'men'|'kids'} [category='women']
 * @returns {string|null}
 */
function shoeDual(raw, category = "women") {
  return renderShoe(raw, category, "dual");
}

/**
 * Render a dress size for a unit mode. Numeric US sizes convert to EU via
 * +32; non-numeric sizes ("S") render as-is, US only.
 * @param {*} raw — raw `dress_size` value (US convention)
 * @param {'dual'|'imperial'|'metric'} units
 * @returns {string|null}
 */
function renderDress(raw, units) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (!m) return s;
  const us = parseFloat(m[1]);
  const eu = us + DRESS_EU_OFFSET;
  if (units === "imperial") return `US ${fmtNum(us)}`;
  if (units === "metric") return `EU ${fmtNum(eu)}`;
  return `US ${fmtNum(us)} / EU ${fmtNum(eu)}`;
}

/**
 * Dual-unit dress string: `US 4 / EU 36` (EU ≈ US + 32).
 * Non-numeric input ("S") renders as-is.
 * @param {*} raw — raw `dress_size` value
 * @returns {string|null}
 */
function dressDual(raw) {
  return renderDress(raw, "dual");
}

/**
 * Compute age in whole years from a DOB string. Handles both `"2012-03-15"`
 * and the PostgreSQL quirk `"2012-03-15T05:00:00.000Z"` by reading only the
 * leading date part (UTC-safe).
 * @param {*} dob — date_of_birth value
 * @param {Date} ref — reference "now"
 * @returns {number|null}
 */
function ageFromDob(dob, ref) {
  if (dob == null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob).trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let age = ref.getUTCFullYear() - year;
  const beforeBirthday =
    ref.getUTCMonth() + 1 < month ||
    (ref.getUTCMonth() + 1 === month && ref.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Resolve the talent's age from the `age` column, falling back to
 * `date_of_birth`.
 * @param {object} profile
 * @param {Date} ref
 * @returns {number|null}
 */
function resolveAge(profile, ref) {
  const direct = toPositiveNumber(profile?.age);
  if (direct != null) return Math.floor(direct);
  return ageFromDob(profile?.date_of_birth, ref);
}

/**
 * Parse the legacy `measurements` string ("32-25-35", B-W-H). Values ≤ 50
 * are inches and are converted to cm; values > 50 are already cm. Results
 * are rounded to whole cm.
 * @param {*} raw
 * @returns {{ bust: number|null, waist: number|null, hips: number|null }}
 */
function parseMeasurements(raw) {
  const empty = { bust: null, waist: null, hips: null };
  if (raw == null) return empty;
  const m = String(raw)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (!m) return empty;
  const toCm = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n <= MEASUREMENT_INCH_MAX ? n * CM_PER_INCH : n);
  };
  return { bust: toCm(m[1]), waist: toCm(m[2]), hips: toCm(m[3]) };
}

/**
 * Resolve the presentation track for a profile.
 * Precedence: kids (< 18, from `age` or `date_of_birth`) → gender (Male →
 * 'men', Female → 'women', case-insensitive) → measurement heuristic for
 * non-binary/unknown gender (bust present → 'women', else 'men').
 * @param {object} profile
 * @param {Date} [referenceDate] — "now" override (test hook)
 * @returns {'women'|'men'|'kids'}
 */
function resolveStatsCategory(profile, referenceDate) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date();
  const age = resolveAge(profile || {}, ref);
  if (age != null && age < KIDS_AGE_MAX) return "kids";

  const gender = String(profile?.gender ?? "")
    .trim()
    .toLowerCase();
  if (gender === "male") return "men";
  if (gender === "female") return "women";

  const legacy = parseMeasurements(profile?.measurements);
  const bust = toPositiveNumber(profile?.bust_cm) ?? legacy.bust;
  return bust != null ? "women" : "men";
}

/**
 * Detect fitness/athletic signals. Accepts an array of strings, a single
 * string, or an object with `marketSignals[]`, `lookType`,
 * `archetypeLabel`/`archetype_label` fields (castingAnalysis shape).
 * @param {*} signals — `options.signals`
 * @returns {boolean}
 */
function detectFitness(signals) {
  if (!signals) return false;
  const tokens = [];
  if (Array.isArray(signals)) {
    tokens.push(...signals);
  } else if (typeof signals === "string") {
    tokens.push(signals);
  } else if (typeof signals === "object") {
    if (Array.isArray(signals.marketSignals)) {
      tokens.push(...signals.marketSignals);
    }
    if (signals.lookType != null) tokens.push(signals.lookType);
    if (signals.archetypeLabel != null) tokens.push(signals.archetypeLabel);
    if (signals.archetype_label != null) tokens.push(signals.archetype_label);
  }
  return tokens.some((t) => /fitness|athletic/i.test(String(t)));
}

/**
 * Render a height value for a unit mode.
 * @param {number} cm — height in cm (already validated)
 * @param {'dual'|'imperial'|'metric'} units
 * @returns {string} e.g. `178 cm / 5'10"`
 */
function renderHeight(cm, units) {
  const rounded = Math.round(cm);
  const imperial = cmToFeetInches(cm);
  if (units === "imperial") return imperial;
  if (units === "metric") return `${rounded} cm`;
  return `${rounded} cm / ${imperial}`;
}

/**
 * Render a girth/length measurement (bust/chest/waist/hips/inseam).
 * @param {number} cm
 * @param {'dual'|'imperial'|'metric'} units
 * @returns {string} e.g. `86 cm / 34"`
 */
function renderGirth(cm, units) {
  const rounded = Math.round(cm);
  const inches = cmToInchesHalf(cm);
  if (units === "imperial") return `${fmtNum(inches)}"`;
  if (units === "metric") return `${rounded} cm`;
  return `${rounded} cm / ${fmtNum(inches)}"`;
}

/**
 * Render a weight value for a unit mode (`64 kg / 141 lbs`).
 * @param {number|null} kg
 * @param {number|null} lbs
 * @param {'dual'|'imperial'|'metric'} units
 * @returns {string|null}
 */
function renderWeight(kg, lbs, units) {
  let kgVal = kg;
  let lbsVal = lbs;
  if (kgVal == null && lbsVal == null) return null;
  if (kgVal == null) kgVal = lbsVal / LBS_PER_KG;
  if (lbsVal == null) lbsVal = kgVal * LBS_PER_KG;
  const kgR = Math.round(kgVal);
  const lbsR = Math.round(lbsVal);
  if (units === "imperial") return `${lbsR} lbs`;
  if (units === "metric") return `${kgR} kg`;
  return `${kgR} kg / ${lbsR} lbs`;
}

/**
 * Derive a men's suit size (`40R`): chest in whole inches + length letter
 * from height — S (< 173cm), R (173–183cm), L (> 183cm).
 * @param {number|null} chestCm
 * @param {number|null} heightCm
 * @returns {string|null} null when chest or height is missing.
 */
function deriveSuitSize(chestCm, heightCm) {
  if (chestCm == null || heightCm == null) return null;
  const chestIn = Math.round(chestCm / CM_PER_INCH);
  let letter;
  if (heightCm < SUIT_SHORT_BELOW_CM) letter = "S";
  else if (heightCm <= SUIT_REGULAR_MAX_CM) letter = "R";
  else letter = "L";
  return `${chestIn}${letter}`;
}

/**
 * Build the ordered, render-ready stats block for a profile.
 *
 * @param {object} profile — profiles row (gender, date_of_birth, age,
 *   height_cm, bust_cm, waist_cm, hips_cm, inseam_cm, measurements,
 *   shoe_size, dress_size, hair_color, eye_color, weight_kg, weight_lbs, …)
 * @param {object} [options]
 * @param {'dual'|'imperial'|'metric'} [options.units='dual']
 * @param {'women'|'men'|'kids'} [options.category] — explicit override;
 *   omitted → auto-resolved via resolveStatsCategory()
 * @param {*} [options.signals] — fitness detection input (castingAnalysis
 *   marketSignals/lookType/archetype label, array, or string); keeps the
 *   formatter pure (caller fetches, formatter never touches the DB)
 * @param {Date} [options.referenceDate] — "now" override for age math (test hook)
 * @returns {{
 *   category: 'women'|'men'|'kids',
 *   isFitness: boolean,
 *   units: 'dual'|'imperial'|'metric',
 *   lines: Array<{ key: string, label: string, value: string }>,
 *   inline: string,
 *   omitted: Array<{ key: string, reason: string }>,
 *   warnings: string[],
 * }}
 */
function buildStatsBlock(profile, options) {
  const p = profile && typeof profile === "object" ? profile : {};
  const opts = options && typeof options === "object" ? options : {};

  const units = VALID_UNITS.has(opts.units) ? opts.units : "dual";
  const ref =
    opts.referenceDate instanceof Date ? opts.referenceDate : new Date();

  const warnings = [];
  const omitted = [];
  const lines = [];

  // --- Category resolution -------------------------------------------------
  let category;
  if (VALID_CATEGORIES.has(opts.category)) {
    category = opts.category;
  } else {
    category = resolveStatsCategory(p, ref);
    const gender = String(p.gender ?? "")
      .trim()
      .toLowerCase();
    const age = resolveAge(p, ref);
    const isKid = age != null && age < KIDS_AGE_MAX;
    if (!isKid && gender !== "male" && gender !== "female") {
      warnings.push(
        `Gender missing or non-binary — '${category}' track inferred from available measurements.`,
      );
    }
  }

  const isFitness = detectFitness(opts.signals);

  // --- Field sourcing (prefer *_cm columns, fall back to legacy string) ----
  const legacy = parseMeasurements(p.measurements);
  const heightCm = toPositiveNumber(p.height_cm);
  const bustCm = toPositiveNumber(p.bust_cm) ?? legacy.bust;
  const waistCm = toPositiveNumber(p.waist_cm) ?? legacy.waist;
  const hipsCm = toPositiveNumber(p.hips_cm) ?? legacy.hips;
  const inseamCm = toPositiveNumber(p.inseam_cm);
  const weightKg = toPositiveNumber(p.weight_kg);
  const weightLbs = toPositiveNumber(p.weight_lbs);
  const age = resolveAge(p, ref);
  const hair = titleCase(p.hair_color);
  const eyes = titleCase(p.eye_color);

  /**
   * Push a line, or record a warning when its value is missing.
   * @param {string} key
   * @param {string} label — already UPPERCASE
   * @param {string|null} value
   * @param {string} missingNote
   */
  function pushLine(key, label, value, missingNote) {
    if (value == null || value === "") {
      warnings.push(missingNote);
      return;
    }
    lines.push({ key, label, value });
  }

  /** Append the fitness weight line (never for kids). */
  function pushWeight() {
    if (!isFitness || category === "kids") return;
    const value = renderWeight(weightKg, weightLbs, units);
    pushLine(
      "weight",
      "WEIGHT",
      value,
      "Weight missing — fitness card has no weight line.",
    );
  }

  // --- Lines per track ------------------------------------------------------
  if (category === "kids") {
    pushLine(
      "age",
      "AGE",
      age != null ? String(age) : null,
      "Age missing (no age or date_of_birth) — age line skipped.",
    );
    pushLine(
      "height",
      "HEIGHT",
      heightCm != null ? renderHeight(heightCm, units) : null,
      "Height missing — height line skipped.",
    );
    const clothing =
      p.dress_size != null && String(p.dress_size).trim() !== ""
        ? String(p.dress_size).trim()
        : null;
    pushLine(
      "clothing_size",
      "CLOTHING SIZE",
      clothing,
      "Clothing size missing — line skipped.",
    );
    pushLine(
      "shoes",
      "SHOES",
      renderShoe(p.shoe_size, category, units),
      "Shoe size missing — line skipped.",
    );
  } else if (category === "men") {
    pushLine(
      "height",
      "HEIGHT",
      heightCm != null ? renderHeight(heightCm, units) : null,
      "Height missing — height line skipped.",
    );
    pushWeight();
    pushLine(
      "chest",
      "CHEST",
      bustCm != null ? renderGirth(bustCm, units) : null,
      "Chest missing — line skipped.",
    );
    pushLine(
      "waist",
      "WAIST",
      waistCm != null ? renderGirth(waistCm, units) : null,
      "Waist missing — line skipped.",
    );
    pushLine(
      "inseam",
      "INSEAM",
      inseamCm != null ? renderGirth(inseamCm, units) : null,
      "Inseam missing — line skipped.",
    );
    pushLine(
      "suit",
      "SUIT",
      deriveSuitSize(bustCm, heightCm),
      "Suit size unavailable (needs both chest and height) — line skipped.",
    );
    pushLine(
      "shoes",
      "SHOES",
      renderShoe(p.shoe_size, category, units),
      "Shoe size missing — line skipped.",
    );
  } else {
    pushLine(
      "height",
      "HEIGHT",
      heightCm != null ? renderHeight(heightCm, units) : null,
      "Height missing — height line skipped.",
    );
    pushWeight();
    pushLine(
      "bust",
      "BUST",
      bustCm != null ? renderGirth(bustCm, units) : null,
      "Bust missing — line skipped.",
    );
    pushLine(
      "waist",
      "WAIST",
      waistCm != null ? renderGirth(waistCm, units) : null,
      "Waist missing — line skipped.",
    );
    pushLine(
      "hips",
      "HIPS",
      hipsCm != null ? renderGirth(hipsCm, units) : null,
      "Hips missing — line skipped.",
    );
    pushLine(
      "dress",
      "DRESS",
      renderDress(p.dress_size, units),
      "Dress size missing — line skipped.",
    );
    pushLine(
      "shoes",
      "SHOES",
      renderShoe(p.shoe_size, category, units),
      "Shoe size missing — line skipped.",
    );
  }

  pushLine("hair", "HAIR", hair, "Hair color missing — line skipped.");
  pushLine("eyes", "EYES", eyes, "Eye color missing — line skipped.");

  // --- Skip-list enforcement (explainability) -------------------------------
  if (category !== "kids" && (p.age != null || p.date_of_birth != null)) {
    omitted.push({
      key: "age",
      reason: "Age/DOB is never printed for adults.",
    });
  }
  if ((weightKg != null || weightLbs != null) && !isFitness) {
    omitted.push({
      key: "weight",
      reason: "Weight is only printed for fitness talent.",
    });
  }
  if (
    (weightKg != null || weightLbs != null) &&
    isFitness &&
    category === "kids"
  ) {
    omitted.push({
      key: "weight",
      reason: "Weight is never printed on kids cards.",
    });
  }
  if (category === "kids") {
    const kidsSuppressed = [
      ["bust", bustCm],
      ["waist", waistCm],
      ["hips", hipsCm],
    ];
    kidsSuppressed.forEach(([key, value]) => {
      if (value != null) {
        omitted.push({
          key,
          reason: "Kids cards never show body measurements.",
        });
      }
    });
  }

  // --- Inline strip ----------------------------------------------------------
  const inline = lines
    .map((line) => `${line.label} ${String(line.value).toUpperCase()}`)
    .join("  ·  ");

  return { category, isFitness, units, lines, inline, omitted, warnings };
}

module.exports = {
  buildStatsBlock,
  resolveStatsCategory,
  cmToFeetInches,
  cmToInchesHalf,
  shoeDual,
  dressDual,
};
