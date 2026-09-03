"use strict";

/**
 * Designer pick lists — the organizer's side of an event cast.
 *
 * An organizer runs one event call, triages the applications it brought in,
 * and hands slices of that pool to individual designers over read-only links.
 * This module owns everything the organizer does with those lists: reading the
 * pool, creating and amending lists, reading back what designers marked, and
 * turning one of those marks into an actual slot offer.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 * 1. Tokens. Minting, hashing, TTL policy and validation all live in
 *    `src/domains/events/services/pick-list-tokens.js` (design §h). We ask it
 *    for token material and store the hash it hands back; the raw token is
 *    returned to the caller once, at creation, and never persisted here.
 *
 * 2. Turn a designer's mark into a status. A `pick` is one buyer's private
 *    opinion. Several designers hold conflicting opinions about the same
 *    applicant and none of them is the organizer's decision, so marks live
 *    only on `event_pick_selections.mark` and are read by JOIN. The single
 *    place an application's status moves is `recordOffers`, which an organizer
 *    triggers explicitly and which writes the ordinary `accepted` status
 *    through the same vocabulary the inbox uses.
 */

const { v4: uuidv4 } = require("uuid");
const defaultKnex = require("../../../shared/db/knex");
const {
  CALL_KINDS,
  PICK_LIST_STATUSES,
  PICK_MARKS,
} = require("../../../shared/constants/event-casting");
const {
  CONFIRMED_APPLICATION_STATUS,
  OFFERED_APPLICATION_STATUSES,
  TALENT_DECLINED_APPLICATION_STATUS,
  WRITABLE_APPLICATION_STATUSES,
} = require("../../../shared/constants/application-status");
const {
  buildPickListTokenMaterial,
  mintPickListToken,
} = require("../../events/services/pick-list-tokens");
const {
  hasApplicantIdentitySupport,
  resolveApplicantIdentities,
} = require("./applicant-identity");
const { computeAge } = require("../../../shared/lib/talent-age");

/**
 * INCLUDES UNCLAIMED APPLICANTS (design §4, §6 requirement 1).
 *
 * Every organizer read in this module used to INNER JOIN `profiles`, which for
 * an event call under `identity_policy: account_optional` would drop most of
 * the pool: the FWBK applicant of identity-ladder state 2 has an `applications`
 * row and no profile. The pool, the per-designer read-back and the lineup are
 * the three surfaces the whole event product is, so all three LEFT JOIN and
 * source names/city/height through the resolver.
 *
 * Only the identity-backed rows go through the resolver — a profile-backed name
 * already arrived on the JOIN and re-resolving it would add queries for a value
 * the row already holds.
 */
async function resolveIdentityRows(db, rows) {
  if (!(await hasApplicantIdentitySupport(db))) return new Map();
  const identityRows = rows.filter(
    (row) => !row.profile_id && row.applicant_identity_id,
  );
  if (identityRows.length === 0) return new Map();
  return resolveApplicantIdentities(
    db,
    identityRows.map((row) => ({
      id: row.application_id,
      profile_id: null,
      applicant_identity_id: row.applicant_identity_id,
    })),
  );
}

/** `p.first_name || ' ' || p.last_name`, then the snapshot, then "Unknown". */
function applicantName(row, resolved) {
  return (
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    resolved.get(row.application_id)?.displayName ||
    "Unknown"
  );
}

/**
 * The status an offer writes. Sourced from the shared vocabulary rather than
 * spelled here so that "the organizer offered a slot" and "the agency offered
 * representation" can never drift into two different rows.
 */
const OFFERED_STATUS = OFFERED_APPLICATION_STATUSES[0];

/* An offer must go through machinery the rest of the product already trusts. */
if (!WRITABLE_APPLICATION_STATUSES.includes(OFFERED_STATUS)) {
  throw new Error(
    "event-pick-lists: offer status is not agency-writable — refusing to load",
  );
}

/**
 * Event lifecycle stages (design §e O3), expressed as the application statuses
 * behind each. The organizer's ladder is the ordinary one relabelled: nothing
 * here is an event-only status except the applicant's own answer.
 */
const EVENT_POOL_STAGES = Object.freeze({
  to_review: Object.freeze(["pending", "submitted"]),
  pool: Object.freeze(["shortlisted"]),
  offered: Object.freeze([OFFERED_STATUS]),
  confirmed: Object.freeze([CONFIRMED_APPLICATION_STATUS]),
  passed: Object.freeze([
    "passed",
    "declined",
    TALENT_DECLINED_APPLICATION_STATUS,
  ]),
});
const EVENT_POOL_STAGE_KEYS = Object.freeze(Object.keys(EVENT_POOL_STAGES));

const POOL_PAGE_SIZE = 60;
/**
 * Ruling R7 sizes a call at 2,000 applications. The pool is therefore read a
 * page at a time — every row costs a submission-package resolve, and a route
 * that answers 2,000 of those in one response is the thing R7 asks us not to
 * build. See `SUBMISSIONS_HARD_CAP` in `routes/inbox.js` for the other half.
 */
