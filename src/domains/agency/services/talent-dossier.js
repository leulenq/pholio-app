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
  digitalsFreshness,
} = require("../../talent/services/digitals-freshness");
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
  boundedString,
  loadApplicationSubmissionPackages,
  normalizeCompCard,
  orderedImages,
  parsePayload,
} = require("./application-submission-package");
const {
  hasApplicantIdentitySupport,
  hasColumnCached,
  IDENTITY_SOURCES,
  resolveApplicantIdentity,
} = require("./applicant-identity");
const {
  redactExpiredSubmissionPackages,
} = require("../../../shared/lib/submission-retention");

/**
 * Digitals freshness for the reviewer, computed here rather than on the client.
 *
 * The client used to work this out itself, and got it wrong twice over: it aged
 * from `captured_at || created_at`, so an undated frame silently reported the
 * date it was uploaded, and it took the *newest* digital, so a part-stale set
 * read as fresh off its most recent frame. A booker judging "are these current?"
 * was being told yes on both counts when the honest answer was "we don't know"
 * or "no". One source of truth, and it is `digitals-freshness.js` — the same
 * engine the talent sees, so neither side is told a different story.
 *
 * Returns null when no frame carries an `image_type`. The engine reads that as
 * "no digitals", which is a claim rather than an absence — and a dossier must
 * not assert a talent has no digitals when what it actually has is no data.
 *
 * @param {Array<object>} rawImages rows carrying image_type / captured_at
 * @returns {object|null}
 */
function buildDigitalsFreshness(rawImages) {
  const images = Array.isArray(rawImages) ? rawImages : [];
  if (!images.some((img) => img && img.image_type)) return null;
  return digitalsFreshness(images);
}

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
 * Two further columns are read in `buildTalentDossier` and are deliberately
 * NOT in this list, because they are not part of the professional record:
 *   - `market` / `availability_status` — coarse operational state (a market
 *     slug derived from the already-exposed `city`, and the talent's own
 *     coarse availability); rendered as the availability read, not as profile
 *     properties,
 *   - `current_agency` — the legacy free-text column, an input to
 *     `deriveRepresentationStatus` only, never emitted.
 *
 * `measured_in_person_at` / `measured_by_agency_id` used to be read here too.
 * The roster endpoint that set them was removed with the roster-as-system-of-
 * record feature, so both columns are now permanently null and the dossier no
 * longer reads them — a "measured in person" line that can never appear is
 * worse than no line at all.
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

// ---------------------------------------------------------------------------
// The identity branch — the unclaimed open-call applicant
// ---------------------------------------------------------------------------
//
// `docs/open-call-applicant-flow-design-2026-08.md` §4 / §6 requirement 1:
// "Every organizer surface must include unclaimed applicants." Since
// `20260819120000` an `applications` row may carry `applicant_identity_id` and
// no `profile_id`, and this builder's `db("profiles").where({ id: null })`
// returned undefined → the route answered 404 for a row the organizer can see
// in their inbox and open in `/details`. The dossier was the last surface still
// dropping them.
//
// The shape is the profile branch's shape. What differs is only what can be
// known: an unclaimed applicant has a frozen submission and nothing else — no
// live profile to carry a bio, a book beyond the snapshot, an availability
// declaration, a market, or a representation record. Those come back as the
// neutral/empty value each consumer already handles (`dossierModel.js` reads
// every one of them through `?.`/`|| []`), never as an invented value.

/**
 * The pseudo-`profiles` row the frozen identity feeds `buildSubmissionProfileSnapshot`.
 * Deliberately identical to `inbox.js`'s local `identityProfileRow` — a route
 * module is the wrong thing for a service to require, and the two copies are
 * held together by the DTO contract they both read, not by an import.
 *
 * `date_of_birth` is null and STAYS null: an anonymous applicant asserts the
 * 18+ attestation the event spec asks for, not a date (design §3.1, ruling Q1).
 * `isMinorProfile` is therefore never run against this object — a fabricated
 * DOB is the only way it could misclassify, and there is none to fabricate.
 * A null DOB means the snapshot's `age` is null and `is_minor` is false, which
 * is the honest reading of "attested adult, date not collected", and the minor
 * redaction path is deliberately not entered for this branch.
 */
function identityProfileRow(dto) {
  return {
    id: null,
    slug: null,
    first_name: dto?.firstName || null,
    last_name: dto?.lastName || null,
    city: dto?.city || null,
    gender: dto?.gender || null,
    height_cm: dto?.heightCm ?? null,
    bust_cm: dto?.measurements?.bustCm ?? null,
    waist_cm: dto?.measurements?.waistCm ?? null,
    hips_cm: dto?.measurements?.hipsCm ?? null,
    date_of_birth: null,
  };
}

/**
 * The applicant's Instagram, in the `social_accounts` shape the snapshot and
 * `shapeSocialAccounts` speak. Not invention: the handle is a value the
 * applicant typed into the intake form; this only carries it in the shape the
 * consumer reads. No handle → no row.
 */
