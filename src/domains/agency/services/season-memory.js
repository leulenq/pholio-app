"use strict";

/**
 * Season memory — "You passed on her in SS26. Since then: new digitals, +2cm,
 * now signed in Milan." (plan A4 #12, strategic analysis §9.3.)
 *
 * The problem it solves is stated plainly in §3: "'Keep on file' is a promise
 * with no system. The Bureau tells applicants strong applications are 'kept for
 * future seasons'; agencies' actual mechanism is a dead email thread." Agencies
 * re-review the same faces with zero recall, so a talent who was told to come
 * back and did gets read as a stranger.
 *
 * THE BINDING CONSTRAINT, and the reason this file looks the way it does.
 *
 * Plan C3 marks appearance-change detection as "the single highest-risk feature
 * in this plan" under Illinois BIPA — $1,000 negligent, $5,000 reckless, per
 * violation, with a private right of action. Its ruling is unambiguous: a
 * change signal "must NOT work by comparing faces across photo sets. Implement
 * as talent self-declaration plus non-biometric signals (new capture date,
 * hair-colour tag, declared measurement change)."
 *
 * So every signal here is a comparison of DECLARED VALUES or of DATES. Nothing
 * reads a pixel. Two submissions are compared the way two paper forms would be:
 * the numbers the person wrote, and when the pictures were taken. There is no
 * image analysis in this module and there must never be one — that is not a
 * performance decision, it is the compliance boundary the whole feature lives
 * inside.
 *
 * The second rule is honesty about absence. A measurement that was blank before
 * and is filled now is "newly given", not "+4cm from zero". A set with no
 * capture dates cannot be said to be newer or older than another. Where the
 * data cannot support a claim, the claim is not made.
 */

const { dateOnly } = require("../../spec-registry/store/repository");
const {
  hasApplicantIdentitySupport,
  resolveApplicantIdentity,
} = require("./applicant-identity");
const {
  loadApplicationSubmissionPackages,
  orderedImages,
  parsePayload,
} = require("./application-submission-package");
const {
  loadTalentRepresentationsForProfiles,
} = require("../../../shared/lib/audience-dto");
const {
  redactExpiredSubmissionPackages,
} = require("../../../shared/lib/submission-retention");

/** Measurements a booker actually re-reads, in the order they are asked for. */
const TRACKED_MEASUREMENTS = Object.freeze([
  { key: "height_cm", label: "Height", unit: "cm" },
  { key: "bust_cm", label: "Bust", unit: "cm" },
  { key: "chest_cm", label: "Chest", unit: "cm" },
  { key: "waist_cm", label: "Waist", unit: "cm" },
  { key: "hips_cm", label: "Hips", unit: "cm" },
  { key: "inseam_cm", label: "Inseam", unit: "cm" },
]);

/** Declared, self-reported appearance fields. Never inferred from an image. */
const TRACKED_DECLARED = Object.freeze([
  { key: "hair_color", label: "Hair" },
  { key: "eye_color", label: "Eyes" },
  { key: "city", label: "Based in" },
]);

/** Below this, a difference is noise — a tape measure held differently. */
const MEASUREMENT_NOISE_CM = 1;

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Measurement movement between two submissions, from what the talent DECLARED.
 *
 * @param {object} priorProfile
 * @param {object} currentProfile
 */
function measurementChanges(priorProfile, currentProfile) {
  const changes = [];
  for (const { key, label, unit } of TRACKED_MEASUREMENTS) {
    const before = numberOrNull(priorProfile?.[key]);
    const after = numberOrNull(currentProfile?.[key]);

    if (before === null && after === null) continue;

    // Newly given is not growth. A blank that becomes 61 did not move by 61.
    if (before === null) {
      changes.push({ key, label, unit, kind: "newly_given", before: null, after });
      continue;
    }
    if (after === null) {
      changes.push({ key, label, unit, kind: "withdrawn", before, after: null });
      continue;
    }

    const delta = after - before;
    if (Math.abs(delta) < MEASUREMENT_NOISE_CM) continue;
    changes.push({ key, label, unit, kind: "changed", before, after, delta });
  }
  return changes;
}

