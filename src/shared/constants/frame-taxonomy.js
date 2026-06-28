"use strict";

/**
 * Canonical frame taxonomy — display labels, aliases, and picker options.
 * Keep enum *values* in sync with src/shared/lib/validation.js (SHOT_TYPE_VALUES, etc.).
 * Client mirror: client/src/shared/constants/frameTaxonomy.js (ESM) — keep both in sync.
 */

// ── Shot (framing) ─────────────────────────────────────────────

/** Legacy / alternate slugs → canonical shot slug for labeling */
const SHOT_ALIASES = {
  full_body: "full_length",
};

const SHOT_LABELS = {
  headshot: "Headshot",
  beauty: "Beauty close-up",
  half_body: "Half body",
  three_quarter: "Three-quarter",
  full_length: "Full length",
  profile: "Profile",
  profile_left: "Profile",
  profile_right: "Profile",
  back: "Back",
  detail: "Detail",
};

const SHOT_PICKER_OPTIONS = [
  { value: "", label: "Unplaced", hint: "" },
  { value: "headshot", label: "Headshot", hint: "Face-forward reference" },
  { value: "beauty", label: "Beauty close-up", hint: "Tight beauty framing" },
  { value: "half_body", label: "Half body", hint: "Waist or mid-thigh up" },
  { value: "three_quarter", label: "Three-quarter", hint: "Knee or thigh up" },
  { value: "full_length", label: "Full length", hint: "Head to toe" },
  { value: "profile", label: "Profile", hint: "Side view of face or body" },
  { value: "back", label: "Back", hint: "Back of head or body" },
  { value: "detail", label: "Detail", hint: "Hands, feet, hair, or feature" },
];

const SHOT_LEGACY_ONLY = [
  { value: "profile_left", label: "Profile (legacy left)" },
  { value: "profile_right", label: "Profile (legacy right)" },
];

// ── Image type (use) ─────────────────────────────────────────

/** Deprecated image_type values — still labeled, hidden from new picks */
const IMAGE_TYPE_DEPRECATED = new Set(["comp_card", "editorial", "runway"]);

const IMAGE_TYPE_LABELS = {
  digital: "Digitals",
  portfolio: "Book",
  comp_card: "Comp card",
  campaign: "Campaign",
  tearsheet: "Tearsheet",
  test: "Test shoot",
  editorial: "Book",
  runway: "Book",
};

const IMAGE_TYPE_PICKER_OPTIONS = [
  { value: "", label: "Unplaced", hint: "" },
  { value: "digital", label: "Digitals", hint: "Natural agency digitals or polaroids" },
  { value: "portfolio", label: "Book", hint: "Styled portfolio work" },
  { value: "test", label: "Test shoot", hint: "TFP or test day imagery" },
  { value: "campaign", label: "Campaign", hint: "Unpublished brand or ad work" },
  { value: "tearsheet", label: "Tearsheet", hint: "Published page — publication, issue, credit" },
];

const IMAGE_TYPE_LEGACY_ONLY = [
  { value: "comp_card", label: "Comp card (legacy)" },
  { value: "editorial", label: "Book (legacy editorial tag)" },
  { value: "runway", label: "Book (legacy runway tag)" },
];

// ── Style (register) ─────────────────────────────────────────

const STYLE_LABELS = {
  editorial: "Editorial",
  commercial: "Commercial",
  lifestyle: "Lifestyle",
  beauty: "Beauty",
  ecommerce: "E-commerce",
  swimwear: "Swimwear",
  fitness: "Fitness",
  couture: "Couture",
};

const STYLE_PICKER_OPTIONS = [
  { value: "", label: "Unplaced", hint: "" },
  { value: "editorial", label: "Editorial", hint: "Fashion and creative" },
  { value: "commercial", label: "Commercial", hint: "Advertising and brand" },
  { value: "lifestyle", label: "Lifestyle", hint: "Relatable, everyday casting" },
  { value: "beauty", label: "Beauty", hint: "Skincare, hair, close beauty" },
  { value: "ecommerce", label: "E-commerce", hint: "Catalogue and product" },
  { value: "swimwear", label: "Swimwear", hint: "Swim, lingerie, body" },
  { value: "fitness", label: "Fitness", hint: "Athletic and movement" },
  { value: "couture", label: "Couture", hint: "Runway and high fashion" },
];

// ── Expression & PITS signals ────────────────────────────────

const EXPRESSION_LABELS = {
  neutral: "Neutral",
  smile: "Smiling",
  serious: "Serious",
};