function identitySocialRows(dto) {
  const handle = dto?.instagram || null;
  if (!handle) return [];
  return [{ platform: "instagram", handle, url: null, verified: false }];
}

/**
 * The frozen package for an identity-backed application.
 *
 * `loadApplicationSubmissionPackages` cannot answer this one. It is safe to
 * call with `{ id, profile_id: null, slug: null }` — it filters on
 * `application?.profile_id` and returns an empty Map rather than throwing —
 * but that is exactly why it is useless here: an identity package row is keyed
 * by `application_id` with `profile_id` NULL (`20260819130000`), and that
 * loader's query is `whereIn("profile_id", …)`. So the row is read by
 * application id here and shaped with that module's own exported normalizers,
 * so both branches hand the client the same package object.
 */
async function loadIdentitySubmissionPackage(db, application) {
  if (!(await tableExists(db, "talent_submission_packages"))) return null;
  // Same read-side retention sweep the profile branch gets for free inside
  // `loadApplicationSubmissionPackages`.
  await redactExpiredSubmissionPackages(db).catch(() => 0);

  const row = await db("talent_submission_packages")
    .where({ application_id: application.id })
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .first();
  if (!row) return null;

  const payload = parsePayload(row.payload);

  if (row.revoked_at || row.redacted_at || payload.disclosureRedacted) {
    return {
      id: row.id,
      submittedAt: payload.submittedAt || row.created_at || null,
      revoked: true,
      redacted: true,
      redactionReason: row.redaction_reason || payload.redactionReason || "revoked",
      mediaSet: null,
      boards: [],
      digitalSlotPicks: {},
      images: [],
      compCard: null,
      contact: null,
      profile: null,
    };
  }

  const compCard = normalizeCompCard(
    payload.compCard && typeof payload.compCard === "object"
      ? payload.compCard
      : null,
  );

  return {
    id: row.id,
    submittedAt: payload.submittedAt || row.created_at || null,
    mediaSet: {
      id: boundedString(payload.mediaSetId, 80),
      name: boundedString(payload.mediaSetName, 120),
    },
    boards: Array.isArray(payload.boards)
      ? payload.boards
          .slice(0, 20)
          .map((board) => boundedString(board, 120))
          .filter(Boolean)
      : [],
    digitalSlotPicks:
      payload.digitalSlotPicks && typeof payload.digitalSlotPicks === "object"
        ? payload.digitalSlotPicks
        : {},
    images: orderedImages(
      Array.isArray(payload.images) ? payload.images : [],
      payload.digitalSlotPicks,
    ),
    // An unclaimed applicant has no `/pdf/view/:slug` to link — no profile, no
    // slug. A comp card in the payload keeps its metadata, never a dead URL.
    compCard: compCard ? { ...compCard, viewUrl: compCard.externalUrl || null } : null,
    contact:
      payload.contact && typeof payload.contact === "object"
        ? {
            email: boundedString(payload.contact.email, 254),
            phone: boundedString(payload.contact.phone, 40),
          }
        : null,
    profile: null,
    minorDataMinimized: payload.minorDataMinimized === true,
  };
}

/**
 * The dossier for an application whose applicant has no Pholio account yet.
 *
 * Same keys as the profile branch. The frozen package is the primary content
 * here — for an unclaimed applicant it is the ONLY content — so it is attached
 * exactly as it is for a profile-backed row.
 */
