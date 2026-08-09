"use strict";

/**
 * The Talent Dossier — the single aggregate read behind the expanded talent
 * view (`/dashboard/agency/talent/:applicationId`).
 *
 * The expanded view is a booker's command surface, not a profile page, so this
 * service answers the questions a booker actually asks, in order:
 *
 *   1. Who is this right now?        → identity + representation standing
 *   2. Can I use them?               → canonical stats, availability, bookouts,
 *                                      and this agency's own options/holds
 *   3. Where do they sit with US?    → the submission ladder, dated, with a day
 *                                      count, board, tags, and who acted last
 *   4. Did they send a real package? → the frozen submission package, the book,
 *                                      and digitals-set coverage
 *   5. What else do we know?         → professional record + market position
 *   6. What do I do next?            → conversation
 *
 * Privacy posture — this module composes existing audience DTOs, it does not
 * invent a wider one:
 *   - identity/stats come from `buildSubmissionProfileSnapshot` (minor-safe,
 *     the canonical named-submission snapshot),
 *   - professional metadata is picked from `DOSSIER_PROFESSIONAL_FIELDS`, every
 *     entry of which is drawn from `AGENCY_DISCOVERY_FIELDS` — the allowlist
 *     already sanctioned for a *less* entitled agency audience (generic
 *     Discover) than an agency reading a submission addressed to it,
 *   - images go through `buildAgencyImageDTO`,
 *   - representation names are only disclosed per-row via the talent's
 *     `disclose_agency_name` opt-in.
 * A minor's adult-only fields (social, tattoos/piercings) are nulled the same
 * way `buildAgencyDiscoveryDTO` nulls them.
 *
 * Caller responsibilities (the route, mirroring `/details`): verify the
 * application belongs to the agency, reject a withdrawn submission, and run the
 * minor-access decision BEFORE calling this builder.
 */

const {
  AUDIENCE,
  buildAgencyImageDTO,
  deriveRepresentationStatus,
  ensureRepresentationDiscloseColumnChecked,
  pickAllowed,
  shapeSocialAccounts,
} = require("../../../shared/lib/audience-dto");
const {
  applyImageVisibility,
  selectColumnsForAudience,
} = require("../../../shared/lib/profile-visibility");
const {
  buildSubmissionProfileSnapshot,
  normalizeStringList,
} = require("../../../shared/lib/submission-profile");
const {
  loadSocialAccountsForProfile,
} = require("../../../shared/lib/social-accounts");
const { isMinorProfile } = require("../../../shared/lib/talent-age");
const {
  ensureModerationColumnChecked,
} = require("../../../shared/lib/content-moderation");
const {
  loadApplicationSubmissionPackages,
} = require("./application-submission-package");

/** Activity rows carried into the record ledger. */
const TIMELINE_LIMIT = 40;

/** Forward window, in days, drawn by the calendar line on the client. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * The professional record: extra `profiles` columns the dossier renders beyond
 * the submission snapshot. EVERY entry here must also appear in
 * `AGENCY_DISCOVERY_FIELDS` — a submission audience may never see a property
 * that generic Discover would withhold. The contract test in
 * tests/integration/agency-talent-dossier.test.js asserts that containment, so
 * adding a field here without adding it to the Discover allowlist fails CI.
 *
 * Three further columns are read in `buildTalentDossier` and are deliberately
 * NOT in this list, because they are not part of the professional record:
 *   - `market` / `availability_status` — coarse operational state (a market
 *     slug derived from the already-exposed `city`, and the talent's own
 *     coarse availability); rendered as the availability read, not as profile
 *     properties,
 *   - `measured_in_person_at` / `measured_by_agency_id` — agency-set
 *     provenance, surfaced only as "measured by us" / "measured by another
 *     agency", never as a foreign agency id,
 *   - `current_agency` — the legacy free-text column, an input to
 *     `deriveRepresentationStatus` only, never emitted.
 */
const DOSSIER_PROFESSIONAL_FIELDS = Object.freeze([
  "discipline",
  "experience_level",
  "specialties",
  "specializations",
  "training",
  "languages",
  "union_membership",
  "playing_age_min",
  "playing_age_max",
  "availability_travel",
  "city_secondary",
  "hair_length",
  "hair_type",
  "tattoos",
  "piercings",
  "seeking_representation",
]);

const DAY_MS = 86400000;

function daysBetween(from, to = Date.now()) {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((to - t) / DAY_MS));
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function tableExists(db, name) {
  try {
    return await db.schema.hasTable(name);
  } catch {
    return false;
  }
}

/**
 * The professional record. Picked from the Discover allowlist, list-normalized,
 * and minor-gated exactly as `buildAgencyDiscoveryDTO` gates it.
 *
 * @param {object} profile raw `profiles` row
 * @param {boolean} minor
 */