const EXPRESSION_PICKER_OPTIONS = [
  { value: "", label: "Unplaced" },
  { value: "neutral", label: "Neutral" },
  { value: "smile", label: "Smiling" },
  { value: "serious", label: "Serious" },
];

const SIGNAL_LABELS = {
  background: {
    plain: "Plain background",
    studio: "Studio background",
    environmental: "Environmental background",
  },
  styling_register: {
    natural: "Natural styling",
    polished: "Polished styling",
    editorial: "Editorial styling",
  },
  retouch_likelihood: {
    none: "Unretouched",
    light: "Light retouch",
    heavy: "Heavy retouch",
  },
  makeup_level: {
    none: "No makeup",
    minimal: "Minimal makeup",
    styled: "Styled makeup",
  },
  body_visibility: {
    face_only: "Face only",
    bust: "Bust up",
    three_quarter: "Three-quarter body",
    full_length: "Full length",
  },
  pose_yaw: {
    front: "Facing camera",
    three_quarter: "Three-quarter turn",
    profile_left: "Profile left",
    profile_right: "Profile right",
    back: "From behind",
  },
};

// ── Classification lifecycle (plain copy) ────────────────────

const REVIEW_STATE_LABELS = {
  pending: "Reading frame",
  pending_timeout: "Place this frame",
  suggest: "Proposed read",
  ask: "Needs placement",
  confirmed: null,
};

// ── Package advisories (book / readiness intelligence) ─────────

const PACKAGE_ADVISORY_COPY = {
  book_full_length_not_digital: {
    title: "Add a digital full-length",
    text: "You already have full-length book images. For submissions, agencies still need one clean digital full-length shot.",
    inline:
      "You already have full-length book images. For submissions, agencies still need one clean digital full-length shot.",
    readinessLabel: "Full-Length Digital",
    readinessTask: "Add a clean digital full-length shot",
  },
  book_headshot_not_digital: {
    title: "Add a digital headshot",
    text: "You already have a styled book headshot. For submissions, agencies still need one clean digital headshot.",
    inline:
      "You already have a styled book headshot. For submissions, agencies still need one clean digital headshot.",
    readinessLabel: "Digital Headshot",
    readinessTask: "Add a clean digital headshot",
  },
  stale_digitals: {
    title: "Refresh your digitals",
    text: "Your set has aged past the window agencies expect — reshoot to keep it current.",
  },
  portfolio_as_digital: {
    title: "Swap in a raw digital",
    text: "A styled book frame is sitting in your digitals — agencies want an unretouched read.",
    inline:
      "This frame reads as styled book work, not a raw digital. Agencies may set it aside.",
  },
  busy_background: {
    title: "Simplify the background",
    text: "A plain backdrop keeps the focus on you the way digitals are meant to.",
    inline: "Digitals work best on a plain background — this frame reads environmental.",
  },
  missing_slot_headshot: {
    title: "Add a digital headshot",
    text: "Add a clean, natural headshot to open your digitals set.",
    inline: "Add a clean, natural headshot to open your digitals set.",
  },
  missing_slot_full_body: {
    title: "Add a digital full-length",
    text: "Add a full-length digital so bookers can verify proportions.",
    inline: "Add a full-length frame so bookers can verify proportions.",
  },
  pending_classification: {
    title: "Frames need a read",
    text: "Some frames still need a type read before your package is fully understood.",
  },
};

/** Readiness sidebar / strength field labels for photo package slots */
const READINESS_FIELD_LABELS = {
  photo_headshot: "Digital Headshot",
  photo_full_body: "Full-Length Digital",
  photo_profile: "Side Profile",
  photo_smile: "Smiling Headshot",
  photo_back: "Back View",
  photo_editorial: "Editorial / Creative",
  photo_lifestyle: "Commercial / Lifestyle",
  digitals_recency: "Current Digitals",
};

/** Digitals coverage advisory rows (apply flow, harness) */
const DIGITALS_ADVISORY_ITEMS = [
  { key: "hasProfile", label: "Side profile" },
  { key: "hasSmile", label: "Smiling headshot" },
  { key: "hasBack", label: "Back view" },
  { key: "hasEditorial", label: "Editorial book frame" },
  { key: "hasLifestyle", label: "Commercial / lifestyle frame" },
];

