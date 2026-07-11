"use strict";

/**
 * Discover parse v2 — post-parse validation & normalization (WS4.4).
 *
 * Runs AFTER the model (or fallback) has produced a schema-shaped contract:
 *   1. drop unknown fields / out-of-vocabulary enum values (collected into a
 *      `dropped[]` report for discover_query_log.extraction_disagreements)
 *   2. run reconcile() over every numeric/date/size constraint and normalize to
 *      canonical units (cm, ISO dates); disagreements are flagged
 *      `needs_confirmation` and left UNAPPLIED (LB-4)
 *   3. enforce set_aside for protected-class terms found anywhere in `hard`
 *      or `soft_query` (ethnicity / heritage / skin-tone) with reason
 *      'not_used_for_filtering'
 *   4. detect credential constraints → `contract.credential_gate = true`
 *
 * Output: { contract, dropped, needs_confirmation_fields, multi_role }.
 */

const {
  HARD_FIELD_NAMES,
  emptyContract,
} = require("./contract-schema");
const {
  isKnownHardField,
  isAllowedEnumValue,
  enumFor,
  SIZE_REGIONS,
  SHOE_REGIONS,
  MARKETS,
  AVAILABILITY_KINDS,
  PROTECTED_CLASS_TERMS,
  PROTECTED_TERM_SAFE_CONTEXT,
} = require("./field-whitelist");
const { reconcile } = require("./extract-values");

const ENUM_ARRAY_FIELDS = [
  "gender_presentation",
  "boards",
  "hair_color",
  "eye_color",
  "representation_status",
];
const ENUM_STRING_FIELDS = ["union", "experience_level"];
const NUMERIC_CONSTRAINT_KIND = { height_cm: "height", playing_age: "age" };
const MEASUREMENT_LENGTHS = [
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
];

function isBlankConstraint(c) {
  if (!c || typeof c !== "object") return true;
  return c.a == null && c.b == null && (c.span == null || !String(c.span).trim());
}

/**
 * @param {object} rawContract — schema-shaped roles contract
 * @param {object} [opts] — { now } reference date for relative dates
 */