function buildProfessionalRecord(profile, minor) {
  const record = pickAllowed(profile, DOSSIER_PROFESSIONAL_FIELDS);
  record.specialties = normalizeStringList(record.specialties);
  record.specializations = normalizeStringList(record.specializations);
  record.languages = normalizeStringList(record.languages);
  record.training = normalizeStringList(record.training);
  if (minor) {
    // Visible-when-dressed data is adult-only, mirroring the Discover DTO.
    record.tattoos = null;
    record.piercings = null;
  }
  return record;
}

/**
 * Load `talent_representations` for one profile with the scope columns the
 * dossier draws — market, territory, division, and the start/end dates.
 *
 * The shared `loadTalentRepresentationsForProfiles` batch loader deliberately
 * selects only what a Discover *list* needs (names, exclusivity, status), so it
 * cannot back this record; the dossier reads one profile and needs the shape of
 * each relationship. `disclose_agency_name` is still column-checked the same
 * way, so a deploy-before-migrate window degrades to "undisclosed" rather than
 * throwing.
 *
 * @param {import('knex').Knex} db
 * @param {string} profileId
 */
async function loadRepresentationRecord(db, profileId) {
  if (!(await tableExists(db, "talent_representations"))) return [];
  const hasDisclose = await ensureRepresentationDiscloseColumnChecked(db);

  const columns = [
    "tr.profile_id",
    "tr.agency_id",
    "tr.external_agency_name",
    "tr.relationship_type",
    "tr.market",
    "tr.territory",
    "tr.division",
    "tr.is_exclusive",
    "tr.status",
    "tr.started_on",
    "tr.ended_on",
    "a.name as agency_name",
  ];
  if (hasDisclose) columns.push("tr.disclose_agency_name");

  const rows = await db("talent_representations as tr")
    .leftJoin("agencies as a", "a.id", "tr.agency_id")
    .where("tr.profile_id", profileId)
    .select(columns);

  return hasDisclose
    ? rows
    : rows.map((row) => ({ ...row, disclose_agency_name: false }));
}

/**
 * The representation record: not a status word but the actual relationship map
 * a booker needs — mother agency vs. placements, which market, whether it is
 * exclusive, and since when.
 *
 * Naming a counterparty still requires the talent's per-row
 * `disclose_agency_name` opt-in; an undisclosed row is carried as a shaped
 * "undisclosed" line so the *shape* of the representation stays legible
 * without leaking the name.
 *
 * @param {Array<object>} rows `talent_representations` rows (+ agency_name)
 * @param {string|null} viewingAgencyId
 */
function buildRepresentationLines(rows, viewingAgencyId) {
  return (rows || [])
    .map((row) => {
      const disclosed =
        row.disclose_agency_name === true || row.disclose_agency_name === 1;
      const isThisAgency =
        Boolean(viewingAgencyId) && row.agency_id === viewingAgencyId;
      return {
        relationship_type: row.relationship_type || null,
        // An agency may always see its own name on its own row.
        agency_name:
          isThisAgency || disclosed
            ? row.external_agency_name || row.agency_name || null
            : null,
        is_this_agency: isThisAgency,
        is_external: !row.agency_id,
        market: row.market || null,
        territory: row.territory || null,
        division: row.division || null,
        is_exclusive: row.is_exclusive === true || row.is_exclusive === 1,
        status: row.status || null,
        started_on: row.started_on || null,
        ended_on: row.ended_on || null,
      };
    })
    .sort((a, b) => {
      // Active first, then mother agency before placements, then most recent.
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.relationship_type !== b.relationship_type) {
        return a.relationship_type === "mother" ? -1 : 1;
      }
      return String(b.started_on || "").localeCompare(String(a.started_on || ""));
    });
}

/**
 * Market position — where this talent sits inside THIS agency's own book.
 * Deliberately relative to the agency, not to some invented global index: a
 * booker's real question is "how does this compare to what we already carry?"
 *
 * Returns null-ish fields rather than throwing when the roster tables are
 * absent or the agency has no roster yet.
 */