/**
 * Declared appearance/location changes. Self-reported both times.
 *
 * @param {object} priorProfile
 * @param {object} currentProfile
 */
function declaredChanges(priorProfile, currentProfile) {
  const changes = [];
  for (const { key, label } of TRACKED_DECLARED) {
    const before = textOrNull(priorProfile?.[key]);
    const after = textOrNull(currentProfile?.[key]);
    if (before === after) continue;
    if (before === null && after === null) continue;
    changes.push({
      key,
      label,
      kind: before === null ? "newly_given" : after === null ? "withdrawn" : "changed",
      before,
      after,
    });
  }
  return changes;
}

/**
 * Whether the digitals are new, judged ONLY by capture date and count.
 *
 * This is the signal C3 sanctions in place of appearance comparison: "new
 * capture date". It answers "did they shoot again?", never "do they look
 * different?", and the difference between those two questions is the entire
 * compliance position.
 *
 * @param {Array<object>} priorImages
 * @param {Array<object>} currentImages
 */
function digitalsChange(priorImages, currentImages) {
  const captured = (images) =>
    (images || [])
      .map((image) => dateOnly(image?.captured_at))
      .filter(Boolean)
      .sort();

  const before = captured(priorImages);
  const after = captured(currentImages);

  // Nothing datable on one side or the other: no claim can be made about which
  // set is newer, so none is.
  if (before.length === 0 || after.length === 0) {
    return {
      kind: "undated",
      newestBefore: before[before.length - 1] || null,
      newestAfter: after[after.length - 1] || null,
    };
  }

  const newestBefore = before[before.length - 1];
  const newestAfter = after[after.length - 1];

  return {
    kind: newestAfter > newestBefore ? "reshot" : "same_set",
    newestBefore,
    newestAfter,
  };
}

/**
 * Representation movement — the "now signed in Milan" half.
 *
 * Only representations the talent chose to disclose are named; the rest count
 * but stay anonymous, which is the same rule the dossier follows.
 *
 * @param {Array<object>} priorReps
 * @param {Array<object>} currentReps
 */
function representationChange(priorReps, currentReps) {
  const active = (rows) =>
    (rows || []).filter((row) => row && row.status === "active" && !row.ended_on);

  const before = active(priorReps);
  const after = active(currentReps);

  if (before.length === 0 && after.length === 0) return null;

  const named = after
    .filter((row) => row.disclose_agency_name)
    .map((row) =>
      [row.external_agency_name, row.market].filter(Boolean).join(", "),
    )
    .filter(Boolean);

  if (after.length > before.length) {
    return { kind: "signed", count: after.length, named };
  }
  if (after.length < before.length) {
    return { kind: "released", count: after.length, named };
  }
  return null;
}

/**
 * The full diff between a prior submission and the current one.
 *
 * @param {{prior: object, current: object}} input each `{profile, images, representations}`
 */
function diffSubmissions({ prior, current }) {
  return {
    measurements: measurementChanges(prior?.profile, current?.profile),
    declared: declaredChanges(prior?.profile, current?.profile),
    digitals: digitalsChange(prior?.images, current?.images),
    representation: representationChange(
      prior?.representations,
      current?.representations,
    ),
  };
}

/**
 * Does this diff say anything worth showing? A re-application where nothing
 * moved is itself information, but it should say so rather than render an
 * empty list of changes.
 *
 * @param {object} diff
 */
function hasMovement(diff) {
  return Boolean(
    diff.measurements.length ||
      diff.declared.length ||
      diff.digitals.kind === "reshot" ||
      diff.representation,
  );
}

// ---------------------------------------------------------------------------
// The loader — the only DB-touching code in this file.
//
// Everything above is pure. This section turns "this application, to this
// agency" into the two submissions `diffSubmissions` compares, scoped so a
// season memory can never become a cross-agency view (§ "Scope every query
// to the session agency" — a talent's history with Agency A is never shown
// to Agency B, full stop, regardless of what the talent disclosed elsewhere).
// ---------------------------------------------------------------------------

