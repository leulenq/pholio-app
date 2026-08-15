"use strict";

/** Presentation helpers for the natural-language constraint contract. */

const { tierFor } = require("./field-whitelist");

function spanOffsets(brief, spanText) {
  if (!brief || !spanText) return null;
  const index = String(brief).indexOf(String(spanText));
  if (index < 0) return null;
  return [index, index + String(spanText).length];
}

function constraintValue(field, constraint) {
  if (
    field === "gender_presentation" ||
    field === "boards" ||
    field === "hair_color" ||
    field === "eye_color" ||
    field === "representation_status"
  ) {
    return Array.isArray(constraint)
      ? constraint
      : constraint?.value ?? constraint;
  }
  if (field === "location") return constraint?.market ?? null;
  if (field === "availability") {
    return Array.isArray(constraint)
      ? constraint.map((window) => ({
          kind: window.kind,
          from: window.from ?? null,
          to: window.to ?? null,
        }))
      : null;
  }
  if (field === "visible_tattoos") return constraint;
  if (field === "union" || field === "experience_level") return constraint;
  if (field === "credentials") {
    return ["tearsheets", "runway_shows", "fit_experience", "published_work"].filter(
      (key) => constraint && constraint[key] === true,
    );
  }
  if (constraint && typeof constraint === "object") {
    if (constraint.value != null) return constraint.value;
    if (constraint.a != null || constraint.b != null) {
      return { a: constraint.a ?? null, b: constraint.b ?? null };
    }
    if (constraint.size != null) {
      return { size: constraint.size, region: constraint.region ?? null };
    }
  }
  return constraint ?? null;
}

function appliedEntry(brief, field, constraint, options = {}) {
  const span =
    options.span != null ? options.span : constraint && constraint.span;
  return {
    field,
    op: (constraint && constraint.op) || null,
    value: constraintValue(field, constraint),
    span: spanOffsets(brief, span),
    confidence:
      constraint &&
      typeof constraint === "object" &&
      constraint.confidence != null
        ? constraint.confidence
        : null,
    needs_confirmation: Boolean(
      constraint &&
        typeof constraint === "object" &&
        constraint.needs_confirmation === true,
    ),
    tier: tierFor(field),
  };
}

function buildApplied(brief, hard) {
  const constraints = hard || {};
  const applied = [];

  for (const field of [
    "gender_presentation",
    "boards",
    "hair_color",
    "eye_color",
    "representation_status",
  ]) {
    if (Array.isArray(constraints[field]) && constraints[field].length) {
      applied.push(appliedEntry(brief, field, constraints[field], { span: null }));
    }
  }

  for (const field of ["height_cm", "playing_age"]) {
    if (constraints[field]) {
      applied.push(appliedEntry(brief, field, constraints[field]));
    }
  }

  if (constraints.measurements && typeof constraints.measurements === "object") {
    for (const key of [
      "bust_cm",
      "chest_cm",
      "waist_cm",
      "hips_cm",
      "inseam_cm",
      "dress_size",
      "suit_size",
    ]) {
      if (constraints.measurements[key]) {
        applied.push(
          appliedEntry(
            brief,
            `measurements.${key}`,
            constraints.measurements[key],
          ),
        );
      }
    }
  }

  if (constraints.shoe?.size != null) {
    applied.push(appliedEntry(brief, "shoe", constraints.shoe));
  }
  if (constraints.location?.market) {
    applied.push(appliedEntry(brief, "location", constraints.location));
  }
  if (Array.isArray(constraints.availability) && constraints.availability.length) {
    applied.push(
      appliedEntry(brief, "availability", constraints.availability, {
        span:
          constraints.availability.map((window) => window.span).find(Boolean) ||
          null,
      }),
    );
  }
  if (
    constraints.visible_tattoos === true ||
    constraints.visible_tattoos === false
  ) {
    applied.push(
      appliedEntry(brief, "visible_tattoos", constraints.visible_tattoos, {
        span: null,
      }),
    );
  }
  if (constraints.union) {
    applied.push(appliedEntry(brief, "union", constraints.union, { span: null }));
  }
  if (constraints.experience_level) {
    applied.push(
      appliedEntry(brief, "experience_level", constraints.experience_level, {
        span: null,
      }),
    );
  }
  if (constraints.credentials && typeof constraints.credentials === "object") {
    applied.push(appliedEntry(brief, "credentials", constraints.credentials));
  }

  return applied;
}

function buildUnderstanding(contract, brief, multiRoleNotice) {
  const roles = Array.isArray(contract?.roles) ? contract.roles : [];
  const primary = roles[0] || { hard: {}, soft_query: "" };
  return {
    roles: roles.map((role) => ({
      label: role.label,
      count: role.count,
      soft_query: role.soft_query,
    })),
    applied: buildApplied(brief, primary.hard),
    set_aside: Array.isArray(contract?.set_aside) ? contract.set_aside : [],
    multi_role_notice: multiRoleNotice || null,
  };
}

module.exports = {
  spanOffsets,
  constraintValue,
  buildApplied,
  buildUnderstanding,
};