const POOL_MAX_PAGE_SIZE = 200;

const MAX_ITEMS_PER_REQUEST = 200;
/** Ruling R7: a designer slice stays browsable — ~120 cards is the ceiling. */
const MAX_ITEMS_PER_LIST = 120;

class EventPickListError extends Error {
  constructor(code, message, status = 400, field = null) {
    super(message);
    this.name = "EventPickListError";
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

/**
 * Deploy-before-migrate guard, mirroring `hasBriefSchema` in
 * `routes/open-call.js`: the events surface reports itself unavailable rather
 * than throwing "no such table" at an organizer.
 */
let schemaPromise = null;
function hasEventCastingSchema(db = defaultKnex) {
  if (!schemaPromise) {
    schemaPromise = Promise.all([
      db.schema.hasTable("event_pick_lists"),
      db.schema.hasColumn("agency_open_call_links", "call_kind"),
      db.schema.hasColumn("applications", "open_call_link_id"),
    ])
      .then((checks) => checks.every(Boolean))
      .catch(() => {
        schemaPromise = null;
        return false;
      });
  }
  return schemaPromise;
}

/** Test-only: the guard memoizes per process and suites rebuild schemas. */
function resetEventCastingSchemaCache() {
  schemaPromise = null;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function trimmedString(value, { field, max, required = false }) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) {
      throw new EventPickListError(
        "field_required",
        `${field} is required.`,
        400,
        field,
      );
    }
    return null;
  }
  if (text.length > max) {
    throw new EventPickListError(
      "field_too_long",
      `${field} must be ${max} characters or fewer.`,
      400,
      field,
    );
  }
  return text;
}

function uniqueIds(value, { field = "applicationIds" } = {}) {
  const list = Array.isArray(value) ? value : [];
  const ids = [
    ...new Set(list.map((id) => String(id || "").trim()).filter(Boolean)),
  ];
  if (ids.length === 0) {
    throw new EventPickListError(
      "no_applications",
      "Select at least one applicant.",
      400,
      field,
    );
  }
  if (ids.length > MAX_ITEMS_PER_REQUEST) {
    throw new EventPickListError(
      "too_many_applications",
      `Up to ${MAX_ITEMS_PER_REQUEST} applicants can be moved at once.`,
      400,
      field,
    );
  }
  return ids;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePagination({ limit, offset } = {}) {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);
  return {
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, POOL_MAX_PAGE_SIZE)
        : POOL_PAGE_SIZE,
    offset: Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
  };
}

// ---------------------------------------------------------------------------
// Event calls
// ---------------------------------------------------------------------------

function serializeEventCall(link, counts = {}) {
  return {
    id: link.id,
    code: link.code,
    label: link.label,
    status: link.status,
    callKind: link.call_kind,
    event: {
      name: link.event_name || null,
      startsOn: link.event_starts_on || null,
      endsOn: link.event_ends_on || null,
      location: link.event_location || null,
    },
    compensation: {
      type: link.compensation_type || null,
      details: link.compensation_details || null,
    },
    intake: {
      walkVideo: Boolean(link.requires_walk_video),
      availability: Boolean(link.requires_availability),
      measurements: Boolean(link.requires_measurements),
    },
    offerResponseWindowHours: link.offer_response_window_hours ?? null,
    createdAt: link.created_at,
    counts: {
      total: Number(counts.total || 0),
      ...EVENT_POOL_STAGE_KEYS.reduce((acc, key) => {
        acc[key] = Number(counts[key] || 0);
        return acc;
      }, {}),
    },
  };
}

/** Every event call this agency owns, newest first, with its stage counts. */
async function listEventCalls(db, { agencyId }) {
  const links = await db("agency_open_call_links")
    .where({ agency_id: agencyId, call_kind: CALL_KINDS.EVENT_CASTING })
    .orderBy("created_at", "desc");
  if (links.length === 0) return [];

  const statusRows = await db("applications")
    .whereIn(
      "open_call_link_id",
      links.map((link) => link.id),
    )
    .where({ agency_id: agencyId })
    .groupBy("open_call_link_id", "status")
    .select("open_call_link_id", "status")
    .count({ count: "*" });

  const countsByLink = new Map();
  for (const row of statusRows) {
    const bucket = countsByLink.get(row.open_call_link_id) || { total: 0 };
    const count = Number(row.count || 0);
    bucket.total += count;
    for (const [stage, statuses] of Object.entries(EVENT_POOL_STAGES)) {
      if (statuses.includes(row.status)) {
        bucket[stage] = (bucket[stage] || 0) + count;
      }
    }
    countsByLink.set(row.open_call_link_id, bucket);
  }

  return links.map((link) =>
    serializeEventCall(link, countsByLink.get(link.id) || {}),
  );
}

/**
 * Load an event call this agency owns. Every route in the surface starts here:
 * it is the tenancy check and the "is this actually an event call" check in
 * one, so no handler can reach a pick list through somebody else's link.
 */