/** Declared-value columns read straight off `profiles`, in the exact shape
 * `measurementChanges` / `declaredChanges` read (§ TRACKED_MEASUREMENTS /
 * TRACKED_DECLARED above). Not `SNAPSHOT_FIELDS` from submission-profile.js —
 * this file must not take on that module's age/stats/social shaping, it only
 * needs the raw declared columns. */
const DECLARED_PROFILE_COLUMNS = Object.freeze([
  ...TRACKED_MEASUREMENTS.map(({ key }) => key),
  ...TRACKED_DECLARED.map(({ key }) => key),
]);

const APPLICATION_COLUMNS = Object.freeze([
  "id",
  "profile_id",
  "created_at",
]);

/**
 * Merge live `captured_at` back onto frozen-package image rows, which never
 * carry it (`normalizeImage` in application-submission-package.js keeps
 * `id/path/alt/image_type/shot_type/sort/is_primary` only). Same enrichment
 * `buildTalentDossier` already performs for its own frame answerability —
 * frames the talent has since deleted simply keep no capture date, which
 * `digitalsChange` already reads as "not datable" rather than "old".
 */
async function enrichCaptureDates(db, images) {
  const list = Array.isArray(images) ? images : [];
  const ids = list.map((image) => image?.id).filter(Boolean);
  if (ids.length === 0) return list;
  const live = await db("images")
    .whereIn("id", ids)
    .select("id", "captured_at")
    .catch(() => []);
  const byId = new Map(live.map((row) => [row.id, row.captured_at]));
  return list.map((image) => ({
    ...image,
    captured_at: byId.has(image.id) ? byId.get(image.id) : image.captured_at ?? null,
  }));
}

/** Live frames for a profile that never got a frozen package. */
async function loadLiveImages(db, profileId) {
  if (!profileId) return [];
  return db("images")
    .where({ profile_id: profileId })
    .select("id", "captured_at")
    .catch(() => []);
}

/**
 * A profile-backed submission's declared/image facts.
 *
 * The frozen package wins where one exists — `buildSubmissionProfileSnapshot`
 * ran at submit time and its field names are exactly `DECLARED_PROFILE_COLUMNS`
 * (submission-profile.js's `SNAPSHOT_FIELDS`). A revoked/redacted package
 * withheld those values on purpose; the live profile is never substituted for
 * a redaction, or the diff would show a talent's current numbers as if they
 * were what an agency that had its access revoked was told. Only a genuinely
 * missing snapshot (a package written before profile-snapshotting existed, or
 * no package row at all) falls back to the live profile — the same
 * degradation `buildTalentDossier` already accepts for its own display.
 */
async function loadProfileBackedSnapshot(db, application, frozenPackage) {
  const redacted = Boolean(frozenPackage?.revoked || frozenPackage?.redacted);

  let profile = redacted ? null : frozenPackage?.profile || null;
  if (!profile && !redacted) {
    profile =
      (await db("profiles")
        .where({ id: application.profile_id })
        .first(DECLARED_PROFILE_COLUMNS)
        .catch(() => null)) || null;
  }

  const images = redacted
    ? []
    : await enrichCaptureDates(
        db,
        frozenPackage?.images?.length
          ? frozenPackage.images
          : await loadLiveImages(db, application.profile_id),
      );

  const representations = redacted
    ? []
    : (
        await loadTalentRepresentationsForProfiles([application.profile_id], {
          db,
        })
      ).get(application.profile_id) || [];

  return { profile, images, representations };
}

/**
 * An identity-backed submission's declared/image facts — the unclaimed
 * open-call applicant. Reuses `resolveApplicantIdentity` rather than
 * re-deriving the snapshot, so this reads exactly what the dossier's identity
 * branch reads. Open-call intake never collects chest/inseam/hair/eye, so
 * those stay absent rather than guessed (identical to `identityProfileRow` in
 * talent-dossier.js). No live `profiles` row exists, so no representation can
 * exist to read.
 */