function validateContract(rawContract, opts = {}) {
  const now = opts.now || new Date();
  const dropped = [];
  const needsConfirmationFields = [];

  const contract = {
    roles: [],
    set_aside: Array.isArray(rawContract?.set_aside)
      ? rawContract.set_aside.filter(
          (s) => s && typeof s.text === "string" && s.text.trim(),
        )
      : [],
    unparsed_remainder:
      typeof rawContract?.unparsed_remainder === "string"
        ? rawContract.unparsed_remainder
        : "",
    credential_gate: false,
  };

  const roles = Array.isArray(rawContract?.roles) ? rawContract.roles : [];

  roles.forEach((role, roleIdx) => {
    const label = typeof role?.label === "string" ? role.label : `role ${roleIdx + 1}`;
    const softQuery = typeof role?.soft_query === "string" ? role.soft_query : "";
    const hardIn = role && typeof role.hard === "object" && role.hard ? role.hard : {};
    const hard = {};

    // Ensure every canonical field is present (null default) & drop unknowns.
    for (const key of Object.keys(hardIn)) {
      if (!isKnownHardField(key)) {
        dropped.push({ role: roleIdx, field: key, reason: "unknown_field" });
      }
    }
    for (const field of HARD_FIELD_NAMES) {
      hard[field] = hardIn[field] != null ? hardIn[field] : null;
    }

    const flagConfirm = (field, span, reason) => {
      needsConfirmationFields.push({
        role: roleIdx,
        field,
        span: span || null,
        reason,
      });
    };

    // ── enum ARRAY fields (OR-sets) ──────────────────────────────────────────
    for (const field of ENUM_ARRAY_FIELDS) {
      const val = hard[field];
      if (!Array.isArray(val)) {
        hard[field] = val == null ? null : hard[field];
        if (val != null && !Array.isArray(val)) {
          dropped.push({ role: roleIdx, field, value: val, reason: "not_an_array" });
          hard[field] = null;
        }
        continue;
      }
      const kept = [];
      for (const v of val) {
        const lower = typeof v === "string" ? v.toLowerCase() : v;
        if (isAllowedEnumValue(field, lower)) kept.push(lower);
        else dropped.push({ role: roleIdx, field, value: v, reason: "unknown_enum" });
      }
      hard[field] = kept.length ? kept : null;
    }

    // ── enum STRING fields ───────────────────────────────────────────────────
    for (const field of ENUM_STRING_FIELDS) {
      const v = hard[field];
      if (v == null) continue;
      const lower = typeof v === "string" ? v.toLowerCase() : v;
      if (isAllowedEnumValue(field, lower)) hard[field] = lower;
      else {
        dropped.push({ role: roleIdx, field, value: v, reason: "unknown_enum" });
        hard[field] = null;
      }
    }

    // ── numeric constraints (height / playing_age) — reconcile + normalize ───
    for (const [field, kind] of Object.entries(NUMERIC_CONSTRAINT_KIND)) {
      const c = hard[field];
      if (isBlankConstraint(c)) {
        hard[field] = null;
        continue;
      }
      const r = reconcile(c, { kind, now });
      c.value = r.value;
      c.needs_confirmation = r.needs_confirmation;
      if (r.needs_confirmation) flagConfirm(field, c.span, "reparse_disagreement");
    }

    // ── measurements ─────────────────────────────────────────────────────────
    if (hard.measurements && typeof hard.measurements === "object") {
      const meas = hard.measurements;
      for (const key of MEASUREMENT_LENGTHS) {
        const c = meas[key];
        if (isBlankConstraint(c)) {
          meas[key] = c == null ? null : meas[key];
          if (c != null) meas[key] = null;
          continue;
        }
        const r = reconcile(c, { kind: "length", now });
        c.value = r.value;
        c.needs_confirmation = r.needs_confirmation;
        if (r.needs_confirmation)
          flagConfirm(`measurements.${key}`, c.span, "reparse_disagreement");
      }
      // region-tagged sizes
      for (const sizeKey of ["dress_size", "suit_size"]) {
        const s = meas[sizeKey];
        if (s && typeof s === "object" && s.value != null) {
          if (s.region != null && !SIZE_REGIONS.includes(s.region)) {
            dropped.push({
              role: roleIdx,
              field: `measurements.${sizeKey}.region`,
              value: s.region,
              reason: "unknown_region",
            });
            s.region = null;
          }
          const r = reconcile(s, { kind: "size", now, defaultRegion: s.region || "US" });
          s.value = String(r.value ? r.value.value : s.value);
          s.region = (r.value && r.value.region) || s.region || "US";
          s.needs_confirmation = r.needs_confirmation;
          if (r.needs_confirmation)
            flagConfirm(`measurements.${sizeKey}`, s.span, "reparse_disagreement");
        } else {
          meas[sizeKey] = null;
        }
      }
      const anyMeas =
        MEASUREMENT_LENGTHS.some((k) => meas[k] != null) ||
        meas.dress_size != null ||
        meas.suit_size != null;
      if (!anyMeas) hard.measurements = null;
    }

    // ── shoe ─────────────────────────────────────────────────────────────────
    if (hard.shoe && typeof hard.shoe === "object" && hard.shoe.size != null) {
      const shoe = hard.shoe;
      if (shoe.region != null && !SHOE_REGIONS.includes(shoe.region)) {
        dropped.push({
          role: roleIdx,
          field: "shoe.region",
          value: shoe.region,
          reason: "unknown_region",
        });
        shoe.region = null;
      }
      if (shoe.span) {
        const r = reconcile(shoe, {
          kind: "shoe",
          now,
          defaultRegion: shoe.region || "US",
        });
        shoe.needs_confirmation = r.needs_confirmation;
        if (r.value) {
          shoe.size = r.value.size;
          shoe.region = r.value.region;
        }
        if (r.needs_confirmation) flagConfirm("shoe", shoe.span, "reparse_disagreement");
      } else {
        shoe.region = shoe.region || "US";
      }
    } else {
      hard.shoe = null;
    }

    // ── location (market whitelist) ──────────────────────────────────────────
    if (hard.location && typeof hard.location === "object") {
      const loc = hard.location;
      if (loc.market != null && !MARKETS.includes(String(loc.market).toLowerCase())) {
        dropped.push({
          role: roleIdx,
          field: "location.market",
          value: loc.market,
          reason: "unknown_market",
        });
        loc.market = null;
      } else if (loc.market != null) {
        loc.market = String(loc.market).toLowerCase();
      }
      if (loc.market == null && loc.local_only == null && loc.travel_ok == null) {
        hard.location = null;
      }
    }

    // ── availability (dates + kind whitelist) ────────────────────────────────
    if (Array.isArray(hard.availability)) {
      const windows = [];
      hard.availability.forEach((w, i) => {
        if (!w || typeof w !== "object") return;
        if (!AVAILABILITY_KINDS.includes(w.kind)) {
          dropped.push({
            role: roleIdx,
            field: `availability[${i}].kind`,
            value: w.kind,
            reason: "unknown_kind",
          });
          return;
        }
        const r = reconcile(w, { kind: "date", now });
        w.value = r.value;
        w.needs_confirmation = r.needs_confirmation;
        if (r.value) {
          w.from = r.value.from;
          w.to = r.value.to;
        }
        if (r.needs_confirmation)
          flagConfirm(`availability[${i}]`, w.span, "reparse_disagreement");
        windows.push(w);
      });
      hard.availability = windows.length ? windows : null;
    }

    // ── credentials → honesty gate ───────────────────────────────────────────
    if (hard.credentials && typeof hard.credentials === "object") {
      const cred = hard.credentials;
      const asked = ["tearsheets", "runway_shows", "fit_experience", "published_work"].some(
        (k) => cred[k] === true,
      );
      if (asked) contract.credential_gate = true;
      else if (
        cred.tearsheets == null &&
        cred.runway_shows == null &&
        cred.fit_experience == null &&
        cred.published_work == null
      ) {
        hard.credentials = null;
      }
    }

    // ── protected-class enforcement (ethnicity / heritage / skin-tone) ───────
    const scrubbed = enforceProtected(
      { label, softQuery, hard },
      contract.set_aside,
    );

    contract.roles.push({
      label,
      count: Number.isInteger(role?.count) && role.count >= 1 ? role.count : 1,
      hard,
      soft_query: scrubbed.softQuery,
    });
  });

  // Deduplicate set_aside entries.
  const seen = new Set();
  contract.set_aside = contract.set_aside.filter((s) => {
    const key = s.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!contract.roles.length && !rawContract) return { ...packageOut(emptyContract()) };

  return packageOut(contract, dropped, needsConfirmationFields);

  function packageOut(c, drop = [], needsC = []) {
    c.credential_gate = Boolean(c.credential_gate);
    return {
      contract: c,
      dropped: drop,
      needs_confirmation_fields: needsC,
      multi_role: (c.roles || []).length > 1,
    };
  }
}

/**
 * Move protected-class terms out of a role's free text into set_aside.
 * Hair/eye colour collisions ("black hair", "blonde") are exempted.
 */
function enforceProtected(role, setAside) {
  let softQuery = role.softQuery || "";
  const haystacks = [role.label || "", softQuery];

  for (const term of PROTECTED_CLASS_TERMS) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (const hay of haystacks) {
      const m = hay.match(re);
      if (!m) continue;
      // Skip hair/eye colour context ("black hair", "blonde", "brown eyes").
      const window = hay.slice(
        Math.max(0, m.index - 12),
        m.index + m[0].length + 12,
      );
      if (PROTECTED_TERM_SAFE_CONTEXT.test(window)) continue;
      setAside.push({ text: m[0], reason: "not_used_for_filtering" });
      softQuery = softQuery.replace(re, " ").replace(/\s+/g, " ").trim();
    }
  }

  return { softQuery };
}

module.exports = { validateContract, enforceProtected };
