"use strict";

/**
 * Pholio ID — pass content model.
 *
 * Pure: a `profiles` row (+ user, representations) in, a `pass.json` object
 * and a small view model out. No DB, no image work, no signing. Every string
 * that reaches Wallet is decided here so the two faces Apple renders (the
 * iOS 27 `posterGeneric` face and the `generic` fallback for iOS 26 and
 * earlier) are the same pass with the same facts.
 *
 * What a Pholio ID is: the talent's identity credential in Wallet — the face,
 * the name, the one number a booker checks first (height, stack-visible in
 * the header), who books them, and a QR to the live book. It is not the comp
 * card; it points to the comp card's live source. Stats live on the details
 * sheet in the comp card's own dual-unit order.
 *
 * Reuse (never a second truth):
 *   - comp-card stats block: order, units, kids rules, omissions
 *   - short portfolio URL: the same `/p/:slug` the comp card QR/NFC encodes
 *   - minor policy: a minor's pass needs recorded guardian consent, exactly
 *     like the comp card export
 *
 * Apple constraints applied (HIG "Wallet", rev. 2026-06-08; WWDC26 209):
 *   - generic: ≤3 header, 1 primary, ≤4 secondary+auxiliary combined with a
 *     square barcode, unlimited back fields; text never wraps, long values
 *     drop fields, so every front value is kept short and deterministic.
 *   - posterGeneric: header, primary (first primary without a label renders
 *     as the title), ONE footer field, square QR. No secondary/auxiliary.
 *   - Labels are not rendered on the front for the poster title, so the name
 *     carries no label anywhere (also the house rule: no eyebrow above a
 *     heading).
 */

const { buildStatsBlock } = require("../../pdf/composition/stats-formatter");
const { isMinorProfile, hasGuardianConsent } = require("../../../shared/lib/talent-age");