/** Agency digitals checklist copy */
const READINESS_CHECKLIST_COPY = {
  headshot: {
    label: "Digital Headshot",
    description: "Face forward, neutral expression, minimal makeup.",
  },
  fullbody: {
    label: "Full-Length Digital",
    description: "Head-to-toe frame on a plain background for agency digitals.",
  },
  side_profile: {
    label: "Side Profile",
    description: "Profile view of your face (left or right).",
  },
  smile: {
    label: "Smile / Commercial",
    description: "Warm, approachable smile showing teeth.",
  },
  editorial: {
    label: "Editorial / Creative",
    description: "High-fashion or styled creative work.",
  },
  back: {
    label: "Back View",
    description: "Shows hair and back of head — common digitals slot.",
  },
  lifestyle: {
    label: "Commercial / Lifestyle",
    description: "Styled book frame for commercial or lifestyle markets.",
  },
  min_count: {
    label: "At least 5 photos",
    description: "Agencies need to see variety.",
  },
  recency: {
    label: "Fresh digitals",
    description: null,
  },
};

const REVIEW_STRIP_LABELS = {
  pending: "Reading",
  proposed: "Proposed read",
  needs: "Needs read",
};

const REVIEW_STRIP_COPY = {
  pending: {
    title: REVIEW_STRIP_LABELS.pending,
    detail: "Pholio is placing the frame in your book.",
  },
  proposed: {
    title: REVIEW_STRIP_LABELS.proposed,
    detail: "Keep it if the placement feels right, or refine the frame details.",
  },
  needs: {
    title: REVIEW_STRIP_LABELS.needs,
    detail: "Set the framing and use so agencies can scan the book cleanly.",
  },
};

const PITS_SIGNAL_KEYS = [
  "expression",
  "background",
  "styling_register",
  "retouch_likelihood",
  "makeup_level",
  "pose_yaw",
  "body_visibility",
];

function readinessFieldLabel(key, fallback = "") {
  return READINESS_FIELD_LABELS[key] || fallback;
}

function advisoryInline(id) {
  return PACKAGE_ADVISORY_COPY[id]?.inline || PACKAGE_ADVISORY_COPY[id]?.text || "";
}

// ── Helpers ───────────────────────────────────────────────────

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeShotSlug(shotType) {
  const slug = normalizeToken(shotType);
  if (!slug) return "";
  return SHOT_ALIASES[slug] || slug;
}