async function buildRosterPosition(db, { agencyId, profile, boardId }) {
  const empty = {
    roster_size: 0,
    track_peers: 0,
    market_peers: 0,
    height_rank: null,
    height_percentile: null,
    board_size: null,
  };
  if (!(await tableExists(db, "roster_memberships"))) return empty;

  const rows = await db("roster_memberships as rm")
    .join("profiles as p", "p.id", "rm.profile_id")
    .where({ "rm.agency_id": agencyId, "rm.status": "active" })
    .select("p.id", "p.height_cm", "p.stats_track", "p.market", "rm.board_id");

  const rosterSize = rows.length;
  if (rosterSize === 0) return empty;

  const track = profile.stats_track || null;
  const trackRows = track
    ? rows.filter((row) => row.stats_track === track)
    : rows;
  const heights = trackRows
    .map((row) => Number(row.height_cm))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  const height = Number(profile.height_cm);
  let heightRank = null;
  let heightPercentile = null;
  if (Number.isFinite(height) && height > 0 && heights.length > 0) {
    heightRank = heights.filter((h) => h > height).length + 1;
    const atOrBelow = heights.filter((h) => h <= height).length;
    heightPercentile = Math.round((atOrBelow / heights.length) * 100);
  }

  return {
    roster_size: rosterSize,
    track_peers: trackRows.length,
    market_peers: profile.market
      ? rows.filter((row) => row.market === profile.market).length
      : 0,
    height_rank: heightRank,
    height_percentile: heightPercentile,
    board_size: boardId
      ? rows.filter((row) => row.board_id === boardId).length
      : null,
  };
}

/**
 * Availability: what the talent declared, the dates they blocked, and the
 * options/holds/bookings THIS agency is carrying on them. Together these are
 * what an agency needs before it promises a client anything.
 */
async function buildAvailability(db, { agencyId, profile }) {
  const now = new Date();
  const horizon = new Date(now.getTime() + CALENDAR_WINDOW_DAYS * DAY_MS);
  const iso = (d) => d.toISOString().slice(0, 10);

  const bookouts = (await tableExists(db, "bookouts"))
    ? await db("bookouts")
        .where({ profile_id: profile.id })
        .andWhere("ends_on", ">=", iso(now))
        .andWhere("starts_on", "<=", iso(horizon))
        .orderBy("starts_on", "asc")
        .select("id", "starts_on", "ends_on", "note")
    : [];

  let commitments = [];
  if (await tableExists(db, "talent_commitments")) {
    commitments = await db("talent_commitments")
      .where({ profile_id: profile.id, agency_id: agencyId })
      .andWhere((qb) => {
        qb.whereNull("end_date").orWhere("end_date", ">=", iso(now));
      })
      .orderBy("start_date", "asc")
      .select(
        "id",
        "kind",
        "option_tier",
        "status",
        "start_date",
        "end_date",
        "market",
        "client_ref",
        "exclusivity",
        "exclusivity_until",
      );
    commitments = commitments.filter(
      (row) => !row.status || row.status === "active",
    );
  }

  return {
    status: profile.availability_status || null,
    window_days: CALENDAR_WINDOW_DAYS,
    bookouts,
    commitments,
  };
}

/**
 * Where this submission stands with this agency: the dated ladder, the board it
 * was filed against, the tags on it, and the follow-up work attached to it.
 */
async function buildStanding(db, { agencyId, application }) {
  const applicationId = application.id;

  const [board, tags, notes, activities, messageStats] =
    await Promise.all([
      application.board_id
        ? db("boards")
            .where({ id: application.board_id })
            .first("id", "name", "kind")
        : Promise.resolve(null),
      db("application_tags")
        .where({ application_id: applicationId, agency_id: agencyId })
        .orderBy("created_at", "desc"),
      db("application_notes")
        .where({ application_id: applicationId })
        .orderBy("created_at", "desc"),
      db("application_activities")
        .where({ application_id: applicationId })
        .orderBy("created_at", "desc")
        .limit(TIMELINE_LIMIT),
      (await tableExists(db, "messages"))
        ? db("messages")
            .where({ application_id: applicationId })
            .orderBy("created_at", "desc")
            .select("sender_type", "is_read", "created_at")
        : Promise.resolve([]),
    ]);

  const timeline = activities.map((row) => ({
    ...row,
    metadata: parseJson(row.metadata, {}),
  }));

  const lastAction = timeline[0] || null;
  const inboundUnread = messageStats.filter(
    (m) => m.sender_type === "TALENT" && !m.is_read,
  ).length;

  return {
    board: board || null,
    tags,
    notes,
    timeline,
    messages: {
      total: messageStats.length,
      unread_from_talent: inboundUnread,
      last_at: messageStats[0]?.created_at || null,
    },
    submitted_at: application.created_at || null,
    viewed_at: application.viewed_at || null,
    decided_at: application.accepted_at || application.declined_at || null,
    last_action_at: lastAction?.created_at || null,
    last_action_type: lastAction?.activity_type || null,
    days_since_submitted: daysBetween(application.created_at),
    days_since_last_action: daysBetween(
      lastAction?.created_at || application.created_at,
    ),
    invited: Boolean(application.invited_by_agency_id),
  };
}

/**
 * Build the full dossier payload.
 *
 * @param {import('knex').Knex} db
 * @param {{ application: object, agencyId: string }} ctx the application row the
 *   route already loaded and authorized, plus the viewing agency.
 * @returns {Promise<object|null>} null when the profile no longer exists.
 */