async function buildIdentityDossier(db, { application, agencyId }) {
  const dto = await resolveApplicantIdentity(db, application);
  const frozen = await loadIdentitySubmissionPackage(db, application);

  /* Attested adult, date of birth not collected: no minor gating, no minor
     redaction. See `identityProfileRow` — there is no DOB to feed
     `isMinorProfile`, and fabricating one is the only way this could
     misclassify. */
  const minor = false;
  const social = identitySocialRows(dto);
  const snapshot = buildSubmissionProfileSnapshot(identityProfileRow(dto), {
    social,
    minor,
  });

  /* Frozen frames only. Unlike the profile branch there is no live-`images`
     enrichment pass: these ids are `open_call_submission_media` ids (design
     §3.3) and would match nothing in `images`. The snapshot carries its own
     `image_type` / `shot_type` / `sort`; `captured_at` is simply not a fact the
     open-call intake collects, so it stays absent rather than guessed. */
  const rawImages = frozen?.images?.length ? frozen.images : dto.images || [];
  const images = rawImages.map(buildAgencyImageDTO).filter(Boolean);

  const standing = await buildStanding(db, { agencyId, application });

  const contact = { email: dto.email || null, phone: dto.phone || null };

  return {
    application: {
      id: application.id,
      status: application.status,
      board_id: application.board_id || null,
      created_at: application.created_at || null,
      viewed_at: application.viewed_at || null,
      accepted_at: application.accepted_at || null,
      declined_at: application.declined_at || null,
      invited_by_agency_id: application.invited_by_agency_id || null,
    },
    talent: {
      ...snapshot,
      // Only a live profile answers these. `market` is derived from a profile
      // column, and availability is a declaration the applicant has never been
      // asked to make.
      market: null,
      availability_status: null,
      // The professional record is a `profiles` read; every field is null and
      // every list empty rather than absent, so the client's `professional.x`
      // reads keep working.
      professional: buildProfessionalRecord({}, minor),
      social: shapeSocialAccounts(snapshot.social || social),
    },
    images,
    digitalsFreshness: buildDigitalsFreshness(rawImages),
    submissionPackage: frozen || {
      /* No package row (or one written before the submit lane snapshotted
         identities): the applicant still owes the organizer their contact and
         whatever frames the resolver could find. Same fallback `/details`
         builds for this branch. */
      id: null,
      submittedAt: application.created_at || null,
      mediaSet: null,
      boards: [],
      digitalSlotPicks: {},
      images: dto.images || [],
      compCard: null,
      contact,
      profile: null,
    },
    representation: {
      /* Not "unrepresented" — Pholio has no representation record for someone
         with no profile, and asserting one from an empty object would be an
         invented fact. `status: null` is the unknown, and the client's
         `representationRead` already reads it as "No representation on
         record." */
      status: null,
      represented_by: null,
      lines: [],
    },
    availability: {
      status: null,
      window_days: CALENDAR_WINDOW_DAYS,
      // No profile id, so no bookouts and no commitments can exist to read.
      bookouts: [],
      commitments: [],
    },
    standing,
    compliance: {
      is_minor: false,
      age_band: snapshot.age_band || null,
      guardian_consent_at: null,
    },
    contact,
    // Plain data — booleans and one lowercase word, never a badge (design §6
    // requirement 2, CLAUDE.md banned pattern #4).
    identityClaimed: Boolean(dto.isClaimed),
    emailVerified: Boolean(dto.isEmailVerified),
    identityDisputed: Boolean(dto.isDisowned),
    identitySource: IDENTITY_SOURCES.SUBMISSION,
  };
}

/**
 * The profile branch's answer to the same four truth fields, computed without
 * re-running the resolver (this builder has already read the profile, and the
 * resolver would read it a second time). Both branches carry the keys so a
 * client never has to read an absent `identityClaimed` as `false` on an
 * account-backed applicant.
 *
 * Both reads are column/table-probed: several agency suites hand-build a
 * partial schema with no `email_verified` column and no `applicant_identities`
 * table, and a dossier that used to work must not start 500ing on them.
 */
async function buildProfileTruthFields(db, application, profile) {
  let emailVerified = false;
  if (profile?.user_id && (await hasColumnCached(db, "users", "email_verified"))) {
    const account = await db("users")
      .where({ id: profile.user_id })
      .first("email_verified");
    emailVerified = Boolean(account?.email_verified);
  }

  let identityDisputed = false;
  if (
    application.applicant_identity_id &&
    (await hasApplicantIdentitySupport(db))
  ) {
    const identity = await db("applicant_identities")
      .where({ id: application.applicant_identity_id })
      .first("disowned_at")
      .catch(() => null);
    identityDisputed = Boolean(identity?.disowned_at);
  }

  return {
    identityClaimed: true,
    emailVerified,
    identityDisputed,
    identitySource: IDENTITY_SOURCES.PROFILE,
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
  /* Identity-backed (design §4): no `profiles` row exists and none should be
     invented, so the frozen submission answers instead. Only this exact shape
     takes the branch — a profile-backed application whose profile has genuinely
     gone still falls through to the null return the route 404s on. */
  if (!application.profile_id && application.applicant_identity_id) {
    return buildIdentityDossier(db, { application, agencyId });
  }

  const columns = [
    ...new Set([
      ...selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
        table: "profiles",
      }),
      ...DOSSIER_PROFESSIONAL_FIELDS.map((c) => `profiles.${c}`),
      "profiles.market",
      "profiles.availability_status",
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

  const [standing, availability, truth] = await Promise.all([
    buildStanding(db, { agencyId, application }),
    buildAvailability(db, { agencyId, profile }),
    buildProfileTruthFields(db, application, profile),
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
      professional: buildProfessionalRecord(profile, minor),
      social: minor ? [] : shapeSocialAccounts(snapshot.social || social),
    },
    images,
    digitalsFreshness: buildDigitalsFreshness(rawImages),
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
    compliance: {
      is_minor: minor,
      age_band: snapshot.age_band || null,
      guardian_consent_at: minor ? profile.guardian_consent_at || null : null,
    },
    contact,
    // Same four plain-data fields the identity branch carries, so the client
    // reads one contract instead of two.
    ...truth,
  };
}

module.exports = {
  buildTalentDossier,
  loadRepresentationRecord,
  buildRepresentationLines,
  buildProfessionalRecord,
  CALENDAR_WINDOW_DAYS,
  DOSSIER_PROFESSIONAL_FIELDS,
};