async function loadEventCall(db, { agencyId, linkId }) {
  const link = await db("agency_open_call_links")
    .where({ id: linkId, agency_id: agencyId })
    .first();
  if (!link || link.call_kind !== CALL_KINDS.EVENT_CASTING) {
    throw new EventPickListError(
      "event_call_not_found",
      "Event call not found.",
      404,
    );
  }
  return link;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

/**
 * One page of the applications that arrived through this call.
 *
 * Paginated rather than capped (ruling R7): the organizer picks designers'
 * slices out of this list, and at the 2,000-application design ceiling a
 * single unbounded response would carry every submission package with it.
 */
async function listPool(
  db,
  { agencyId, linkId, stage = "", search = "", limit, offset } = {},
) {
  await loadEventCall(db, { agencyId, linkId });
  const page = normalizePagination({ limit, offset });

  const stageKey = String(stage || "").trim();
  if (stageKey && !EVENT_POOL_STAGES[stageKey]) {
    throw new EventPickListError(
      "invalid_stage",
      `Stage must be one of ${EVENT_POOL_STAGE_KEYS.join(", ")}.`,
      400,
      "stage",
    );
  }
  const term = String(search || "").trim();

  const identitySupported = await hasApplicantIdentitySupport(db);

  const scoped = () => {
    const query = db("applications as a")
      .leftJoin("profiles as p", "p.id", "a.profile_id")
      .where("a.agency_id", agencyId)
      .where("a.open_call_link_id", linkId)
      .whereNot("a.status", "withdrawn");
    /* Search reaches the identity's email as a fourth term rather than a full
       DTO pass: the snapshot's name lives inside a JSON payload that no
       database in this stack can index, and the identity's email is the one
       indexed, searchable fact an unclaimed applicant has. A pool search that
       matched only profile columns would quietly hide the unclaimed half. */
    if (identitySupported) {
      query.leftJoin(
        "applicant_identities as ai",
        "ai.id",
        "a.applicant_identity_id",
      );
    }
    if (stageKey) query.whereIn("a.status", EVENT_POOL_STAGES[stageKey]);
    if (term) {
      query.andWhere((qb) => {
        qb.whereILike("p.first_name", `%${term}%`)
          .orWhereILike("p.last_name", `%${term}%`)
          .orWhereILike("p.city", `%${term}%`);
        if (identitySupported) {
          qb.orWhereILike("ai.email_normalized", `%${term}%`);
        }
      });
    }
    return query;
  };

  const [totalRow, rows] = await Promise.all([
    scoped().count({ count: "*" }).first(),
    scoped()
      .select(
        "a.id as application_id",
        "a.status",
        "a.created_at as applied_at",
        "p.id as profile_id",
        "p.first_name",
        "p.last_name",
        "p.city",
        "p.height_cm",
        "p.date_of_birth",
        ...(identitySupported ? ["a.applicant_identity_id"] : []),
      )
      .orderBy([
        { column: "a.created_at", order: "desc" },
        { column: "a.id", order: "asc" },
      ])
      .limit(page.limit)
      .offset(page.offset),
  ]);

  const [marksByApplication, resolved] = await Promise.all([
    loadMarkRollups(
      db,
      rows.map((row) => row.application_id),
    ),
    resolveIdentityRows(db, rows),
  ]);

  return {
    total: Number(totalRow?.count || 0),
    limit: page.limit,
    offset: page.offset,
    stage: stageKey || null,
    applicants: rows.map((row) => {
      const identity = resolved.get(row.application_id) || null;
      return {
        applicationId: row.application_id,
        profileId: row.profile_id || null,
        name: applicantName(row, resolved),
        city: row.city || identity?.city || null,
        heightCm: row.height_cm ?? identity?.heightCm ?? null,
        /* The organizer's own applicants, so the exact age is theirs to read —
           the same figure the submissions desk prints. Null where no date of
           birth was ever recorded; the row then prints no age at all. */
        age: computeAge(row.date_of_birth ?? identity?.dateOfBirth),
        status: row.status,
        appliedAt: row.applied_at,
        marks: marksByApplication.get(row.application_id) || emptyMarkRollup(),
      };
    }),
  };
}

function emptyMarkRollup() {
  return { pick: 0, maybe: 0, pass: 0, offered: false };
}

/**
 * How many designers marked each applicant which way. Read by JOIN every time
 * — there is no denormalized mirror of a designer's opinion anywhere.
 */
async function loadMarkRollups(db, applicationIds) {
  const byApplication = new Map();
  if (!applicationIds || applicationIds.length === 0) return byApplication;

  const rows = await db("event_pick_selections")
    .whereIn("application_id", applicationIds)
    .select("application_id", "mark", "offered_at");

  for (const row of rows) {
    const bucket = byApplication.get(row.application_id) || emptyMarkRollup();
    if (Object.prototype.hasOwnProperty.call(bucket, row.mark)) {
      bucket[row.mark] += 1;
    }
    if (row.offered_at) bucket.offered = true;
    byApplication.set(row.application_id, bucket);
  }
  return byApplication;
}

// ---------------------------------------------------------------------------
// Pick lists
// ---------------------------------------------------------------------------

function serializePickList(row, rollup = {}) {
  const expiresAt = toDate(row.expires_at);
  return {
    id: row.id,
    openCallLinkId: row.open_call_link_id,
    designerName: row.designer_name,
    designerEmail: row.designer_email || null,
    label: row.label || null,
    organizerNote: row.organizer_note || null,
    slotsRequested: row.slots_requested ?? null,
    status: row.status,
    expiresAt: row.expires_at,
    expired: Boolean(expiresAt && expiresAt.getTime() <= Date.now()),
    // The status vocabulary belongs to Lane 0's constants module, which the
    // SPA mirror does not carry. Resolving it to booleans here keeps the
    // organizer UI branching on facts rather than on a second copy of the
    // spelling — and a new status can never silently read as "live".
    revoked: row.status === PICK_LIST_STATUSES.REVOKED,
    closed: row.status === PICK_LIST_STATUSES.CLOSED,
    // Ruling R3 accepts that a link can be forwarded; these are how an
    // organizer sees it happening, so they are first-class in the DTO.
    openCount: Number(row.open_count || 0),
    firstOpenedAt: row.first_opened_at || null,
    lastOpenedAt: row.last_opened_at || null,
    submittedAt: row.submitted_at || null,
    revokedAt: row.revoked_at || null,
    rotatedAt: row.rotated_at || null,
    createdAt: row.created_at,
    itemCount: Number(rollup.itemCount || 0),
    marks: {
      pick: Number(rollup.pick || 0),
      maybe: Number(rollup.maybe || 0),
      pass: Number(rollup.pass || 0),
    },
    markedCount: Number(rollup.markedCount || 0),
  };
}

async function loadPickListRollups(db, pickListIds) {
  const rollups = new Map();
  if (!pickListIds || pickListIds.length === 0) return rollups;

  const [itemRows, markRows] = await Promise.all([
    db("event_pick_list_items")
      .whereIn("pick_list_id", pickListIds)
      .groupBy("pick_list_id")
      .select("pick_list_id")
      .count({ count: "*" }),
    db("event_pick_selections")
      .whereIn("pick_list_id", pickListIds)
      .groupBy("pick_list_id", "mark")
      .select("pick_list_id", "mark")
      .count({ count: "*" }),
  ]);

  for (const row of itemRows) {
    rollups.set(row.pick_list_id, { itemCount: Number(row.count || 0) });
  }
  for (const row of markRows) {
    const bucket = rollups.get(row.pick_list_id) || {};
    const count = Number(row.count || 0);
    bucket[row.mark] = count;
    bucket.markedCount = Number(bucket.markedCount || 0) + count;
    rollups.set(row.pick_list_id, bucket);
  }
  return rollups;
}

async function listPickLists(db, { agencyId, linkId }) {
  await loadEventCall(db, { agencyId, linkId });
  const rows = await db("event_pick_lists")
    .where({ agency_id: agencyId, open_call_link_id: linkId })
    .orderBy("created_at", "asc");

  const rollups = await loadPickListRollups(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => serializePickList(row, rollups.get(row.id) || {}));
}

async function loadOwnedPickList(db, { agencyId, pickListId }) {
  const row = await db("event_pick_lists")
    .where({ id: pickListId, agency_id: agencyId })
    .first();
  if (!row) {
    throw new EventPickListError(
      "pick_list_not_found",
      "Pick list not found.",
      404,
    );
  }
  return row;
}

/** A revoked list is terminal: it cannot be relabelled, refilled or reopened. */
function assertAmendable(row) {
  if (row.status === PICK_LIST_STATUSES.REVOKED) {
    throw new EventPickListError(
      "pick_list_revoked",
      "This designer's link was revoked. Create a new list instead.",
      409,
    );
  }
}

/**
 * Applications an organizer is allowed to put in front of a designer: their
 * own, from this call, not withdrawn. Anything else in the request is reported
 * back rather than silently dropped.
 */
async function assertApplicationsInCall(db, { agencyId, linkId, applicationIds }) {
  const rows = await db("applications")
    .where({ agency_id: agencyId, open_call_link_id: linkId })
    .whereIn("id", applicationIds)
    .whereNot("status", "withdrawn")
    .select("id");
  const found = new Set(rows.map((row) => row.id));
  const rejected = applicationIds.filter((id) => !found.has(id));
  if (rejected.length > 0) {
    throw new EventPickListError(
      "applications_not_in_call",
      "Some applicants are not part of this event call.",
      400,
      "applicationIds",
    );
  }
  return applicationIds;
}

/**
 * Create a list and mint its link.
 *
 * The raw URL is returned exactly once, here. Only the hash is stored, so a
 * later read of this row — by us, by an admin, or by anyone who reaches the
 * database — cannot reconstruct a working link.
 */
async function createPickList(
  db,
  {
    agencyId,
    linkId,
    actorUserId = null,
    designerName,
    designerEmail = null,
    label = null,
    organizerNote = null,
    slotsRequested = null,
    applicationIds = [],
    open = true,
  },
) {
  const link = await loadEventCall(db, { agencyId, linkId });

  const name = trimmedString(designerName, {
    field: "designerName",
    max: 160,
    required: true,
  });
  const email = trimmedString(designerEmail, {
    field: "designerEmail",
    max: 254,
  });
  const listLabel = trimmedString(label, { field: "label", max: 120 });
  const note = trimmedString(organizerNote, { field: "organizerNote", max: 2000 });

  let slots = null;
  if (slotsRequested !== null && slotsRequested !== undefined && slotsRequested !== "") {
    slots = Number.parseInt(slotsRequested, 10);
    if (!Number.isFinite(slots) || slots < 1 || slots > MAX_ITEMS_PER_LIST) {
      throw new EventPickListError(
        "invalid_slots",
        `Slots must be between 1 and ${MAX_ITEMS_PER_LIST}.`,
        400,
        "slotsRequested",
      );
    }
  }

  const ids = Array.isArray(applicationIds) && applicationIds.length > 0
    ? uniqueIds(applicationIds)
    : [];
  if (ids.length > MAX_ITEMS_PER_LIST) {
    throw new EventPickListError(
      "list_too_large",
      `A designer sees up to ${MAX_ITEMS_PER_LIST} applicants in one list.`,
      400,
      "applicationIds",
    );
  }
  if (ids.length > 0) {
    await assertApplicationsInCall(db, { agencyId, linkId, applicationIds: ids });
  }

  const id = uuidv4();
  // `token_hash` is NOT NULL, so the row cannot be inserted and then given a
  // token: we take the material up front (Lane D's create-path export, which
  // also owns the TTL policy) and insert it with the row.
  const { rawToken, tokenHash, url, expiresAt } = buildPickListTokenMaterial({
    eventEndsOn: link.event_ends_on,
  });
  const now = new Date();

  await db.transaction(async (trx) => {
    await trx("event_pick_lists").insert({
      id,
      agency_id: agencyId,
      open_call_link_id: linkId,
      designer_name: name,
      designer_email: email,
      label: listLabel,
      organizer_note: note,
      slots_requested: slots,
      status: open ? PICK_LIST_STATUSES.OPEN : PICK_LIST_STATUSES.DRAFT,
      token_hash: tokenHash,
      expires_at: expiresAt,
      open_count: 0,
      created_by_user_id: actorUserId,
      created_at: now,
      updated_at: now,
    });
    if (ids.length > 0) {
      await trx("event_pick_list_items").insert(
        ids.map((applicationId, index) => ({
          id: uuidv4(),
          pick_list_id: id,
          application_id: applicationId,
          sort: index,
          added_by_user_id: actorUserId,
          created_at: now,
        })),
      );
    }
  });

  const row = await db("event_pick_lists").where({ id }).first();
  return {
    pickList: serializePickList(row, { itemCount: ids.length }),
    // Shown once by the organizer UI, then unrecoverable.
    url,
    rawToken,
  };
}

async function updatePickList(db, { agencyId, pickListId, patch = {} }) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });
  assertAmendable(row);

  const updates = {};
  if (patch.designerName !== undefined) {
    updates.designer_name = trimmedString(patch.designerName, {
      field: "designerName",
      max: 160,
      required: true,
    });
  }
  if (patch.designerEmail !== undefined) {
    updates.designer_email = trimmedString(patch.designerEmail, {
      field: "designerEmail",
      max: 254,
    });
  }
  if (patch.label !== undefined) {
    updates.label = trimmedString(patch.label, { field: "label", max: 120 });
  }
  if (patch.organizerNote !== undefined) {
    updates.organizer_note = trimmedString(patch.organizerNote, {
      field: "organizerNote",
      max: 2000,
    });
  }
  if (patch.slotsRequested !== undefined) {
    if (patch.slotsRequested === null || patch.slotsRequested === "") {
      updates.slots_requested = null;
    } else {
      const slots = Number.parseInt(patch.slotsRequested, 10);
      if (!Number.isFinite(slots) || slots < 1 || slots > MAX_ITEMS_PER_LIST) {
        throw new EventPickListError(
          "invalid_slots",
          `Slots must be between 1 and ${MAX_ITEMS_PER_LIST}.`,
          400,
          "slotsRequested",
        );
      }
      updates.slots_requested = slots;
    }
  }
  if (patch.status !== undefined) {
    const status = String(patch.status || "").trim();
    // Revocation has its own endpoint because it also has to burn the token.
    if (![PICK_LIST_STATUSES.OPEN, PICK_LIST_STATUSES.CLOSED].includes(status)) {
      throw new EventPickListError(
        "invalid_status",
        "Status must be open or closed.",
        400,
        "status",
      );
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    throw new EventPickListError(
      "no_changes",
      "Provide something to change.",
      400,
    );
  }

  await db("event_pick_lists")
    .where({ id: pickListId })
    .update({ ...updates, updated_at: new Date() });

  const updated = await db("event_pick_lists").where({ id: pickListId }).first();
  const rollups = await loadPickListRollups(db, [pickListId]);
  return serializePickList(updated, rollups.get(pickListId) || {});
}