async function loadIdentityBackedSnapshot(db, application) {
  const dto = await resolveApplicantIdentity(db, application);
  const profile = {
    height_cm: dto.heightCm ?? null,
    bust_cm: dto.measurements?.bustCm ?? null,
    chest_cm: null,
    waist_cm: dto.measurements?.waistCm ?? null,
    hips_cm: dto.measurements?.hipsCm ?? null,
    inseam_cm: null,
    hair_color: null,
    eye_color: null,
    city: dto.city ?? null,
  };
  // These ids are open-call submission-media ids, not `images` rows — a live
  // lookup would find nothing (talent-dossier.js's identity branch makes the
  // same call), so the images pass straight through undated rather than
  // spending a query that can only come back empty.
  const images = (dto.images || []).map((image) => ({
    ...image,
    captured_at: image?.captured_at ?? null,
  }));
  return { profile, images, representations: [] };
}

/** Dispatch by which pointer the application row carries. */
async function loadSubmissionSnapshot(db, application, frozenPackage) {
  if (!application) return { profile: null, images: [], representations: [] };
  if (application.profile_id) {
    return loadProfileBackedSnapshot(db, application, frozenPackage);
  }
  if (application.applicant_identity_id) {
    return loadIdentityBackedSnapshot(db, application);
  }
  return { profile: null, images: [], representations: [] };
}

/**
 * Every `talent_submission_packages` row tied to one application id, newest
 * first, capped at `limit`.
 *
 * THE SCHEMA FACT THIS EXISTS TO HANDLE. `applications` carries a partial
 * unique index (`20260815091000_applications_event_call_link.js`): exactly
 * one live `representation`-purpose row per (profile, agency), forever. A
 * declined-or-withdrawn representation applicant does not get a new
 * `applications` row when they improve their book and reapply to the SAME
 * agency — `POST /applications` revives the existing row in place. What DOES
 * accumulate is a new `talent_submission_packages` row per submit/resubmit,
 * every one of them kept (never overwritten). So for the single most common
 * reapplication path, "prior submission" is not a different application row
 * at all — it is the package before the latest one, under this same id. A
 * loader that only ever looked for a different `applications.id` (the
 * `findPriorApplication` path below, correct for a repeat *event_casting*
 * edition or an identity claim) would silently see zero history for every
 * representation reapplicant, which is the applicant this feature exists for.
 */
async function loadPackageHistory(db, applicationId, limit = 2) {
  if (!(await db.schema.hasTable("talent_submission_packages").catch(() => false))) {
    return [];
  }
  return db("talent_submission_packages")
    .where({ application_id: applicationId })
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .limit(limit)
    .select("id", "payload", "created_at", "revoked_at", "redacted_at", "profile_id")
    .catch(() => []);
}

/**
 * A package's declared profile facts, whichever shape it was written in.
 *
 * A representation-purpose reapplication writes `payload.profile`
 * (`buildSubmissionProfileSnapshot`'s field names, identical to
 * `DECLARED_PROFILE_COLUMNS`) both times, so the common case is a direct
 * read. But the SAME application row also carries the identity → claim
 * transition (applicant-identity.js: claiming re-points the existing row's
 * `profile_id` rather than creating a new one) — an older package written
 * while the row was still identity-backed has no `payload.profile` at all,
 * only `payload.identity` / `payload.answers` (the open-call intake shape).
 * Reading that older package as "nothing declared" would report every
 * measurement as newly given rather than changed, which is not what the
 * declared record actually says. Open-call intake never collects
 * chest/inseam/hair/eye, so those stay absent rather than guessed — the same
 * rule `loadIdentityBackedSnapshot` follows.
 */