function fallbackLabel(value) {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelForShot(shotType) {
  const raw = normalizeToken(shotType);
  if (!raw) return "";
  const canonical = SHOT_ALIASES[raw] || raw;
  return SHOT_LABELS[canonical] || SHOT_LABELS[raw] || fallbackLabel(raw);
}

function labelForImageType(imageType) {
  const slug = normalizeToken(imageType);
  if (!slug) return "";
  return IMAGE_TYPE_LABELS[slug] || fallbackLabel(slug);
}

function labelForStyle(styleType) {
  const slug = normalizeToken(styleType);
  if (!slug) return "";
  return STYLE_LABELS[slug] || fallbackLabel(slug);
}

function labelForExpression(expression) {
  const slug = normalizeToken(expression);
  if (!slug) return "";
  return EXPRESSION_LABELS[slug] || fallbackLabel(slug);
}

function labelForSignal(signalKey, signalValue) {
  const key = normalizeToken(signalKey);
  const val = normalizeToken(signalValue);
  if (!key || !val) return "";
  if (key === "expression") return labelForExpression(val);
  const map = SIGNAL_LABELS[key];
  return map?.[val] || "";
}

/**
 * Structured caption parts: framing · use · register
 * @returns {Array<{ key: 'framing'|'use'|'register', slug: string, label: string }>}
 */
function frameTypeParts(shotType, imageType, styleType) {
  const parts = [];
  const shotSlug = normalizeToken(shotType);
  const imageSlug = normalizeToken(imageType);
  const styleSlug = normalizeToken(styleType);

  if (shotSlug) {
    parts.push({
      key: "framing",
      slug: shotSlug,
      label: labelForShot(shotSlug),
    });
  }
  if (imageSlug) {
    parts.push({
      key: "use",
      slug: imageSlug,
      label: labelForImageType(imageSlug),
    });
  }
  if (styleSlug) {
    parts.push({
      key: "register",
      slug: styleSlug,
      label: labelForStyle(styleSlug),
    });
  }
  return parts;
}

function formatFrameTypeLabel(shotType, imageType, styleType) {
  return frameTypeParts(shotType, imageType, styleType)
    .map((part) => part.label)
    .join(" · ");
}

/**
 * Quiet quality hint for digitals/book intelligence on a frame (plain text, one line max).
 */
function qualityHintFromSignals(signals = {}, imageType) {
  if (!signals || typeof signals !== "object") return null;
  const use = normalizeToken(imageType);
  const styling = normalizeToken(signals.styling_register);
  const retouch = normalizeToken(signals.retouch_likelihood);
  const background = normalizeToken(signals.background);
  const expression = normalizeToken(signals.expression);

  if (use === "digital") {
    if (styling === "editorial" || styling === "polished" || retouch === "heavy") {
      return "Reads as styled book work, not a raw digital";
    }
    if (background === "environmental") {
      return "Environmental background — digitals work best on plain backdrops";
    }
  }

  if (expression === "smile" && use === "digital") {
    return "Smiling digital";
  }

  return null;
}

function shotPickerOptions(currentValue = "") {
  const current = normalizeToken(currentValue);
  const legacy = SHOT_LEGACY_ONLY.filter((o) => o.value === current);
  return [...SHOT_PICKER_OPTIONS, ...legacy];
}

function imageTypePickerOptions(currentValue = "") {
  const current = normalizeToken(currentValue);
  const legacy = IMAGE_TYPE_LEGACY_ONLY.filter((o) => o.value === current);
  return [...IMAGE_TYPE_PICKER_OPTIONS, ...legacy];
}

function stylePickerOptions() {
  return STYLE_PICKER_OPTIONS;
}

function expressionPickerOptions() {
  return EXPRESSION_PICKER_OPTIONS;
}

function isDeprecatedImageType(imageType) {
  return IMAGE_TYPE_DEPRECATED.has(normalizeToken(imageType));
}

function pitsSignalParts(signals = {}, imageType = "") {
  if (!signals || typeof signals !== "object") return [];
  const use = normalizeToken(imageType);
  const parts = [];

  const push = (signalKey, rawValue) => {
    const label = labelForSignal(signalKey, rawValue);
    const slug = normalizeToken(rawValue);
    if (!label || !slug) return;
    parts.push({
      key: "signal",
      slug: `${normalizeToken(signalKey)}_${slug}`,
      label,
      signalKey: normalizeToken(signalKey),
    });
  };

  if (signals.expression) push("expression", signals.expression);

  if (use === "digital" || !use) {
    const bg = normalizeToken(signals.background);
    if (bg && bg !== "plain") push("background", signals.background);
    const styling = normalizeToken(signals.styling_register);
    if (styling && styling !== "natural") push("styling_register", signals.styling_register);
    const retouch = normalizeToken(signals.retouch_likelihood);
    if (retouch && retouch !== "none") push("retouch_likelihood", signals.retouch_likelihood);
    const makeup = normalizeToken(signals.makeup_level);
    if (makeup && makeup !== "none") push("makeup_level", signals.makeup_level);
  }

  const yaw = normalizeToken(signals.pose_yaw);
  if (yaw && yaw !== "front") push("pose_yaw", signals.pose_yaw);

  return parts;
}

function reviewStripCopy(state, hasTypeParts) {
  if (state?.status === "pending") return REVIEW_STRIP_COPY.pending;
  if (hasTypeParts) return REVIEW_STRIP_COPY.proposed;
  return REVIEW_STRIP_COPY.needs;
}

/** Comp-card slot labels aligned with structured columns (not metadata.role) */
const COMP_CARD_SLOT_LABELS = {
  headshot: "Headshot",
  full_length: "Full length",
  editorial: "Editorial",
  lifestyle: "Lifestyle",
};

module.exports = {
  SHOT_ALIASES,
  SHOT_LABELS,
  IMAGE_TYPE_LABELS,
  STYLE_LABELS,
  EXPRESSION_LABELS,
  SIGNAL_LABELS,
  REVIEW_STATE_LABELS,
  REVIEW_STRIP_LABELS,
  REVIEW_STRIP_COPY,
  PITS_SIGNAL_KEYS,
  PACKAGE_ADVISORY_COPY,
  READINESS_FIELD_LABELS,
  DIGITALS_ADVISORY_ITEMS,
  READINESS_CHECKLIST_COPY,
  COMP_CARD_SLOT_LABELS,
  normalizeShotSlug,
  labelForShot,
  labelForImageType,
  labelForStyle,
  labelForExpression,
  labelForSignal,
  frameTypeParts,
  formatFrameTypeLabel,
  qualityHintFromSignals,
  shotPickerOptions,
  imageTypePickerOptions,
  stylePickerOptions,
  expressionPickerOptions,
  isDeprecatedImageType,
  readinessFieldLabel,
  advisoryInline,
  pitsSignalParts,
  reviewStripCopy,
};