/**
 * Rotate the link for one designer — the answer to "I lost the email" that
 * does not also hand the old recipients a live link forever. The previous hash
 * is overwritten, so the old URL 404s from the next request onward.
 */
async function reissuePickList(db, { agencyId, pickListId }) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });
  assertAmendable(row);

  // Lane D's mint writes `token_hash`, `expires_at` and `rotated_at` itself —
  // the hash must not exist outside that module. All that is left for us is
  // the organizer-visible state: a reissued list is open again.
  const { rawToken, url } = await mintPickListToken({
    pickListId,
    db,
    reissue: true,
  });

  await db("event_pick_lists").where({ id: pickListId }).update({
    status: PICK_LIST_STATUSES.OPEN,
    updated_at: new Date(),
  });

  const updated = await db("event_pick_lists").where({ id: pickListId }).first();
  const rollups = await loadPickListRollups(db, [pickListId]);
  return {
    pickList: serializePickList(updated, rollups.get(pickListId) || {}),
    url,
    rawToken,
  };
}

/**
 * Revoke one designer's access without touching anybody else's. Marks already
 * returned are kept — the organizer still has to act on them — but the link
 * stops resolving.
 */
async function revokePickList(db, { agencyId, pickListId }) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });
  if (row.status === PICK_LIST_STATUSES.REVOKED) {
    const rollups = await loadPickListRollups(db, [pickListId]);
    return serializePickList(row, rollups.get(pickListId) || {});
  }

  const now = new Date();
  await db("event_pick_lists").where({ id: pickListId }).update({
    status: PICK_LIST_STATUSES.REVOKED,
    revoked_at: now,
    updated_at: now,
  });

  const updated = await db("event_pick_lists").where({ id: pickListId }).first();
  const rollups = await loadPickListRollups(db, [pickListId]);
  return serializePickList(updated, rollups.get(pickListId) || {});
}