function profileFromPackagePayload(payload) {
  if (payload?.profile && typeof payload.profile === "object") {
    return payload.profile;
  }
  const identity = payload?.identity && typeof payload.identity === "object" ? payload.identity : null;
  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : null;
  if (!identity && !answers) return null;
  return {
    height_cm: numberOrNull(identity?.heightCm ?? answers?.height),
    bust_cm: null,
    chest_cm: null,
    waist_cm: null,
    hips_cm: null,
    inseam_cm: null,
    hair_color: null,
    eye_color: null,
    city: textOrNull(identity?.city),
  };
}

/**
 * Shape one raw `talent_submission_packages` row into the `{profile, images,
 * representations}` triple `diffSubmissions` reads. Unlike
 * `loadProfileBackedSnapshot`, this never falls back to the LIVE profile for
 * a missing `payload.profile` — both rows being compared here can belong to
 * the identical live profile, so a live-profile fallback on one side and not
 * the other would compare "then" against "now" mislabelled as "then".
 *
 * Representations are read by the PACKAGE ROW's OWN `profile_id`, not the
 * application's current one — the two can differ across a claim transition
 * (an older package written while the row was still identity-backed truly
 * has `profile_id: null`, meaning no representation could have existed yet;
 * that is a fact about that point in time, not an approximation). When both
 * packages share one profile_id, both sides query identically and
 * `representationChange` correctly reports nothing — `talent_representations`
 * has no historical table, so "current status, queried at each package's own
 * profile_id" is the most honest answer this schema can give.
 */
async function snapshotFromPackageRow(db, row) {
  const payload = parsePayload(row?.payload);
  const redacted = Boolean(row?.revoked_at || row?.redacted_at || payload.disclosureRedacted);
  const profile = redacted ? null : profileFromPackagePayload(payload);
  const images = redacted
    ? []
    : await enrichCaptureDates(
        db,
        orderedImages(
          Array.isArray(payload.images) ? payload.images : [],
          payload.digitalSlotPicks,
        ),
      );
  const representations =
    !redacted && row?.profile_id
      ? (await loadTalentRepresentationsForProfiles([row.profile_id], { db })).get(row.profile_id) || []
      : [];
  return {
    profile,
    images,
    representations,
    submittedAt: payload.submittedAt || row?.created_at || null,
  };
}

/**
 * The most recent application THIS applicant sent to THIS agency before
 * `current`, matched by whichever pointer `current` carries.
 *
 * `applicant_identity_id` is the identity ladder's own key and persists
 * through a claim (applicant-identity.js: "a claimed applicant's application
 * keeps its `applicant_identity_id` after being re-pointed at the new
 * profile"), so matching on it covers an applicant who applied anonymously
 * once and as a signed-in talent another time. The direct-apply flow never
 * sets `applicant_identity_id` at all, so `profile_id` is matched too — an
 * application can be found by either pointer it happens to carry. Neither
 * clause runs on a schema that lacks the column (`identitySupported` false),
 * matching `applicant-identity.js`'s own defensive posture.
 */
async function findPriorApplication(db, { agencyId, current, identitySupported }) {
  const canMatchProfile = Boolean(current.profile_id);
  const canMatchIdentity = identitySupported && Boolean(current.applicant_identity_id);
  if (!canMatchProfile && !canMatchIdentity) return null;

  const columns = identitySupported
    ? [...APPLICATION_COLUMNS, "applicant_identity_id"]
    : APPLICATION_COLUMNS;

  const row = await db("applications")
    .where({ agency_id: agencyId })
    .whereNot({ id: current.id })
    .andWhere((qb) => {
      if (canMatchProfile) qb.orWhere({ profile_id: current.profile_id });
      if (canMatchIdentity) {
        qb.orWhere({ applicant_identity_id: current.applicant_identity_id });
      }
    })
    .andWhere((qb) => {
      qb.where("created_at", "<", current.created_at).orWhere((qb2) => {
        qb2.where("created_at", current.created_at).andWhere("id", "<", current.id);
      });
    })
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .first(columns)
    .catch(() => null);

  if (!row) return null;
  if (!identitySupported) row.applicant_identity_id = null;
  return row;
}