async function buildTalentDossier(db, { application, agencyId }) {
  const columns = [
    ...new Set([
      ...selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
        table: "profiles",
      }),
      ...DOSSIER_PROFESSIONAL_FIELDS.map((c) => `profiles.${c}`),
      "profiles.market",
      "profiles.availability_status",
      "profiles.measured_in_person_at",
      "profiles.measured_by_agency_id",
      // Legacy free-text representation column — an input to
      // `deriveRepresentationStatus`, never rendered directly.
      "profiles.current_agency",
    ]),
  ];

  const profile = await db("profiles")
    .where({ id: application.profile_id })
    .select(columns)
    .first();

  if (!profile) return null;

  const minor = isMinorProfile(profile);
  const owner = await db("users")
    .where({ id: profile.user_id })
    .first("email");

  const packages = await loadApplicationSubmissionPackages(db, [
    {
      id: application.id,
      profile_id: application.profile_id,
      slug: profile.slug,
    },
  ]);
  const frozen = packages.get(application.id) || null;

  // A frozen package already carries its own social snapshot; only the
  // live-profile fallback needs the joined rows.
  const social = frozen?.profile ? [] : await loadSocialAccountsForProfile(profile.id);
  const snapshot =
    frozen?.profile || buildSubmissionProfileSnapshot(profile, { social, minor });

  let rawImages;
  if (frozen) {
    rawImages = frozen.images || [];
    // Enrich frozen frames with capture/register data from the live rows they
    // still point at, so "are these digitals current?" stays answerable after
    // the package is snapshotted. Frames the talent has since deleted simply
    // keep their snapshot values.
    const ids = rawImages.map((img) => img.id).filter(Boolean);
    if (ids.length > 0) {
      const live = await db("images")
        .whereIn("id", ids)
        .select("id", "style_type", "captured_at", "created_at");
      const byId = new Map(live.map((row) => [row.id, row]));
      rawImages = rawImages.map((img) => ({ ...img, ...(byId.get(img.id) || {}) }));
    }
  } else {
    await ensureModerationColumnChecked(db);
    const query = db("images").where({ profile_id: profile.id });
    applyImageVisibility(query, AUDIENCE.AGENCY_DISCOVERY, { table: "images" });
    rawImages = await query.orderBy(["sort", "created_at"]);
  }
  const images = rawImages.map(buildAgencyImageDTO).filter(Boolean);

  const representationRows = await loadRepresentationRecord(db, profile.id);
  const { representation_status, represented_by } = deriveRepresentationStatus(
    profile,
    representationRows,
  );

  const [standing, availability, position] = await Promise.all([
    buildStanding(db, { agencyId, application }),
    buildAvailability(db, { agencyId, profile }),
    buildRosterPosition(db, {
      agencyId,
      profile,
      boardId: application.board_id || null,
    }),
  ]);

  const contact = minor
    ? null
    : frozen?.contact || {
        email: owner?.email || profile.email || null,
        phone: profile.phone || null,
      };

  return {
    application: {
      id: application.id,
      status: application.status,
      match_score: application.match_score ?? null,
      match_calculated_at: application.match_calculated_at || null,
      board_id: application.board_id || null,
      created_at: application.created_at || null,
      viewed_at: application.viewed_at || null,
      accepted_at: application.accepted_at || null,
      declined_at: application.declined_at || null,
      invited_by_agency_id: application.invited_by_agency_id || null,
    },
    talent: {
      ...snapshot,
      market: profile.market || null,
      availability_status: profile.availability_status || null,
      measured_in_person_at: profile.measured_in_person_at || null,
      measured_by_us:
        Boolean(profile.measured_in_person_at) &&
        profile.measured_by_agency_id === agencyId,
      professional: buildProfessionalRecord(profile, minor),
      social: minor ? [] : shapeSocialAccounts(snapshot.social || social),
    },
    images,
    submissionPackage: frozen
      ? { ...frozen, contact: minor ? null : frozen.contact || contact }
      : null,
    representation: {
      status: representation_status,
      represented_by,
      lines: buildRepresentationLines(representationRows, agencyId),
    },
    availability,
    standing,
    position,
    compliance: {
      is_minor: minor,
      age_band: snapshot.age_band || null,
      guardian_consent_at: minor ? profile.guardian_consent_at || null : null,
    },
    contact,
  };
}

module.exports = {
  buildTalentDossier,
  loadRepresentationRecord,
  buildRepresentationLines,
  buildProfessionalRecord,
  buildRosterPosition,
  CALENDAR_WINDOW_DAYS,
  DOSSIER_PROFESSIONAL_FIELDS,
};