async function addPickListItems(
  db,
  { agencyId, pickListId, applicationIds, actorUserId = null },
) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });
  assertAmendable(row);
  const ids = uniqueIds(applicationIds);
  await assertApplicationsInCall(db, {
    agencyId,
    linkId: row.open_call_link_id,
    applicationIds: ids,
  });

  const existing = await db("event_pick_list_items")
    .where({ pick_list_id: pickListId })
    .select("application_id", "sort");
  const already = new Set(existing.map((item) => item.application_id));
  const toAdd = ids.filter((id) => !already.has(id));

  if (already.size + toAdd.length > MAX_ITEMS_PER_LIST) {
    throw new EventPickListError(
      "list_too_large",
      `A designer sees up to ${MAX_ITEMS_PER_LIST} applicants in one list.`,
      400,
      "applicationIds",
    );
  }

  if (toAdd.length > 0) {
    const nextSort = existing.reduce(
      (max, item) => Math.max(max, Number(item.sort || 0) + 1),
      0,
    );
    await db("event_pick_list_items").insert(
      toAdd.map((applicationId, index) => ({
        id: uuidv4(),
        pick_list_id: pickListId,
        application_id: applicationId,
        sort: nextSort + index,
        added_by_user_id: actorUserId,
        created_at: new Date(),
      })),
    );
    await db("event_pick_lists")
      .where({ id: pickListId })
      .update({ updated_at: new Date() });
  }

  return {
    added: toAdd.length,
    skipped: ids.length - toAdd.length,
    itemCount: already.size + toAdd.length,
  };
}

