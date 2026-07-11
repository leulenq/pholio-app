"use strict";

/**
 * Discover launch-mode — response presentation layer (WS5.6).
 *
 * Turns the engine's grouped, evaluated result set into the exact WS5.6
 * response contract. All template strings are composed here with ZERO LLM
 * (the interpretive "Pholio's read" line is a separate streamed endpoint).
 *
 * NO raw similarity scores or pass counts ever leave through this layer — the
 * MatchScore ring receives coarse `tier_band` values only.
 */

const { tierFor, HARD_FIELDS } = require("./field-whitelist");
const { marketLabel } = require("../../../talent/services/intel/market-resolve");
const {
  normalizeBookingLaneSlug,
  BOOKING_LANES,
} = require("../../../../shared/constants/booking-lanes");

const BOARD_LABEL = Object.fromEntries(
  BOOKING_LANES.map((l) => [l.slug, l.label]),
);
const BOARD_GROUP = Object.fromEntries(
  BOOKING_LANES.map((l) => [l.slug, l.group]),
);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── span provenance ──────────────────────────────────────────────────────────

/**
 * Byte offsets of a span substring inside the brief, or null when the span is
 * absent (a literal gap the UI renders as an un-underlined region — LB-4).
 * @returns {[number, number]|null}
 */
function spanOffsets(brief, spanText) {
  if (!brief || !spanText) return null;
  const idx = String(brief).indexOf(String(spanText));
  if (idx < 0) return null;
  return [idx, idx + String(spanText).length];
}

// ── value formatting ─────────────────────────────────────────────────────────

function cmToImperial(cm) {
  if (cm == null) return null;
  const inch = Math.round(Number(cm) / 2.54);
  return `${Math.floor(inch / 12)}'${inch % 12}"`;
}

/** Dual-unit height, e.g. `5'10" (178cm)`. */
function dualHeight(cm) {
  if (cm == null) return null;
  return `${cmToImperial(cm)} (${Math.round(Number(cm))}cm)`;
}

function constraintValue(field, c) {
  if (field === "gender_presentation" || field === "boards" ||
      field === "hair_color" || field === "eye_color" ||
      field === "representation_status") {
    return Array.isArray(c) ? c : c?.value ?? c;
  }
  if (field === "location") return c?.market ?? null;
  if (field === "availability") {
    return Array.isArray(c)
      ? c.map((w) => ({ kind: w.kind, from: w.from ?? null, to: w.to ?? null }))
      : null;
  }
  if (field === "visible_tattoos") return c;
  if (field === "union" || field === "experience_level") return c;
  if (field === "credentials") {
    return ["tearsheets", "runway_shows", "fit_experience", "published_work"]
      .filter((k) => c && c[k] === true);
  }
  // numeric constraint objects
  if (c && typeof c === "object") {
    if (c.value != null) return c.value;
    if (c.a != null || c.b != null) return { a: c.a ?? null, b: c.b ?? null };
    if (c.size != null) return { size: c.size, region: c.region ?? null };
  }
  return c ?? null;
}

// ── understanding.applied ────────────────────────────────────────────────────

/** Build one `applied[]` entry from a field + its (possibly nested) constraint. */
function appliedEntry(brief, field, c, opts = {}) {
  const span = opts.span != null ? opts.span : c && c.span;
  return {
    field,
    op: (c && c.op) || null,
    value: constraintValue(field, c),
    span: spanOffsets(brief, span),
    confidence: (c && typeof c === "object" && c.confidence != null) ? c.confidence : null,
    needs_confirmation: !!(c && typeof c === "object" && c.needs_confirmation === true),
    tier: tierFor(field),
  };
}

/**
 * Flatten a role's `hard` block into applied[] entries (includes
 * needs_confirmation constraints — they render as "check me" chips).
 */
function buildApplied(brief, hard) {
  const h = hard || {};
  const applied = [];
  const arrayFields = [
    "gender_presentation",
    "boards",
    "hair_color",
    "eye_color",
    "representation_status",
  ];
  for (const f of arrayFields) {
    if (Array.isArray(h[f]) && h[f].length) {
      applied.push(appliedEntry(brief, f, h[f], { span: null }));
    }
  }
  for (const f of ["height_cm", "playing_age"]) {
    if (h[f]) applied.push(appliedEntry(brief, f, h[f]));
  }
  if (h.measurements && typeof h.measurements === "object") {
    for (const key of ["bust_cm", "chest_cm", "waist_cm", "hips_cm", "inseam_cm"]) {
      if (h.measurements[key]) {
        applied.push(appliedEntry(brief, `measurements.${key}`, h.measurements[key]));
      }
    }
    for (const key of ["dress_size", "suit_size"]) {
      if (h.measurements[key] && h.measurements[key].value != null) {
        applied.push(appliedEntry(brief, `measurements.${key}`, h.measurements[key]));
      }
    }
  }
  if (h.shoe && h.shoe.size != null) applied.push(appliedEntry(brief, "shoe", h.shoe));
  if (h.location && h.location.market) {
    applied.push(appliedEntry(brief, "location", h.location));
  }
  if (Array.isArray(h.availability) && h.availability.length) {
    applied.push(
      appliedEntry(brief, "availability", h.availability, {
        span: h.availability.map((w) => w.span).filter(Boolean)[0] || null,
      }),
    );
  }
  if (h.visible_tattoos === true || h.visible_tattoos === false) {
    applied.push(appliedEntry(brief, "visible_tattoos", h.visible_tattoos, { span: null }));
  }
  if (h.union) applied.push(appliedEntry(brief, "union", h.union, { span: null }));
  if (h.experience_level) {
    applied.push(appliedEntry(brief, "experience_level", h.experience_level, { span: null }));
  }
  if (h.credentials && typeof h.credentials === "object") {
    applied.push(appliedEntry(brief, "credentials", h.credentials));
  }
  return applied;
}

