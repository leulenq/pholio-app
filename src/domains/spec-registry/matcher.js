"use strict";

const { normalizeShotSlug } = require("../../shared/constants/frame-taxonomy");

/**
 * Conservative, pure evaluator for immutable Spec Registry revisions.
 *
 * It deliberately evaluates only facts which Pholio can substantiate.  In
 * particular, machine-generated image signals are not treated as proof: frame
 * and view need a user-confirmed structured image label, and absent retouch
 * data never proves an image is unretouched.
 */

const OUTCOMES = Object.freeze({
  SATISFIED: "satisfied",
  MISSING: "missing",
  VIOLATES: "violates",
  UNKNOWN: "unknown",
  NOT_APPLICABLE: "not_applicable",
});

const TRUE = "true";
const FALSE = "false";
const UNKNOWN = "unknown";
const MISSING = "missing";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function finitePositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseReferenceDate(referenceDate) {
  if (typeof referenceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    throw new TypeError("referenceDate must be an injected UTC YYYY-MM-DD date");
  }
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== referenceDate) {
    throw new TypeError("referenceDate must be a valid UTC YYYY-MM-DD date");
  }
  return date;
}

function computeAge(dateOfBirth, referenceDate) {
  if (!nonEmptyString(dateOfBirth)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateOfBirth).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const born = new Date(Date.UTC(year, month - 1, day));
  if (
    born.getUTCFullYear() !== year ||
    born.getUTCMonth() !== month - 1 ||
    born.getUTCDate() !== day
  ) {
    return null;
  }
  let age = referenceDate.getUTCFullYear() - year;
  if (
    referenceDate.getUTCMonth() + 1 < month ||
    (referenceDate.getUTCMonth() + 1 === month && referenceDate.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

function fact(state, value, source) {
  return { state, value: value ?? null, source: source || null };
}

function supportedValue(value, source, validator = nonEmptyString) {
  return validator(value) ? fact("known", value, source) : fact("missing", null, source);
}

function normalizeWorkAuthorization(value) {
  if (value === true || value === 1 || String(value).trim().toLowerCase() === "yes") return true;
  if (value === false || value === 0 || String(value).trim().toLowerCase() === "no") return false;
  return null;
}

function normalizedTalent(input) {
  const source = isObject(input?.talent) ? input.talent : {};
  return {
    firstName: source.firstName ?? source.first_name ?? null,
    lastName: source.lastName ?? source.last_name ?? null,
    email: source.email ?? null,
    phone: source.phone ?? null,
    city: source.city ?? null,
    dateOfBirth: source.dateOfBirth ?? source.date_of_birth ?? null,
    heightCm: source.heightCm ?? source.height_cm ?? null,
    weightKg: source.weightKg ?? source.weight_kg ?? null,
    bustCm: source.bustCm ?? source.bust_cm ?? null,
    chestCm: source.chestCm ?? source.chest_cm ?? null,
    waistCm: source.waistCm ?? source.waist_cm ?? null,
    hipsCm: source.hipsCm ?? source.hips_cm ?? null,
    shoeSize: source.shoeSize ?? source.shoe_size ?? null,
    dressSize: source.dressSize ?? source.dress_size ?? null,
    suitSize: source.suitSize ?? source.suit_size ?? null,
    nationality: source.nationality ?? null,
    gender: source.gender ?? null,
    pronouns: source.pronouns ?? null,
    workAuthorization: normalizeWorkAuthorization(
      source.workAuthorization ?? source.work_authorization ?? null,
    ),
    hairColor: source.hairColor ?? source.hair_color ?? null,
    eyeColor: source.eyeColor ?? source.eye_color ?? null,
    social: isObject(source.social) ? source.social : {},
  };
}

function normalizedImages(input) {
  const images = Array.isArray(input?.images) ? input.images : [];
  return images
    .filter((image) => isObject(image) && nonEmptyString(image.id))
    .map((image) => ({
      ...image,
      id: String(image.id),
      classification: isObject(image.classification) ? image.classification : {},
      file: isObject(image.file) ? image.file : {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function isUserConfirmed(image) {
  return image?.classification?.source === "user" && image?.classification?.confirmed === true;
}

function imageFact(image, field) {
  const confirmed = isUserConfirmed(image);
  const shot = normalizeShotSlug(image.shotType ?? image.shot_type ?? null);

  if (field === "shot.frame") {
    if (!confirmed || !nonEmptyString(shot)) return fact(UNKNOWN);
    const frames = new Set(["full_length", "portrait_length", "close_up", "headshot", "mid_length", "waist_up"]);
    return frames.has(shot) ? fact("known", shot, "user_confirmed_shot_type") : fact(UNKNOWN);
  }
  if (field === "shot.view") {
    if (!confirmed || !nonEmptyString(shot)) return fact(UNKNOWN);
    if (["profile", "profile_left", "profile_right"].includes(shot)) {
      return fact("known", "profile", "user_confirmed_shot_type");
    }
    // Frame taxonomy has no reliable "front" structured field. A confirmed
    // headshot is still not evidence that it is front-facing.
    return fact(UNKNOWN);
  }
  if (field === "expression.smile") {
    const expression = image.expression ?? image.signals?.expression ?? null;
    if (!confirmed || !nonEmptyString(expression)) return fact(UNKNOWN);
    if (expression === "smile") return fact("known", true, "user_confirmed_expression");
    if (["neutral", "serious"].includes(expression)) {
      return fact("known", false, "user_confirmed_expression");
    }
    return fact(UNKNOWN);
  }
  if (field === "alteration.retouch_used") {
    return image.retouchedAt ?? image.retouched_at
      ? fact("known", true, "declared_retouch_date")
      : fact(UNKNOWN);
  }
  if (field === "file.size_bytes") {
    const value = image.file.sizeBytes ?? image.file.size_bytes;
    return finitePositiveNumber(value)
      ? fact("known", value, "persisted_file_size")
      : fact(UNKNOWN);
  }
  if (field === "file.mime_type") {
    const value = image.file.mimeType ?? image.file.mime_type;
    return nonEmptyString(value) ? fact("known", value, "persisted_file_mime") : fact(UNKNOWN);
  }
  // All other visual facts are either unsupported today or AI-only.  Their
  // absence is deliberately distinct from a known negative value.
  return fact(UNKNOWN);
}

function talentFact(input, field, referenceDate) {
  const talent = normalizedTalent(input);
  const strings = {
    "applicant.first_name": talent.firstName,
    "applicant.last_name": talent.lastName,
    "contact.email": talent.email,
    "contact.phone": talent.phone,
    "contact.city": talent.city,
    "measurements.shoe_size": talent.shoeSize,
    "measurements.clothing_size": talent.dressSize ?? talent.suitSize,
    "applicant.nationality": talent.nationality,
    "applicant.pronouns": talent.pronouns,
    "appearance.hair_color": talent.hairColor,
    "appearance.eye_color": talent.eyeColor,
  };
  if (Object.hasOwn(strings, field)) return supportedValue(strings[field], "profile");
  if (field === "applicant.full_name") {
    if (nonEmptyString(talent.firstName) && nonEmptyString(talent.lastName)) {
      return fact("known", `${talent.firstName.trim()} ${talent.lastName.trim()}`, "profile");
    }
    return fact("missing", null, "profile");
  }
  if (field === "applicant.date_of_birth") {
    return supportedValue(talent.dateOfBirth, "profile");
  }
  if (field === "applicant.gender") {
    const normalized = String(talent.gender || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const values = {
      male: "male",
      female: "female",
      non_binary: "non_binary",
    };
    return values[normalized]
      ? fact("known", values[normalized], "profile_gender")
      : nonEmptyString(talent.gender)
        ? fact(UNKNOWN)
        : fact("missing", null, "profile");
  }
  if (field === "application.work_authorization") {
    return typeof talent.workAuthorization === "boolean"
      ? fact("known", talent.workAuthorization, "profile")
      : fact(UNKNOWN);
  }
  if (field === "applicant.age_years") {
    const age = computeAge(talent.dateOfBirth, referenceDate);
    return age == null ? fact("missing", null, "profile") : fact("known", age, "profile_date_of_birth");
  }
  const numbers = {
    "applicant.height_cm": talent.heightCm,
    "measurements.height": talent.heightCm,
    "measurements.weight": talent.weightKg,
    "measurements.bust": talent.bustCm,
    "measurements.chest": talent.chestCm,
    "measurements.waist": talent.waistCm,
    "measurements.hips": talent.hipsCm,
  };
  if (Object.hasOwn(numbers, field)) return supportedValue(numbers[field], "profile", finitePositiveNumber);
  if (field.startsWith("social.")) {
    return supportedValue(talent.social[field.slice("social.".length)], "social_account");
  }
  // Visual presentation, destination, and guardian form data deliberately
  // require a source-specific declaration surface that does not exist yet.
  return fact(UNKNOWN);
}

function compare(knownValue, constraint) {
  const { operator, value } = constraint;
  switch (operator) {
    case "equals": return knownValue === value;
    case "not_equals": return knownValue !== value;
    case "in": return Array.isArray(value) && value.includes(knownValue);
    case "not_in": return Array.isArray(value) && !value.includes(knownValue);
    case "gte": return typeof knownValue === "number" && knownValue >= value;
    case "lte": return typeof knownValue === "number" && knownValue <= value;
    case "gt": return typeof knownValue === "number" && knownValue > value;
    case "lt": return typeof knownValue === "number" && knownValue < value;
    case "between":
      return Array.isArray(value) && value.length === 2 && typeof knownValue === "number" && knownValue >= value[0] && knownValue <= value[1];
    // Registry schemas represent an existence assertion with a null value.
    // Reaching compare() already means the fact is known; its truthiness must
    // not turn a known empty-ish scalar into a false existence result.
    case "exists": return true;
    default: return null;
  }
}

function combineAll(states) {
  if (states.includes(FALSE)) return FALSE;
  if (states.every((state) => state === TRUE)) return TRUE;
  if (states.includes(UNKNOWN)) return UNKNOWN;
  return MISSING;
}

function combineAny(states) {
  if (states.includes(TRUE)) return TRUE;
  if (states.every((state) => state === FALSE)) return FALSE;
  if (states.includes(UNKNOWN)) return UNKNOWN;
  return MISSING;
}

function evaluateExpression(expression, getFact) {
  if (!expression) return { state: TRUE, facts: [] };
  if (Array.isArray(expression.all)) {
    const children = expression.all.map((child) => evaluateExpression(child, getFact));
    return { state: combineAll(children.map((child) => child.state)), facts: children.flatMap((child) => child.facts) };
  }
  if (Array.isArray(expression.any)) {
    const children = expression.any.map((child) => evaluateExpression(child, getFact));
    return { state: combineAny(children.map((child) => child.state)), facts: children.flatMap((child) => child.facts) };
  }
  if (expression.not) {
    const child = evaluateExpression(expression.not, getFact);
    return {
      state: child.state === TRUE ? FALSE : child.state === FALSE ? TRUE : child.state,
      facts: child.facts,
    };
  }
  const current = getFact(expression.field);
  if (current.state === "known") {
    // The source-specific "female identified" audience is intentionally not
    // inferred from Pholio's broader stored gender value.
    if (
      expression.field === "applicant.gender" &&
      current.source === "profile_gender" &&
      (expression.value === "female_identified" ||
        (Array.isArray(expression.value) &&
          expression.value.includes("female_identified")))
    ) {
      return {
        state: UNKNOWN,
        facts: [{ field: expression.field, ...current }],
      };
    }
    const result = compare(current.value, expression);
    return { state: result === true ? TRUE : result === false ? FALSE : UNKNOWN, facts: [{ field: expression.field, ...current }] };
  }
  return { state: current.state === "missing" ? MISSING : UNKNOWN, facts: [{ field: expression.field, ...current }] };
}

function appliesState(expression, getFact) {
  const result = evaluateExpression(expression, getFact);
  return result.state === MISSING ? UNKNOWN : result.state;
}

function resultForConstraint(modality, state) {
  if (modality === "prohibited") {
    if (state === TRUE) return OUTCOMES.VIOLATES;
    if (state === FALSE) return OUTCOMES.SATISFIED;
  } else {
    if (state === TRUE) return OUTCOMES.SATISFIED;
    if (state === FALSE) return OUTCOMES.VIOLATES;
  }
  if (state === MISSING) return OUTCOMES.MISSING;
  return OUTCOMES.UNKNOWN;
}

function applyModalityToSet(states, modality) {
  if (modality === "prohibited") {
    if (states.includes(TRUE)) return OUTCOMES.VIOLATES;
    if (states.every((state) => state === FALSE)) return OUTCOMES.SATISFIED;
    return OUTCOMES.UNKNOWN;
  }
  if (states.includes(FALSE)) return OUTCOMES.VIOLATES;
  if (states.every((state) => state === TRUE)) return OUTCOMES.SATISFIED;
  if (states.includes(UNKNOWN)) return OUTCOMES.UNKNOWN;
  return OUTCOMES.MISSING;
}

function makeResult(rule, outcome, extra = {}) {
  return {
    id: rule.id,
    modality: rule.modality ?? rule.presence ?? null,
    sourceLabel: rule.sourceLabel ?? null,
    matchability: rule.matchability ?? null,
    basis: rule.basis ?? null,
    field:
      rule.constraint?.field ?? rule.match?.field ?? rule.field ?? null,
    // The canonical taxonomy value a shot slot matches on — `close_up`,
    // `full_length`, `profile`. Agencies label the same shot differently
    // ("close-up" / "Close up (hair pulled back)"), so the label cannot be used
    // to line one agency's requirements up against another's. This can, and
    // that comparison is the whole point of carrying fifty agencies.
    matchValue: rule.match?.value ?? null,
    outcome,
    evidenceIds: Array.isArray(rule.evidenceIds) ? rule.evidenceIds : [],
    ...extra,
  };
}

function expandSlots(slots, input, referenceDate) {
  const instances = [];
  const immediatelyEvaluated = [];
  for (const slot of [...(slots || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const applicable = appliesState(slot.appliesWhen, (field) => talentFact(input, field, referenceDate));
    if (applicable === FALSE) {
      immediatelyEvaluated.push(makeResult(slot, OUTCOMES.NOT_APPLICABLE, { assignments: [] }));
      continue;
    }
    if (applicable !== TRUE) {
      immediatelyEvaluated.push(makeResult(slot, OUTCOMES.UNKNOWN, { assignments: [], appliesWhen: applicable }));
      continue;
    }
    const minimum = Number(slot.quantity?.minimum) || 1;
    for (let index = 0; index < minimum; index += 1) {
      instances.push({ key: `${slot.id}#${index + 1}`, slot, index });
    }
  }
  return { instances, immediatelyEvaluated };
}

function maximumMatching(instances, candidateIds, candidatesByInstance, allowReuse) {
  if (allowReuse) {
    const result = new Map();
    for (const instance of instances) {
      const first = candidatesByInstance.get(instance.key)?.[0];
      if (first) result.set(instance.key, first);
    }
    return result;
  }
  const imageToInstance = new Map();
  const assignment = new Map();
  function assign(instanceKey, visited) {
    for (const imageId of candidatesByInstance.get(instanceKey) || []) {
      if (visited.has(imageId)) continue;
      visited.add(imageId);
      const existing = imageToInstance.get(imageId);
      if (!existing || assign(existing, visited)) {
        imageToInstance.set(imageId, instanceKey);
        assignment.set(instanceKey, imageId);
        return true;
      }
    }
    return false;
  }
  for (const instance of instances) assign(instance.key, new Set());
  return assignment;
}

function evaluateSlots(rules, input, referenceDate) {
  const slots = rules?.shots?.slots || [];
  const images = normalizedImages(input);
  const { instances, immediatelyEvaluated } = expandSlots(slots, input, referenceDate);
  const candidatesByInstance = new Map();
  const unknownByInstance = new Map();
  for (const instance of instances) {
    const candidates = [];
    const unknowns = [];
    for (const image of images) {
      const expression = evaluateExpression(instance.slot.match, (field) => imageFact(image, field));
      if (expression.state === TRUE) candidates.push(image.id);
      else if (expression.state === UNKNOWN || expression.state === MISSING) unknowns.push(image.id);
    }
    candidatesByInstance.set(instance.key, candidates.sort());
    unknownByInstance.set(instance.key, unknowns.sort());
  }
  const assignments = maximumMatching(
    instances,
    images.map((image) => image.id),
    candidatesByInstance,
    rules?.shots?.allowImageReuseAcrossSlots === true,
  );
  const bySlot = new Map();
  for (const instance of instances) {
    const aggregate = bySlot.get(instance.slot.id) || { slot: instance.slot, instances: [] };
    aggregate.instances.push(instance);
    bySlot.set(instance.slot.id, aggregate);
  }
  const results = [...immediatelyEvaluated];
  for (const { slot, instances: slotInstances } of [...bySlot.values()].sort((a, b) => a.slot.id.localeCompare(b.slot.id))) {
    const matched = slotInstances
      .map((instance) => ({ instance, imageId: assignments.get(instance.key) || null }))
      .filter((entry) => entry.imageId);
    const unmatched = slotInstances.filter((instance) => !assignments.has(instance.key));
    const hasUnknownCandidate = unmatched.some((instance) => (unknownByInstance.get(instance.key) || []).length > 0);
    results.push(makeResult(slot,
      unmatched.length === 0 ? OUTCOMES.SATISFIED : hasUnknownCandidate ? OUTCOMES.UNKNOWN : OUTCOMES.MISSING,
      {
        assignments: matched.map(({ instance, imageId }) => ({ instance: instance.index + 1, imageId })),
        candidateImageIds: [...new Set(slotInstances.flatMap((instance) => candidatesByInstance.get(instance.key) || []))],
        unknownCandidateImageIds: [...new Set(unmatched.flatMap((instance) => unknownByInstance.get(instance.key) || []))],
      },
    ));
  }
  return {
    results,
    assignments,
    unresolvedSlotIds: results
      .filter((result) => result.outcome === OUTCOMES.UNKNOWN)
      .map((result) => result.id),
  };
}

function evaluateShotCount(rules, input, referenceDate) {
  const count = rules?.shots?.count;
  if (!count) return [];
  const rule = {
    id: "shot-count",
    modality: "requested",
    sourceLabel: "Image count",
    evidenceIds: count.evidenceIds || [],
  };
  const applicable = appliesState(count.appliesWhen, (field) => talentFact(input, field, referenceDate));
  if (applicable === FALSE) return [makeResult(rule, OUTCOMES.NOT_APPLICABLE)];
  if (applicable !== TRUE) return [makeResult(rule, OUTCOMES.UNKNOWN, { appliesWhen: applicable })];
  const actual = normalizedImages(input).length;
  if (count.maximum != null && actual > count.maximum) {
    return [makeResult(rule, OUTCOMES.VIOLATES, { actual, minimum: count.minimum, maximum: count.maximum })];
  }
  if (count.minimum != null && actual < count.minimum) {
    return [makeResult(rule, OUTCOMES.MISSING, { actual, minimum: count.minimum, maximum: count.maximum })];
  }
  if (count.minimum == null && count.maximum == null) {
    return [makeResult(rule, OUTCOMES.UNKNOWN, { actual, minimum: null, maximum: null })];
  }
  return [makeResult(rule, OUTCOMES.SATISFIED, { actual, minimum: count.minimum, maximum: count.maximum })];
}

function selectedImagesForSetRule(rule, images, slotEvaluation) {
  if (rule.appliesTo?.mode !== "selected_shots") {
    return { images, unresolvedShotIds: [] };
  }
  const wanted = new Set(rule.appliesTo.shotIds || []);
  const ids = new Set();
  for (const [instanceKey, imageId] of slotEvaluation.assignments.entries()) {
    const slotId = instanceKey.slice(0, instanceKey.lastIndexOf("#"));
    if (wanted.has(slotId)) ids.add(imageId);
  }
  return {
    images: images.filter((image) => ids.has(image.id)),
    unresolvedShotIds: (slotEvaluation.unresolvedSlotIds || [])
      .filter((slotId) => wanted.has(slotId)),
  };
}

function evaluateSetWide(rules, input, referenceDate, slotEvaluation) {
  const images = normalizedImages(input);
  return (rules?.setWide || []).map((rule) => {
    const applicable = appliesState(rule.appliesWhen, (field) => talentFact(input, field, referenceDate));
    if (applicable === FALSE) return makeResult(rule, OUTCOMES.NOT_APPLICABLE);
    if (applicable !== TRUE) return makeResult(rule, OUTCOMES.UNKNOWN, { appliesWhen: applicable });
    const selection = selectedImagesForSetRule(rule, images, slotEvaluation);
    const subjectImages = selection.images;
    if (selection.unresolvedShotIds.length) {
      return makeResult(rule, OUTCOMES.UNKNOWN, {
        imageIds: subjectImages.map((image) => image.id),
        unresolvedShotIds: selection.unresolvedShotIds,
      });
    }
    if (!subjectImages.length) return makeResult(rule, OUTCOMES.MISSING, { imageIds: [] });
    const checks = subjectImages.map((image) => evaluateExpression(rule.constraint, (field) => imageFact(image, field)));
    return makeResult(rule, applyModalityToSet(checks.map((check) => check.state), rule.modality), {
      imageIds: subjectImages.map((image) => image.id),
      facts: checks.flatMap((check) => check.facts),
    });
  });
}

function evaluateAtomicRules(rules, input, referenceDate, kind) {
  return (rules || []).map((rule) => {
    const applicable = appliesState(rule.appliesWhen, (field) => talentFact(input, field, referenceDate));
    if (applicable === FALSE) return makeResult(rule, OUTCOMES.NOT_APPLICABLE);
    if (applicable !== TRUE) return makeResult(rule, OUTCOMES.UNKNOWN, { appliesWhen: applicable });

    if (kind === "files" && rule.scope === "per_file") {
      const images = normalizedImages(input);
      if (!images.length) return makeResult(rule, OUTCOMES.MISSING, { imageIds: [] });
      const checks = images.map((image) => evaluateExpression(rule.constraint, (field) => imageFact(image, field)));
      return makeResult(rule, applyModalityToSet(checks.map((check) => check.state), rule.modality), {
        imageIds: images.map((image) => image.id),
        facts: checks.flatMap((check) => check.facts),
      });
    }

    const getFact = (field) => {
      if (field === "file.count") return fact("known", normalizedImages(input).length, "selected_images");
      return talentFact(input, field, referenceDate);
    };
    const check = evaluateExpression(rule.constraint, getFact);
    return makeResult(rule, resultForConstraint(rule.modality, check.state), { facts: check.facts });
  });
}

function evaluateApplicationFields(rules, input, referenceDate) {
  return (rules?.applicationFields || []).map((rule) => {
    const applicable = appliesState(rule.appliesWhen, (field) => talentFact(input, field, referenceDate));
    if (applicable === FALSE) return makeResult(rule, OUTCOMES.NOT_APPLICABLE);
    if (applicable !== TRUE) return makeResult(rule, OUTCOMES.UNKNOWN, { appliesWhen: applicable });
    if (rule.presence === "optional") {
      return makeResult(rule, OUTCOMES.NOT_APPLICABLE);
    }
    if (rule.presence === "present_requiredness_unknown") return makeResult(rule, OUTCOMES.UNKNOWN);
    const current = talentFact(input, rule.field, referenceDate);
    return makeResult(rule, current.state === "known" ? OUTCOMES.SATISFIED : current.state === "missing" ? OUTCOMES.MISSING : OUTCOMES.UNKNOWN, {
      facts: [{ field: rule.field, ...current }],
    });
  });
}

function evaluateSpecRevision({ spec, input, referenceDate }) {
  if (!isObject(spec) || !nonEmptyString(spec.revisionId)) {
    throw new TypeError("spec must be an immutable revision with revisionId");
  }
  const utcReferenceDate = parseReferenceDate(referenceDate);
  const slotEvaluation = evaluateSlots(spec.rules || {}, input || {}, utcReferenceDate);
  const results = {
    shotCount: evaluateShotCount(spec.rules || {}, input || {}, utcReferenceDate),
    shots: slotEvaluation.results,
    setWide: evaluateSetWide(spec.rules || {}, input || {}, utcReferenceDate, slotEvaluation),
    files: evaluateAtomicRules(spec.rules?.files || [], input || {}, utcReferenceDate, "files"),
    eligibility: evaluateAtomicRules(spec.rules?.eligibility || [], input || {}, utcReferenceDate, "eligibility"),
    applicationFields: evaluateApplicationFields(spec.rules || {}, input || {}, utcReferenceDate),
  };
  const all = Object.values(results).flat();
  const summary = Object.fromEntries(Object.values(OUTCOMES).map((outcome) => [outcome, all.filter((item) => item.outcome === outcome).length]));
  return {
    revisionId: spec.revisionId,
    seriesId: spec.seriesId ?? null,
    referenceDate,
    // Preserve the immutable record's declared mode for consumers which need
    // to label the result. This module itself remains non-enforcing: it never
    // returns a block/allow decision or a score.
    evaluationMode: spec.evaluationMode === "blocking" ? "blocking" : "advisory",
    outcomes: results,
    summary,
  };
}

module.exports = {
  OUTCOMES,
  computeAge,
  evaluateExpression,
  evaluateSpecRevision,
  imageFact,
  talentFact,
};