/**
 * Pulling an applicant out of a list also removes the designer's mark on them.
 * Keeping the mark would leave the lineup asserting an opinion about somebody
 * that designer can no longer see.
 */
async function removePickListItems(db, { agencyId, pickListId, applicationIds }) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });
  assertAmendable(row);
  const ids = uniqueIds(applicationIds);

  const removed = await db.transaction(async (trx) => {
    const count = await trx("event_pick_list_items")
      .where({ pick_list_id: pickListId })
      .whereIn("application_id", ids)
      .del();
    await trx("event_pick_selections")
      .where({ pick_list_id: pickListId })
      .whereIn("application_id", ids)
      // An offer already made is a commitment to the applicant; it is not the
      // organizer's to erase by tidying a list.
      .whereNull("offered_at")
      .del();
    return count;
  });

  const remaining = await db("event_pick_list_items")
    .where({ pick_list_id: pickListId })
    .count({ count: "*" })
    .first();

  return { removed, itemCount: Number(remaining?.count || 0) };
}

/**
 * What one designer sent back. Organizer-side read of
 * `event_pick_selections` joined to the applicant — never a copy of the mark
 * stored anywhere else.
 */
async function listSelections(db, { agencyId, pickListId }) {
  const row = await loadOwnedPickList(db, { agencyId, pickListId });

  const identitySupported = await hasApplicantIdentitySupport(db);

  // LEFT JOIN, see resolveIdentityRows above: an unclaimed applicant a designer
  // marked must read back to the organizer, not vanish from the read-back.
  const rows = await db("event_pick_list_items as i")
    .join("applications as a", "a.id", "i.application_id")
    .leftJoin("profiles as p", "p.id", "a.profile_id")
    .leftJoin("event_pick_selections as s", (join) => {
      join
        .on("s.application_id", "=", "i.application_id")
        .andOn("s.pick_list_id", "=", "i.pick_list_id");
    })
    .where("i.pick_list_id", pickListId)
    .select(
      "i.application_id",
      "i.sort",
      "a.status as application_status",
      "a.profile_id",
      ...(identitySupported ? ["a.applicant_identity_id"] : []),
      "p.first_name",
      "p.last_name",
      "p.city",
      "s.mark",
      "s.note",
      "s.marked_at",
      "s.offered_at",
    )
    .orderBy([
      { column: "i.sort", order: "asc" },
      { column: "i.application_id", order: "asc" },
    ]);

  const [rollups, resolved] = await Promise.all([
    loadPickListRollups(db, [pickListId]),
    resolveIdentityRows(db, rows),
  ]);
  return {
    pickList: serializePickList(row, rollups.get(pickListId) || {}),
    selections: rows.map((item) => ({
      applicationId: item.application_id,
      name: applicantName(item, resolved),
      city: item.city || resolved.get(item.application_id)?.city || null,
      applicationStatus: item.application_status,
      mark: item.mark || null,
      note: item.note || null,
      markedAt: item.marked_at || null,
      offeredAt: item.offered_at || null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Lineup
// ---------------------------------------------------------------------------

/**
 * The organizer's decision surface: who the designers want, who wants them,
 * and where each applicant stands.
 *
 * Two views of the same JOIN because the organizer asks two questions of it —
 * "what did this designer say" (per-list) and "who is claimed and by whom"
 * (per-applicant, the row an Offer button lives on).
 */
async function buildLineup(db, { agencyId, linkId }) {
  await loadEventCall(db, { agencyId, linkId });

  const lists = await db("event_pick_lists")
    .where({ agency_id: agencyId, open_call_link_id: linkId })
    .orderBy("created_at", "asc");

  const identitySupported = await hasApplicantIdentitySupport(db);

  // LEFT JOIN, see resolveIdentityRows above. The lineup is where slots get
  // offered; an unclaimed applicant three designers picked must appear on it.
  const rows = await db("event_pick_selections as s")
    .join("event_pick_lists as l", "l.id", "s.pick_list_id")
    .join("applications as a", "a.id", "s.application_id")
    .leftJoin("profiles as p", "p.id", "a.profile_id")
    .where("l.agency_id", agencyId)
    .where("l.open_call_link_id", linkId)
    .whereIn("s.mark", [PICK_MARKS.PICK, PICK_MARKS.MAYBE])
    .select(
      "s.application_id",
      "s.mark",
      "s.note",
      "s.marked_at",
      "s.offered_at",
      "l.id as pick_list_id",
      "l.designer_name",
      "l.label as pick_list_label",
      "a.status as application_status",
      "a.profile_id",
      ...(identitySupported ? ["a.applicant_identity_id"] : []),
      "p.first_name",
      "p.last_name",
      "p.city",
      "p.height_cm",
      "p.date_of_birth",
    )
    .orderBy([
      { column: "p.last_name", order: "asc" },
      { column: "p.first_name", order: "asc" },
    ]);

  const resolved = await resolveIdentityRows(db, rows);

  const byApplication = new Map();
  const byList = new Map(
    lists.map((list) => [
      list.id,
      {
        pickListId: list.id,
        designerName: list.designer_name,
        label: list.label || null,
        slotsRequested: list.slots_requested ?? null,
        status: list.status,
        picks: [],
        maybes: [],
      },
    ]),
  );

  for (const row of rows) {
    const applicant = byApplication.get(row.application_id) || {
      applicationId: row.application_id,
      name: applicantName(row, resolved),
      city: row.city || resolved.get(row.application_id)?.city || null,
      heightCm:
        row.height_cm ?? resolved.get(row.application_id)?.heightCm ?? null,
      age: computeAge(
        row.date_of_birth ?? resolved.get(row.application_id)?.dateOfBirth,
      ),
      status: row.application_status,
      pickedBy: [],
      maybeBy: [],
      notes: [],
      offeredAt: null,
      offeredByPickListId: null,
    };
    const designer = {
      pickListId: row.pick_list_id,
      designerName: row.designer_name,
      markedAt: row.marked_at,
    };
    if (row.mark === PICK_MARKS.PICK) applicant.pickedBy.push(designer);
    else applicant.maybeBy.push(designer);
    if (row.note) {
      applicant.notes.push({ designerName: row.designer_name, note: row.note });
    }
    if (row.offered_at) {
      applicant.offeredAt = row.offered_at;
      applicant.offeredByPickListId = row.pick_list_id;
    }
    byApplication.set(row.application_id, applicant);

    const list = byList.get(row.pick_list_id);
    if (list) {
      (row.mark === PICK_MARKS.PICK ? list.picks : list.maybes).push({
        applicationId: row.application_id,
        name: applicant.name,
      });
    }
  }

  const applicants = [...byApplication.values()].sort((a, b) => {
    if (b.pickedBy.length !== a.pickedBy.length) {
      return b.pickedBy.length - a.pickedBy.length;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    designers: [...byList.values()],
    applicants,
    counts: {
      claimed: applicants.length,
      offered: applicants.filter((a) => a.offeredAt).length,
      confirmed: applicants.filter(
        (a) => a.status === CONFIRMED_APPLICATION_STATUS,
      ).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

/**
 * Hand an applicant a slot.
 *
 * This is the only function in the module that writes `applications.status`,
 * and it writes the ordinary agency-writable `accepted` — the event label
 * override ("Offered a slot") is presentation, not a second status. The
 * partial unique `uq_event_pick_selections_offered_application` means one live
 * offer per applicant across the whole call: two designers may both pick the
 * same model, only one of them gets handed the slot. We check for the existing
 * offer first so the organizer gets an explanation instead of a constraint
 * violation, and the index stays as the backstop under concurrency.
 *
 * @returns {{offered: string[], skipped: {applicationId: string, reason: string}[]}}
 */
async function recordOffers(
  db,
  { agencyId, linkId, applicationIds, pickListId = null, actorUserId = null },
) {
  await loadEventCall(db, { agencyId, linkId });
  const ids = uniqueIds(applicationIds);

  if (pickListId) {
    const list = await loadOwnedPickList(db, { agencyId, pickListId });
    if (list.open_call_link_id !== linkId) {
      throw new EventPickListError(
        "pick_list_not_in_call",
        "That pick list belongs to a different event call.",
        400,
        "pickListId",
      );
    }
  }

  const applications = await db("applications")
    .where({ agency_id: agencyId, open_call_link_id: linkId })
    .whereIn("id", ids)
    .whereNot("status", "withdrawn")
    // `applications` has no `talent_id` column (only `interviews` does), and
    // the notifier resolves the recipient through `profile_id` anyway.
    .select("id", "profile_id", "status");
  const applicationsById = new Map(applications.map((row) => [row.id, row]));

  const liveOffers = await db("event_pick_selections")
    .whereIn("application_id", ids)
    .whereNotNull("offered_at")
    .select("application_id", "pick_list_id");
  const alreadyOffered = new Map(
    liveOffers.map((row) => [row.application_id, row.pick_list_id]),
  );

  const offered = [];
  const skipped = [];
  const now = new Date();

  for (const applicationId of ids) {
    const application = applicationsById.get(applicationId);
    if (!application) {
      skipped.push({ applicationId, reason: "not_in_call" });
      continue;
    }
    if (application.status === CONFIRMED_APPLICATION_STATUS) {
      skipped.push({ applicationId, reason: "already_confirmed" });
      continue;
    }
    const existingOfferList = alreadyOffered.get(applicationId);
    if (existingOfferList && existingOfferList !== pickListId) {
      skipped.push({ applicationId, reason: "already_offered" });
      continue;
    }

    await db.transaction(async (trx) => {
      await trx("applications").where({ id: applicationId }).update({
        status: OFFERED_STATUS,
        accepted_at: now,
        declined_at: null,
        // The applicant's response window runs from the offer, so the
        // auto-close clock restarts here exactly as it does in the inbox.
        status_changed_at: now,
        updated_at: now,
      });

      if (pickListId) {
        const updatedRows = await trx("event_pick_selections")
          .where({ pick_list_id: pickListId, application_id: applicationId })
          .update({ offered_at: now, offered_by_user_id: actorUserId });
        if (updatedRows === 0) {
          // The organizer can offer a slot to somebody no designer marked —
          // their judgement outranks the room's. The row records the offer;
          // `mark` is required, and `pass` would be a lie, so the organizer's
          // own action is written as the mark it is.
          await trx("event_pick_selections").insert({
            id: uuidv4(),
            pick_list_id: pickListId,
            application_id: applicationId,
            mark: PICK_MARKS.PICK,
            marked_at: now,
            offered_at: now,
            offered_by_user_id: actorUserId,
          });
        }
      }
    });

    offered.push(applicationId);
  }

  return { offered, skipped, applicationsById };
}

module.exports = {
  EventPickListError,
  EVENT_POOL_STAGES,
  EVENT_POOL_STAGE_KEYS,
  MAX_ITEMS_PER_LIST,
  POOL_MAX_PAGE_SIZE,
  POOL_PAGE_SIZE,
  addPickListItems,
  buildLineup,
  createPickList,
  hasEventCastingSchema,
  listEventCalls,
  listPickLists,
  listPool,
  listSelections,
  loadEventCall,
  loadMarkRollups,
  recordOffers,
  reissuePickList,
  removePickListItems,
  resetEventCastingSchemaCache,
  revokePickList,
  serializeEventCall,
  serializePickList,
  updatePickList,
};