class WalletPassError extends Error {
  constructor(message, code, status = 422) {
    super(message);
    this.name = "WalletPassError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The two Pholio materials, expressed as Wallet's three colors. Both pairs
 * were measured (WCAG relative luminance):
 *   ink   — gold #C9A55A on #1A1815 = 7.6:1, ivory on ink = 16.7:1
 *   paper — deep gold #8A6A40 on #FAF8F5 = 4.7:1, ink on ivory = 16.7:1
 * Labels are the smallest text on a pass, so the label color is the one that
 * has to clear AA; brand gold (#C9A55A) on ivory is 2.2:1 and is never used
 * for text on the paper theme.
 */
const THEMES = Object.freeze({
  ink: Object.freeze({
    id: "ink",
    backgroundColor: "rgb(26, 24, 21)",
    foregroundColor: "rgb(250, 248, 245)",
    labelColor: "rgb(201, 165, 90)",
    hex: Object.freeze({ background: "#1A1815", foreground: "#FAF8F5", label: "#C9A55A", wordmark: "#C9A55A" }),
  }),
  paper: Object.freeze({
    id: "paper",
    backgroundColor: "rgb(250, 248, 245)",
    foregroundColor: "rgb(26, 24, 21)",
    labelColor: "rgb(138, 106, 64)",
    hex: Object.freeze({ background: "#FAF8F5", foreground: "#1A1815", label: "#8A6A40", wordmark: "#8A6A40" }),
  }),
});
const DEFAULT_THEME = "ink";

/**
 * Wallet does not wrap and truncates a primary field it cannot fit. The
 * generic primary shares its row with a 90pt thumbnail, so it holds fewer
 * characters than the full-width poster title. The two dictionaries are
 * separate, so each face gets the longest recognisable form that fits it.
 */
const NAME_MAX = Object.freeze({ poster: 22, generic: 16 });

const SUPPORT_EMAIL = "support@pholio.studio";

/**
 * The representation line shares the poster footer strip with the QR and
 * the generic secondary row with nothing; Wallet truncates what it cannot
 * fit. A long agency name is cut here, deterministically, so the face shows
 * the same thing on every device; the details sheet keeps the full name.
 */
const FACE_VALUE_MAX = 30;

/** Front-row stats per comp-card category: the three lines after height. */
const FRONT_STAT_KEYS = Object.freeze({
  women: ["bust", "waist", "hips"],
  men: ["chest", "waist", "inseam"],
  kids: ["age", "clothing_size", "shoes"],
});

function clean(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function resolveTheme(theme) {
  const key = String(theme || "").trim().toLowerCase();
  return THEMES[key] || THEMES[DEFAULT_THEME];
}

/**
 * Full legal-ish name from the profile, falling back to the user record.
 * @returns {{ full: string|null, first: string|null, last: string|null }}
 */
function resolveName(profile, user) {
  const first = clean(profile?.first_name) || clean(user?.first_name);
  const last = clean(profile?.last_name) || clean(user?.last_name);
  const full = [first, last].filter(Boolean).join(" ") || null;
  return { full, first, last };
}

/**
 * The name as printed on the face. Deterministic fallbacks for long names,
 * in the order a booker would still recognise the person:
 *   full name → "First L." → first name → first name cut with an ellipsis.
 */
function displayName({ full, first, last }, max = NAME_MAX.poster) {
  if (!full) return null;
  if (full.length <= max) return full;
  if (first && last) {
    const initial = `${first} ${Array.from(last)[0]}.`;
    if (initial.length <= max) return initial;
  }
  const single = first || full;
  if (single.length <= max) return single;
  return `${Array.from(single).slice(0, max - 1).join("").trimEnd()}…`;
}

/**
 * Representation state for the face and the details sheet.
 *
 * Mirrors the public-portfolio DTO: active structured rows win (mother
 * agency before placements); a profile with no structured rows at all but a
 * legacy `current_agency` string is still represented; `seeking_representation`
 * is a declared state; otherwise the talent takes bookings directly.
 */
function resolveRepresentation(representations, profile) {
  const rows = Array.isArray(representations) ? representations : [];
  const active = rows
    .filter((row) => row && row.status === "active")
    .map((row) => ({
      name: clean(row.agency_name) || clean(row.external_agency_name),
      relationship_type: row.relationship_type === "mother" ? "mother" : "placement",
      market: clean(row.market),
      territory: clean(row.territory),
      division: clean(row.division),
      is_exclusive: Boolean(row.is_exclusive),
    }))
    .filter((row) => row.name)
    .sort((a, b) => (a.relationship_type === b.relationship_type ? 0 : a.relationship_type === "mother" ? -1 : 1));

  if (active.length) return { status: "represented", primary: active[0], all: active };
  const legacy = rows.length === 0 ? clean(profile?.current_agency) : null;
  if (legacy) {
    const primary = { name: legacy, relationship_type: null, market: null, territory: null, division: null, is_exclusive: false };
    return { status: "represented", primary, all: [primary] };
  }
  if (profile?.seeking_representation) return { status: "seeking", primary: null, all: [] };
  return { status: "direct", primary: null, all: [] };
}

function faceValue(text) {
  const s = String(text);
  if (s.length <= FACE_VALUE_MAX) return s;
  return `${Array.from(s).slice(0, FACE_VALUE_MAX - 1).join("").trimEnd()}…`;
}

/** The one representation line shown on the face (secondary / footer). */
function representationField(representation) {
  if (representation.status === "represented") {
    return { key: "representation", label: "REPRESENTATION", value: faceValue(representation.primary.name) };
  }
  if (representation.status === "seeking") {
    return { key: "representation", label: "REPRESENTATION", value: "Seeking representation" };
  }
  return { key: "bookings", label: "BOOKINGS", value: "Direct" };
}

/** Details-sheet rows for every active representation, in industry terms. */
function representationBackFields(representation) {
  if (representation.status !== "represented") return [representationField(representation)];
  return representation.all.map((row, index) => {
    const label = row.relationship_type === "mother" ? "MOTHER AGENCY" : row.relationship_type === "placement" ? "PLACEMENT" : "REPRESENTATION";
    const where = [row.market, row.territory].filter(Boolean).join(", ");
    const parts = [row.name, where || null, row.division, row.is_exclusive ? "Exclusive" : null].filter(Boolean);
    return { key: `representation-${index}`, label, value: parts.join(" · ") };
  });
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hostOf(url) {
  return String(url).replace(/^https?:\/\//i, "");
}

/**
 * Build the pass content.
 *
 * @param {object} input
 * @param {object} input.profile — profiles row
 * @param {object} [input.user] — users row (name fallback)
 * @param {Array<object>} [input.representations] — talent_representations rows (API shape)
 * @param {string} input.passTypeIdentifier
 * @param {string} input.teamIdentifier
 * @param {string} input.portfolioUrl — short portfolio URL (the QR payload)
 * @param {string} [input.theme='ink']
 * @param {Date} [input.now] — issue time (test hook)
 * @returns {{ pass: object, view: object }}
 */
function buildPassContent({ profile, user, representations, passTypeIdentifier, teamIdentifier, portfolioUrl, theme, now }) {
  const p = profile && typeof profile === "object" ? profile : {};
  const issuedAt = now instanceof Date ? now : new Date();
  const name = resolveName(p, user);
  if (!name.full) throw new WalletPassError("Add your name before creating a Pholio ID.", "WALLET_NAME_REQUIRED");
  if (!p.id || !clean(p.slug)) throw new WalletPassError("Complete your profile before creating a Pholio ID.", "WALLET_PROFILE_INCOMPLETE");
  if (!portfolioUrl) throw new WalletPassError("Complete your profile before creating a Pholio ID.", "WALLET_PROFILE_INCOMPLETE");
  const minor = isMinorProfile(p, issuedAt);
  if (minor && !hasGuardianConsent(p)) {
    throw new WalletPassError("Record guardian consent before creating a Pholio ID.", "WALLET_GUARDIAN_CONSENT_REQUIRED");
  }

  const palette = resolveTheme(theme);
  const stats = buildStatsBlock(p, { units: "dual", referenceDate: issuedAt });
  const lineByKey = new Map(stats.lines.map((line) => [line.key, line]));
  const height = lineByKey.get("height") || null;
  const frontStats = (FRONT_STAT_KEYS[stats.category] || FRONT_STAT_KEYS.women)
    .map((key) => lineByKey.get(key))
    .filter(Boolean)
    .map((line) => ({ key: line.key, label: line.label, value: line.value }));
  const representation = resolveRepresentation(representations, p);
  const repField = representationField(representation);
  const shown = { poster: displayName(name, NAME_MAX.poster), generic: displayName(name, NAME_MAX.generic) };

  const headerFields = height ? [{ key: "height", label: "HEIGHT", value: height.value }] : [];
  const primaryFields = (face) => [{ key: "name", value: shown[face] }];
  const backFields = [
    {
      key: "portfolio",
      label: "PORTFOLIO",
      value: portfolioUrl,
      attributedValue: `<a href="${portfolioUrl}">${hostOf(portfolioUrl)}</a>`,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    },
    ...stats.lines.map((line) => ({ key: `stat-${line.key}`, label: line.label, value: line.value })),
    ...representationBackFields(representation),
    ...(stats.category !== "kids" && toIsoDate(p.measurements_updated_at)
      ? [{ key: "measurements-updated", label: "MEASUREMENTS UPDATED", value: toIsoDate(p.measurements_updated_at), dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleNone" }]
      : []),
    { key: "issued", label: "ISSUED", value: issuedAt.toISOString(), dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleNone" },
    {
      key: "about",
      label: "ABOUT THIS PASS",
      value: `Pholio ID for ${name.full}. Details are as declared on the Pholio profile at the issue date. Scan the code for the current portfolio.`,
      dataDetectorTypes: [],
    },
    { key: "support", label: "PHOLIO", value: `app.pholio.studio\n${SUPPORT_EMAIL}`, dataDetectorTypes: ["PKDataDetectorTypeLink"] },
  ];

  const barcode = {
    format: "PKBarcodeFormatQR",
    message: portfolioUrl,
    messageEncoding: "iso-8859-1",
    altText: hostOf(portfolioUrl),
  };

  const pass = {
    formatVersion: 1,
    passTypeIdentifier,
    serialNumber: String(p.id),
    teamIdentifier,
    organizationName: "Pholio",
    description: `Pholio ID for ${name.full}`,
    backgroundColor: palette.backgroundColor,
    foregroundColor: palette.foregroundColor,
    labelColor: palette.labelColor,
    footerBackgroundColor: palette.backgroundColor,
    sharingProhibited: false,
    barcodes: [barcode],
    // iOS 27 and later: the photographic face.
    posterGeneric: {
      headerFields,
      primaryFields: primaryFields("poster"),
      footerFields: [repField],
      backFields,
    },
    // iOS 26 and earlier: flat field + square thumbnail. Four front fields
    // total is Apple's limit next to a square barcode; representation takes
    // the wide secondary row, the three core stats share the auxiliary row.
    generic: {
      headerFields,
      primaryFields: primaryFields("generic"),
      secondaryFields: [repField],
      auxiliaryFields: frontStats,
      backFields,
    },
  };

  const view = {
    theme: palette.id,
    palette: palette.hex,
    name: { full: name.full, shown },
    height: height ? height.value : null,
    representation: { ...representation, field: repField },
    frontStats,
    stats: stats.lines,
    category: stats.category,
    minor,
    portfolioUrl,
    altText: barcode.altText,
    issuedAt: issuedAt.toISOString(),
    warnings: stats.warnings,
  };

  return { pass, view };
}

module.exports = {
  WalletPassError,
  THEMES,
  DEFAULT_THEME,
  NAME_MAX,
  FACE_VALUE_MAX,
  FRONT_STAT_KEYS,
  SUPPORT_EMAIL,
  resolveTheme,
  resolveName,
  displayName,
  resolveRepresentation,
  representationField,
  faceValue,
  buildPassContent,
};