/**
 * Season memory for one application: this applicant's history with THIS
 * agency, diffed against their most recent prior submission here.
 *
 * Returns `null` when there is nothing to compare — a first-time applicant,
 * or an agency/application pair that does not resolve (the caller's own
 * ownership check already ran; this is a second, self-contained scope guard,
 * not a substitute for it).
 *
 * @param {import('knex').Knex} db
 * @param {{agencyId: string, applicationId: string}} params
 * @returns {Promise<object|null>}
 */
async function loadSeasonMemory(db, { agencyId, applicationId } = {}) {
  if (!db || !agencyId || !applicationId) return null;

  const identitySupported = await hasApplicantIdentitySupport(db);
  const currentColumns = identitySupported
    ? [...APPLICATION_COLUMNS, "applicant_identity_id"]
    : APPLICATION_COLUMNS;

  const current = await db("applications")
    // Scoped to the session agency by contract — a season memory is this
    // agency's own history with this person, never a cross-agency view.
    .where({ id: applicationId, agency_id: agencyId })
    .first(currentColumns)
    .catch(() => null);
  if (!current) return null;
  if (!identitySupported) current.applicant_identity_id = null;

  // Read-side retention sweep, same as both existing package loaders run
  // before trusting a payload — an expired package must read as redacted,
  // not as a plaintext record of stale personal data.
  await redactExpiredSubmissionPackages(db).catch(() => 0);

  // Tier 1: an earlier package under this SAME application id — the
  // withdraw → improve → resubmit cycle a representation applicant actually
  // takes (see `loadPackageHistory`). Checked first because when it applies
  // it is definitionally the most recent prior submission.
  const packageHistory = await loadPackageHistory(db, current.id, 2);
  if (packageHistory.length >= 2) {
    const [currentRow, priorRow] = packageHistory;
    const [currentSnapshot, priorSnapshot] = await Promise.all([
      snapshotFromPackageRow(db, currentRow),
      snapshotFromPackageRow(db, priorRow),
    ]);
    const diff = diffSubmissions({ prior: priorSnapshot, current: currentSnapshot });
    return {
      priorApplicationId: current.id,
      priorSubmittedAt: priorSnapshot.submittedAt,
      currentApplicationId: current.id,
      ...diff,
      hasMovement: hasMovement(diff),
    };
  }

  // Tier 2: a genuinely different application row — a repeat event_casting
  // edition (a new `open_call_link_id`, so its own row) or an applicant who
  // submitted anonymously once and as a claimed profile another time.
  const prior = await findPriorApplication(db, {
    agencyId,
    current,
    identitySupported,
  });
  if (!prior) return null;

  // `slug` is only used by `loadApplicationSubmissionPackages` to build a
  // comp-card view URL this diff never renders, so it is never fetched here.
  const packagesByApplication = await loadApplicationSubmissionPackages(db, [
    { id: current.id, profile_id: current.profile_id, slug: null },
    { id: prior.id, profile_id: prior.profile_id, slug: null },
  ]).catch(() => new Map());

  const [currentSnapshot, priorSnapshot] = await Promise.all([
    loadSubmissionSnapshot(db, current, packagesByApplication.get(current.id)),
    loadSubmissionSnapshot(db, prior, packagesByApplication.get(prior.id)),
  ]);

  const diff = diffSubmissions({ prior: priorSnapshot, current: currentSnapshot });

  return {
    priorApplicationId: prior.id,
    priorSubmittedAt: prior.created_at || null,
    currentApplicationId: current.id,
    ...diff,
    hasMovement: hasMovement(diff),
  };
}

module.exports = {
  MEASUREMENT_NOISE_CM,
  TRACKED_DECLARED,
  TRACKED_MEASUREMENTS,
  declaredChanges,
  diffSubmissions,
  digitalsChange,
  hasMovement,
  loadSeasonMemory,
  measurementChanges,
  representationChange,
};
