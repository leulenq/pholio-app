"use strict";

/**
 * Comparison view — "side-by-side, uniform fields and crops. The digital
 * equivalent of comp cards on a table" (plan A4 #4).
 *
 * That description is a constraint, not a flourish. Comp cards on a table work
 * because every card is the same size, holds the same fields in the same order,
 * and shows the same shots. The eye does the comparing. Nothing on the table
 * ranks anything.
 *
 * So this service does exactly one thing: it makes the records UNIFORM. Every
 * applicant returns the same field keys in the same order, with a value or an
 * explicit null, and the same shot slots in the same sequence. What it must
 * never do:
 *
 *   - score, rank, or order by anything but the agency's own selection order
 *   - fill a gap with an average, an estimate or a placeholder
 *   - compute a "best match", which A1 forbids and which the removed match_score
 *     apparatus already tried once
 *
 * A missing measurement is rendered as missing. That is the honest comparison,
 * and it is also the useful one: a booker needs to see that an applicant did not
 * give a waist, not a dash that reads like a zero.
 *
 * Read from the FROZEN submission snapshot, never the live profile. The
 * comparison is between what these people SENT, at the time they sent it. A
 * profile edited yesterday must not silently change what a submission from March
 * appears to have contained.
 */

const {
  buildAgencyImageDTO,
} = require("../../../shared/lib/audience-dto");
const {
  loadApplicationSubmissionPackages,
} = require("./application-submission-package");
const { isMinorProfile } = require("../../../shared/lib/talent-age");

/** Six is what fits on a screen at a comparable size, and on a table. */
const MAX_COMPARED = 6;

/**
 * The rows of the table, in reading order. Every applicant renders every one of
 * these, in this sequence, so the eye can travel across a row.
 *
 * Track-aware fields (bust/chest, dress/suit) are BOTH declared rather than
 * swapped per applicant: a menswear and a womenswear applicant compared side by
 * side must still line up row for row, and the empty cell is the true answer.
 */
const COMPARISON_FIELDS = Object.freeze([
  { key: "height", label: "Height", unit: "cm" },
  { key: "bust", label: "Bust", unit: "cm" },
  { key: "chest", label: "Chest", unit: "cm" },
  { key: "waist", label: "Waist", unit: "cm" },
  { key: "hips", label: "Hips", unit: "cm" },
  { key: "inseam", label: "Inseam", unit: "cm" },
  { key: "shoe", label: "Shoe", unit: null },
  { key: "dress", label: "Dress", unit: null },
  { key: "suit", label: "Suit", unit: null },
  { key: "hair", label: "Hair", unit: null },
  { key: "eyes", label: "Eyes", unit: null },
  { key: "city", label: "City", unit: null },
]);

/** The shot slots, in the order a comp card lays them out. */
const COMPARISON_SLOTS = Object.freeze([
  { key: "headshot", label: "Headshot" },
  { key: "profile", label: "Profile" },
  { key: "full_length", label: "Full length" },
]);

const SOURCE_KEYS = Object.freeze({
  height: "height_cm",
  bust: "bust_cm",
  chest: "chest_cm",
  waist: "waist_cm",
  hips: "hips_cm",
  inseam: "inseam_cm",
  shoe: "shoe_size",
  dress: "dress_size",
  suit: "suit_size",
  hair: "hair_color",
  eyes: "eye_color",
  city: "city",
});

/**
 * One value, or null. Never a placeholder, never an inferred figure.
 *
 * @param {object} snapshot
 * @param {string} key
 */
function fieldValue(snapshot, key) {
  const raw = snapshot?.[SOURCE_KEYS[key]];
  if (raw === null || raw === undefined || raw === "") return null;
  return typeof raw === "number" ? raw : String(raw);
}