function buildUnderstanding(contract, brief, multiRoleNotice) {
  const roles = Array.isArray(contract.roles) ? contract.roles : [];
  const primary = roles[0] || { hard: {}, soft_query: "" };
  return {
    roles: roles.map((r) => ({
      label: r.label,
      count: r.count,
      soft_query: r.soft_query,
    })),
    applied: buildApplied(brief, primary.hard),
    set_aside: Array.isArray(contract.set_aside) ? contract.set_aside : [],
    multi_role_notice: multiRoleNotice || null,
  };
}

// ── result-item content ──────────────────────────────────────────────────────

function primaryBoard(profile) {
  const raw = profile.modeling_categories || profile.booking_lanes || null;
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const v of list) {
        const slug = normalizeBookingLaneSlug(v);
        if (slug) return slug;
      }
    } catch {
      /* ignore */
    }
  }
  if (profile.archetype) return normalizeBookingLaneSlug(profile.archetype);
  return null;
}

/**
 * Board-derived headline stat (spec §8.4):
 *   curve → dress size · fit → waist/hips · runway/fashion/editorial → height ·
 *   commercial/default → height. Height is dual-unit.
 */
function keyStat(profile) {
  const board = primaryBoard(profile);
  if (board === "curve" && profile.dress_size != null) {
    return { label: "Dress", value: `US ${profile.dress_size}` };
  }
  if (board === "fit" && (profile.waist_cm != null || profile.hips_cm != null)) {
    const parts = [];
    if (profile.waist_cm != null) parts.push(`W ${profile.waist_cm}`);
    if (profile.hips_cm != null) parts.push(`H ${profile.hips_cm}`);
    return { label: "Fit", value: parts.join(" · ") };
  }
  if (profile.height_cm != null) {
    return { label: "Height", value: dualHeight(profile.height_cm) };
  }
  return null;
}

/** exact → high · near → mid · outside_spec → low (MatchScore ring bands). */
function tierBand(groupKind) {
  if (groupKind === "exact") return "high";
  if (groupKind === "near") return "mid";
  return "low";
}

function monthLabel(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return MONTHS[d.getUTCMonth()];
}

/**
 * Factual why-line from matched fields + key profile facts (Tier-1, zero LLM).
 * e.g. `5'10" · New York · editorial · stats updated Jun`.
 */
function whyFacts(profile, dto) {
  const parts = [];
  if (profile.height_cm != null) parts.push(cmToImperial(profile.height_cm));
  const market = marketLabel(profile.market) || profile.city || null;
  if (market) parts.push(market);
  const board = primaryBoard(profile);
  if (board && BOARD_LABEL[board]) parts.push(BOARD_LABEL[board].toLowerCase());
  const updated = monthLabel(
    (dto && dto.measurements_updated_at) || profile.measurements_updated_at,
  );
  if (updated) parts.push(`stats updated ${updated}`);
  return parts.filter(Boolean).join(" · ");
}

/**
 * Build one result item: DTO + launch-mode annotations. No raw scores.
 */
function buildResultItem(dto, profile, evaluations, { groupKind } = {}) {
  const constraintTruth = (evaluations || [])
    .filter((e) => e.status !== "pass")
    .map((e) => ({ field: e.field, status: e.status, actual: e.actual }));

  return {
    ...dto,
    key_stat: keyStat(profile),
    age_band: dto.age_band ?? null,
    tier_band: tierBand(groupKind),
    constraint_truth: constraintTruth,
    why_facts: whyFacts(profile, dto),
  };
}

// ── group headings ───────────────────────────────────────────────────────────

const NEAR_HEADING = {
  availability: "Near matches — availability unconfirmed",
  location: "Near matches — outside preferred market",
  union: "Near matches — union status differs",
  experience_level: "Near matches — experience differs",
};

function nearHeading(field) {
  return NEAR_HEADING[field] || `Near matches — ${field.replace(/_/g, " ")}`;
}

function fieldLabel(field) {
  const base = field.split(".").pop();
  return base.replace(/_cm$/, "").replace(/_/g, " ");
}

module.exports = {
  spanOffsets,
  dualHeight,
  cmToImperial,
  keyStat,
  primaryBoard,
  tierBand,
  whyFacts,
  buildApplied,
  buildUnderstanding,
  buildResultItem,
  nearHeading,
  fieldLabel,
  BOARD_GROUP,
};