/**
 * Pick the frame for a slot. Uniformity is the whole point, so a slot with no
 * frame stays empty rather than borrowing a different shot type — an applicant
 * who sent no profile shot has not sent one, and the gap is the information.
 *
 * @param {Array<object>} images
 * @param {string} slotKey
 */
function frameForSlot(images, slotKey) {
  const match = (images || []).find(
    (image) => String(image?.shot_type || "").toLowerCase() === slotKey,
  );
  return match ? buildAgencyImageDTO(match) : null;
}

/**
 * Build the uniform record for one application.
 *
 * @param {{application: object, frozen: object|null, minor: boolean}} input
 */
function comparisonRecord({ application, frozen, minor }) {
  const snapshot = frozen?.profile || {};
  const images = frozen?.images || [];

  return {
    applicationId: application.id,
    status: application.status,
    submittedAt: application.created_at || null,
    name:
      [snapshot.first_name, snapshot.last_name].filter(Boolean).join(" ") ||
      "Unknown applicant",
    // Banded, never a date of birth — the same rule every other agency surface
    // follows.
    ageBand: snapshot.age_band || null,
    fields: COMPARISON_FIELDS.map(({ key }) => ({
      key,
      value: fieldValue(snapshot, key),
    })),
    slots: COMPARISON_SLOTS.map(({ key }) => ({
      key,
      // Body frames are withheld for a minor without guardian authorisation,
      // exactly as the dossier withholds them.
      image: minor && key !== "headshot" ? null : frameForSlot(images, key),
    })),
    // Stated so a reviewer knows why a column is sparse, rather than reading it
    // as an applicant who gave nothing.
    withheldForMinor: minor,
    hasSnapshot: Boolean(frozen),
  };
}

/**
 * Uniform comparison records for the given applications, in the order asked for.
 *
 * @param {import('knex')} db
 * @param {{agencyId: string, applicationIds: string[]}} params
 * @returns {Promise<{fields: object[], slots: object[], records: object[]}>}
 */
async function buildComparison(db, { agencyId, applicationIds }) {
  const ids = [...new Set((applicationIds || []).filter(Boolean))].slice(
    0,
    MAX_COMPARED,
  );
  if (ids.length === 0) {
    return { fields: COMPARISON_FIELDS, slots: COMPARISON_SLOTS, records: [] };
  }

  // Scoped to the session agency. A comparison is not a route to a submission
  // addressed to somebody else.
  const applications = await db("applications")
    .whereIn("id", ids)
    .where({ agency_id: agencyId })
    .whereNot({ status: "withdrawn" })
    .select("id", "status", "created_at", "profile_id");

  if (applications.length === 0) {
    return { fields: COMPARISON_FIELDS, slots: COMPARISON_SLOTS, records: [] };
  }

  const profiles = applications.filter((a) => a.profile_id).length
    ? await db("profiles")
        .whereIn(
          "id",
          applications.map((a) => a.profile_id).filter(Boolean),
        )
        .select("id", "slug", "date_of_birth", "guardian_consent_at")
    : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const packages = await loadApplicationSubmissionPackages(
    db,
    applications.map((application) => ({
      id: application.id,
      profile_id: application.profile_id,
      slug: profileById.get(application.profile_id)?.slug || null,
    })),
  );

  const records = applications.map((application) =>
    comparisonRecord({
      application,
      frozen: packages.get(application.id) || null,
      minor: isMinorProfile(profileById.get(application.profile_id) || {}),
    }),
  );

  // The agency's selection order, not ours. Any ordering we chose would be a
  // ranking, and a ranking is what this view exists not to be.
  const byId = new Map(records.map((record) => [record.applicationId, record]));
  return {
    fields: COMPARISON_FIELDS,
    slots: COMPARISON_SLOTS,
    records: ids.map((id) => byId.get(id)).filter(Boolean),
  };
}

module.exports = {
  COMPARISON_FIELDS,
  COMPARISON_SLOTS,
  MAX_COMPARED,
  buildComparison,
  comparisonRecord,
};
