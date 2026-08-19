"use strict";

/**
 * Lane E — the event-casting funnel (design §(g)).
 *
 * Two things are on trial here, and the second one matters more than the
 * numbers do.
 *
 *  1. Every one of the eight steps is actually written, from the surface that
 *     is supposed to write it, with the metadata the report reads back. A
 *     call-site that quietly stopped firing would leave a dashboard full of
 *     plausible zeroes, which is worse than no dashboard.
 *  2. **Instrumentation never changes behaviour.** The writer is exercised
 *     while it is throwing on every call, and the submit it is instrumenting
 *     must still return 200 and still leave a durable application row behind.
 *     That is the whole contract; if it does not hold, the feature is a
 *     liability rather than a measurement.
 *
 * Routers are mounted bare with the session injected — the units under test
 * are the handlers and the writer, not the app's middleware chain.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("event-funnel");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

/**
 * The real writer, with a switch that makes every call throw. Route code
 * destructures these at require time, so a `jest.spyOn` after the fact would
 * never be seen — the mock has to be in place before the routers load.
 */
jest.mock("../../src/shared/services/event-funnel", () => {
  const actual = jest.requireActual("../../src/shared/services/event-funnel");
  const control = { throws: false };
  const guard =
    (fn) =>
    (...args) => {
      if (control.throws) throw new Error("funnel writer exploded");
      return fn(...args);
    };
  return {
    ...actual,
    __control: control,
    recordEventFunnelEvent: jest.fn(guard(actual.recordEventFunnelEvent)),
    hasPriorEventSubmission: jest.fn(guard(actual.hasPriorEventSubmission)),
  };
});

jest.mock("../../src/shared/services/agency-notifications", () => ({
  AGENCY_NOTIFICATION_TYPES: {},
  getAgencyMemberUserIds: jest.fn().mockResolvedValue([]),
  notifyAgencyMembers: jest.fn().mockResolvedValue([]),
  notifyAgencyNewApplication: jest.fn().mockResolvedValue([]),
  notifyAgencyApplicationWithdrawn: jest.fn().mockResolvedValue([]),
  notifyAgencyEventSlotResponse: jest.fn().mockResolvedValue([]),
  notifyAgencyNewMessage: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../src/shared/services/notifications", () => {
  const actual = jest.requireActual("../../src/shared/services/notifications");
  return {
    ...actual,
    notifyTalentApplicationSubmitted: jest.fn().mockResolvedValue(null),
    markMessageNotificationsReadForApplication: jest.fn().mockResolvedValue(),
  };
});

const knex = require("../../src/shared/db/knex");
const {
  buildSubmissionPackageFingerprint,
} = require("../../src/domains/talent/services/submission-disclosure-consent");
const {
  DRAFT_SCHEMA_VERSION,
} = require("../../src/domains/talent/services/application-drafts");
const {
  recordSubmissionProgramAcknowledgment,
} = require("../../src/shared/lib/submission-program");
const {
  recordLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  FUNNEL_EVENT_TYPES,
  FUNNEL_EVENT_TYPE_VALUES,
} = require("../../src/shared/constants/event-casting");
const {
  EVENT_INTAKE_BLOCKER_CODES,
} = require("../../src/domains/talent/services/validate-submission-package");
const funnel = require("../../src/shared/services/event-funnel");
const {
  EVENT_FUNNEL_TABLE,
  PAYOFF_ACTIONS,
  anonIdFromRequest,
  hasPriorEventSubmission,
  recordEventFunnelEvent,
  recordReturnedD30Events,
  resetEventFunnelSchemaCache,
  safeFunnelMetadata,
} = funnel;
const {
  blockedReasonBreakdown,
  loadEventFunnelReport,
} = require("../../src/domains/agency/queries/event-funnel.queries");

const TALENT_USER_ID = uuidv4();
const AGENCY_USER_ID = uuidv4();
const STAFF_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const ORGANIZER_ID = uuidv4();
const BROOKLYN_LINK_ID = uuidv4();
const QUEENS_LINK_ID = uuidv4();
const HARLEM_LINK_ID = uuidv4();
const REPRESENTATION_LINK_ID = uuidv4();
const IMAGE_SET_ID = uuidv4();
const HEADSHOT_ID = uuidv4();
const FULL_LENGTH_ID = uuidv4();

const AVAILABILITY = Object.freeze({ from: "2026-09-14", to: "2026-09-18" });
const WALK_VIDEO = "https://vimeo.com/1234567890";
const DAY_MS = 86_400_000;

let talentApp;
let publicApp;
let internalApp;

function eventLinkRow({ id, code, eventName, requiresWalkVideo = true }) {
  return {
    id,
    agency_id: ORGANIZER_ID,
    code,
    label: eventName,
    status: "active",
    created_by_user_id: AGENCY_USER_ID,
    call_kind: CALL_KINDS.EVENT_CASTING,
    compensation_type: COMPENSATION_TYPES.PAID,
    compensation_details: "$250 per show plus travel.",
    event_name: eventName,
    event_starts_on: AVAILABILITY.from,
    event_ends_on: AVAILABILITY.to,
    event_location: "Brooklyn Navy Yard",
    requires_walk_video: requiresWalkVideo,
    requires_availability: true,
    requires_measurements: false,
    offer_response_window_hours: 48,
  };
}

async function seed() {
  await knex("users").insert([
    {
      id: TALENT_USER_ID,
      email: `funnel-talent-${TALENT_USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    },
    {
      id: AGENCY_USER_ID,
      email: `funnel-organizer-${AGENCY_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    },
    {
      id: STAFF_USER_ID,
      email: `funnel-staff-${STAFF_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    },
  ]);
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `funnel-talent-${PROFILE_ID}`,
    first_name: "Mara",
    last_name: "Iles",
    city: "Brooklyn",
    date_of_birth: "1997-02-11",
    gender: "Female",
    height_cm: 177,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    phone: "555-0199",
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });
  await knex("agencies").insert({
    id: ORGANIZER_ID,
    name: "Fashion Week Brooklyn",
    slug: `fwb-${ORGANIZER_ID}`,
    status: "ACTIVE",
    open_boards: JSON.stringify([]),
    org_kind: "event_organizer",
  });
  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: ORGANIZER_ID,
    user_id: AGENCY_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });
  await knex("agency_open_call_links").insert([
    eventLinkRow({
      id: BROOKLYN_LINK_ID,
      code: "funnelbrooklyn",
      eventName: "Autumn 2026 Brooklyn",
    }),
    eventLinkRow({
      id: QUEENS_LINK_ID,
      code: "funnelqueens01",
      eventName: "Autumn 2026 Queens",
    }),
    eventLinkRow({
      id: HARLEM_LINK_ID,
      code: "funnelharlem01",
      eventName: "Autumn 2026 Harlem",
    }),
    {
      id: REPRESENTATION_LINK_ID,
      agency_id: ORGANIZER_ID,
      code: "funnelreprsnt1",
      label: "Standing open call",
      status: "active",
      created_by_user_id: AGENCY_USER_ID,
      call_kind: CALL_KINDS.REPRESENTATION,
      // Knex normalizes a batch insert to one column list, so these cannot be
      // omitted just because a representation call has no intake gates.
      requires_walk_video: false,
      requires_availability: false,
      requires_measurements: false,
      offer_response_window_hours: DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
    },
  ]);
  await knex("image_sets").insert({
    id: IMAGE_SET_ID,
    profile_id: PROFILE_ID,
    kind: "portfolio_test",
    name: "Casting set",
    is_current: true,
  });
  for (const [id, shotType, sort] of [
    [HEADSHOT_ID, "headshot", 0],
    [FULL_LENGTH_ID, "full_length", 1],
  ]) {
    await knex("images").insert({
      id,
      profile_id: PROFILE_ID,
      path: `/uploads/${id}.jpg`,
      public_url: `/uploads/${id}.jpg`,
      set_id: IMAGE_SET_ID,
      image_type: "digital",
      shot_type: shotType,
      status: "active",
      captured_at: new Date().toISOString(),
      sort,
    });
    await knex("image_rights").insert({
      id: uuidv4(),
      image_id: id,
      rights_status: "cleared",
      license_type: "owned",
      copyright_owner: "Mara Iles",
    });
  }
  await recordSubmissionProgramAcknowledgment(knex, TALENT_USER_ID);
  await recordLegalAcceptance(knex, AGENCY_USER_ID, {
    terms: true,
    privacy: true,
  });
}

/** An active claim on `linkId` — exactly what an arrival mints. */
async function mintClaim(linkId) {
  await knex("agency_open_call_claims")
    .where({ profile_id: PROFILE_ID, agency_id: ORGANIZER_ID })
    .delete();
  await knex("agency_open_call_claims").insert({
    id: uuidv4(),
    link_id: linkId,
    agency_id: ORGANIZER_ID,
    profile_id: PROFILE_ID,
    status: "active",
    expires_at: new Date(Date.now() + DAY_MS).toISOString(),
  });
}

function submitBody({ linkId, availability = AVAILABILITY, walkVideoUrl = WALK_VIDEO }) {
  const imageIds = [HEADSHOT_ID, FULL_LENGTH_ID];
  return {
    agencyId: ORGANIZER_ID,
    idempotencyKey: `funnel-submit-${uuidv4()}`,
    draftVersion: 0,
    draftGeneration: 0,
    consentConfirmed: true,
    submissionPackage: {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      imageIds,
      mediaSetId: "current",
      boards: [],
      digitalSlotPicks: {},
      availability,
      walkVideoUrl,
      consentConfirmed: true,
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
      consentPackageFingerprint: buildSubmissionPackageFingerprint({
        agencyId: ORGANIZER_ID,
        boards: [],
        mediaSetId: "current",
        digitalSlotPicks: {},
        compCardPresetId: null,
        imageIds,
        note: "",
        openCallLinkId: linkId,
        availability,
        walkVideoUrl,
      }),
    },
  };
}

async function submitToCall(linkId, overrides = {}) {
  await mintClaim(linkId);
  return request(talentApp)
    .post("/api/talent/applications")
    .set("Accept", "application/json")
    .send(submitBody({ linkId, ...overrides }));
}

/** Every funnel row of one type for one call, newest last. */
function funnelRows(eventType, linkId) {
  const query = knex(EVENT_FUNNEL_TABLE).orderBy("occurred_at", "asc");
  if (eventType) query.where({ event_type: eventType });
  if (linkId) query.where({ open_call_link_id: linkId });
  return query.select("*");
}

function parsedMetadata(row) {
  if (!row?.metadata) return {};
  return typeof row.metadata === "string"
    ? JSON.parse(row.metadata)
    : row.metadata;
}

beforeAll(async () => {
  await migrate(knex);
  await seed();

  const applicationsRouter = require("../../src/domains/talent/routes/applications");
  talentApp = express();
  talentApp.use(express.json());
  talentApp.use((req, _res, next) => {
    req.session = { userId: TALENT_USER_ID, role: "TALENT" };
    next();
  });
  talentApp.use("/api/talent/applications", applicationsRouter);

  const publicRouter = require("../../src/routes/api/public");
  publicApp = express();
  publicApp.use(express.json());
  publicApp.use((req, _res, next) => {
    // A signed-out arrival by default; `x-actor: talent` opts in to a session.
    req.sessionID = req.headers["x-session-id"] || "anon-session-fixture";
    req.session =
      req.headers["x-actor"] === "talent"
        ? { userId: TALENT_USER_ID, role: "TALENT", id: req.sessionID }
        : { id: req.sessionID };
    next();
  });
  publicApp.use("/api/public", publicRouter);

  const internalRouter = require("../../src/domains/internal/routes/event-funnel");
  internalApp = express();
  internalApp.use(express.json());
  internalApp.use((req, _res, next) => {
    req.session =
      req.headers["x-actor"] === "staff"
        ? { userId: STAFF_USER_ID }
        : { userId: TALENT_USER_ID };
    next();
  });
  internalApp.use("/", internalRouter);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

beforeEach(() => {
  funnel.__control.throws = false;
});

// ───────────────────────────────────────────────────────────────────────────
// The writer
// ───────────────────────────────────────────────────────────────────────────

describe("recordEventFunnelEvent", () => {
  afterEach(async () => {
    await knex(EVENT_FUNNEL_TABLE)
      .where({ open_call_link_id: HARLEM_LINK_ID })
      .delete();
  });

  test("refuses an event type that is not in the constant", async () => {
    const written = await recordEventFunnelEvent({
      openCallLinkId: HARLEM_LINK_ID,
      eventType: "application_nearly_started",
    });
    expect(written).toBe(false);
    expect(await funnelRows(null, HARLEM_LINK_ID)).toHaveLength(0);
  });

  test("refuses an event with no call to attribute it to", async () => {
    // The column is NOT NULL and the whole table is indexed by it: a funnel
    // row without a call is a row no question can ever reach.
    const written = await recordEventFunnelEvent({
      openCallLinkId: null,
      eventType: FUNNEL_EVENT_TYPES.CALL_VIEWED,
    });
    expect(written).toBe(false);
  });

  test("swallows a database failure instead of raising it", async () => {
    const brokenDb = () => {
      throw new Error("connection terminated unexpectedly");
    };
    brokenDb.schema = {
      hasTable: async () => true,
    };
    await expect(
      recordEventFunnelEvent(
        {
          openCallLinkId: HARLEM_LINK_ID,
          eventType: FUNNEL_EVENT_TYPES.CALL_VIEWED,
        },
        { db: brokenDb },
      ),
    ).resolves.toBe(false);
  });

  test("stores codes and counts, and drops anything that could be a person", () => {
    const safe = safeFunnelMetadata({
      reason: EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO,
      blockerCount: 2,
      compCardPresent: true,
      codes: [EVENT_INTAKE_BLOCKER_CODES.AVAILABILITY, "not a code"],
      applicantName: "Mara Iles",
      email: "mara@example.com",
      note: "Please look at my walk, I trained for two years",
      walkVideoUrl: "https://vimeo.com/1234567890",
      nested: { city: "Brooklyn" },
    });
    expect(safe).toEqual({
      reason: EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO,
      blockerCount: 2,
      compCardPresent: true,
      codes: [EVENT_INTAKE_BLOCKER_CODES.AVAILABILITY],
    });
    // A URL and an email both contain characters a slug cannot; a sentence
    // contains spaces. None of them survive.
    expect(safe.email).toBeUndefined();
    expect(safe.note).toBeUndefined();
    expect(safe.walkVideoUrl).toBeUndefined();
    expect(safe.nested).toBeUndefined();
  });

  test("anon_id is a hash of the session id, never the session id", () => {
    const anonId = anonIdFromRequest({ sessionID: "session-abc" });
    expect(anonId).toMatch(/^[0-9a-f]{64}$/);
    expect(anonId).not.toContain("session-abc");
    // Stable, or it stitches nothing.
    expect(anonIdFromRequest({ sessionID: "session-abc" })).toBe(anonId);
    expect(anonIdFromRequest({ sessionID: "session-xyz" })).not.toBe(anonId);
    expect(anonIdFromRequest({})).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Step 1 — call_viewed
// ───────────────────────────────────────────────────────────────────────────

describe("call_viewed", () => {
  test("an event call arrival is counted, with a hashed session and no profile", async () => {
    const response = await request(publicApp)
      .get("/api/public/open-call/funnelharlem01")
      .set("x-session-id", "arrival-session-1");
    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);

    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.CALL_VIEWED,
      HARLEM_LINK_ID,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBeNull();
    expect(rows[0].agency_id).toBe(ORGANIZER_ID);
    expect(rows[0].anon_id).toBe(
      anonIdFromRequest({ sessionID: "arrival-session-1" }),
    );
  });

  test("a signed-in arrival carries the profile as well as the anon id", async () => {
    const response = await request(publicApp)
      .get("/api/public/open-call/funnelharlem01")
      .set("x-actor", "talent")
      .set("x-session-id", "arrival-session-2");
    expect(response.status).toBe(200);

    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.CALL_VIEWED,
      HARLEM_LINK_ID,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].profile_id).toBe(PROFILE_ID);
    expect(rows[1].anon_id).toBe(
      anonIdFromRequest({ sessionID: "arrival-session-2" }),
    );
  });

  test("a representation call records nothing at all", async () => {
    const response = await request(publicApp).get(
      "/api/public/open-call/funnelreprsnt1",
    );
    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
    expect(await funnelRows(null, REPRESENTATION_LINK_ID)).toHaveLength(0);
  });

  test("a writer that throws does not break the arrival screen", async () => {
    funnel.__control.throws = true;
    const response = await request(publicApp).get(
      "/api/public/open-call/funnelharlem01",
    );
    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Step 2 — application_started
// ───────────────────────────────────────────────────────────────────────────

describe("application_started", () => {
  function draftBody(version, openCallLinkId, note) {
    return {
      expectedVersion: version,
      expectedGeneration: version === 0 ? 0 : 1,
      currentStepId: "message",
      clientId: "browser:funnel-test",
      clientUpdatedAt: new Date().toISOString(),
      payload: {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        boards: [],
        mediaSetId: IMAGE_SET_ID,
        digitalSlotPicks: {},
        note,
        openCallLinkId,
        availability: AVAILABILITY,
        walkVideoUrl: WALK_VIDEO,
      },
    };
  }

  async function putDraft(body) {
    return request(talentApp)
      .put(`/api/talent/applications/drafts/${ORGANIZER_ID}`)
      .set("Accept", "application/json")
      .send(body);
  }

  afterAll(async () => {
    await knex("application_drafts").where({ profile_id: PROFILE_ID }).delete();
    await knex(EVENT_FUNNEL_TABLE)
      .where({ event_type: FUNNEL_EVENT_TYPES.APPLICATION_STARTED })
      .delete();
  });

  test("fires once on the first write carrying the call, not on every autosave", async () => {
    await mintClaim(QUEENS_LINK_ID);
    const created = await putDraft(draftBody(0, QUEENS_LINK_ID, "First pass."));
    expect(created.status).toBe(200);

    const saved = await putDraft(draftBody(1, QUEENS_LINK_ID, "Second pass."));
    expect(saved.status).toBe(200);
    const savedAgain = await putDraft(
      draftBody(2, QUEENS_LINK_ID, "Third pass."),
    );
    expect(savedAgain.status).toBe(200);

    // Three writes, three drafts saved, one application started.
    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.APPLICATION_STARTED,
      QUEENS_LINK_ID,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBe(PROFILE_ID);
    expect(rows[0].agency_id).toBe(ORGANIZER_ID);
  });

  test("a writer that throws still saves the draft", async () => {
    await knex("application_drafts").where({ profile_id: PROFILE_ID }).delete();
    await mintClaim(QUEENS_LINK_ID);
    funnel.__control.throws = true;

    const created = await putDraft(draftBody(0, QUEENS_LINK_ID, "Resilient."));
    expect(created.status).toBe(200);
    expect(created.body.data.version).toBe(1);
    expect(
      await knex("application_drafts")
        .where({ profile_id: PROFILE_ID })
        .select("id"),
    ).toHaveLength(1);
  });

  test("a draft that never names a call starts nothing", async () => {
    await knex("application_drafts").where({ profile_id: PROFILE_ID }).delete();
    await knex("agency_open_call_claims")
      .where({ profile_id: PROFILE_ID })
      .delete();
    const before = (await funnelRows(FUNNEL_EVENT_TYPES.APPLICATION_STARTED))
      .length;
    const created = await putDraft(draftBody(0, null, "Representation."));
    expect(created.status).toBe(200);
    expect(
      (await funnelRows(FUNNEL_EVENT_TYPES.APPLICATION_STARTED)).length,
    ).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Steps 3, 4, 5, 7 — the submit path
// ───────────────────────────────────────────────────────────────────────────

describe("the submit path", () => {
  test("a blocked send records why, with the validate path's own code", async () => {
    const response = await submitToCall(HARLEM_LINK_ID, { walkVideoUrl: null });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("submission_package_incomplete");

    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.INTAKE_BLOCKED,
      HARLEM_LINK_ID,
    );
    expect(rows).toHaveLength(1);
    expect(parsedMetadata(rows[0]).reason).toBe(
      EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO,
    );
    expect(parsedMetadata(rows[0]).blockerCount).toBe(1);
    // Nothing completed — the leak between started and completed is the
    // entire reason this event exists.
    expect(
      await funnelRows(
        FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED,
        HARLEM_LINK_ID,
      ),
    ).toHaveLength(0);
  });

  test("a completed send records the completion and the profile it was sent with", async () => {
    const response = await submitToCall(BROOKLYN_LINK_ID);
    expect(response.status).toBe(200);

    const completed = await funnelRows(
      FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED,
      BROOKLYN_LINK_ID,
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].profile_id).toBe(PROFILE_ID);
    expect(completed[0].agency_id).toBe(ORGANIZER_ID);

    const profileRows = await funnelRows(
      FUNNEL_EVENT_TYPES.PROFILE_COMPLETED_AT_SUBMIT,
      BROOKLYN_LINK_ID,
    );
    expect(profileRows).toHaveLength(1);
    const metadata = parsedMetadata(profileRows[0]);
    expect(typeof metadata.completeness).toBe("number");
    expect(metadata.completeness).toBeGreaterThan(0);
    expect(metadata.digitalSlots).toBe(0);
    expect(metadata.compCardPresent).toBe(false);
    // Codes and counts only.
    expect(Object.keys(metadata).sort()).toEqual([
      "compCardPresent",
      "completeness",
      "digitalSlots",
    ]);
  });

  test("the first send is not a second recipient", async () => {
    expect(
      await funnelRows(FUNNEL_EVENT_TYPES.SECOND_RECIPIENT_SUBMITTED),
    ).toHaveLength(0);
  });

  test("a send to a second call is", async () => {
    const response = await submitToCall(QUEENS_LINK_ID);
    expect(response.status).toBe(200);

    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.SECOND_RECIPIENT_SUBMITTED,
      QUEENS_LINK_ID,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBe(PROFILE_ID);
  });

  test("hasPriorEventSubmission ignores the call being submitted to", async () => {
    // Brooklyn's own completion must not make Brooklyn a second recipient.
    await expect(
      hasPriorEventSubmission({
        profileId: PROFILE_ID,
        excludeOpenCallLinkId: BROOKLYN_LINK_ID,
      }),
    ).resolves.toBe(true);
    await expect(
      hasPriorEventSubmission({ profileId: uuidv4() }),
    ).resolves.toBe(false);
  });

  test("A WRITER THAT THROWS STILL LETS THE SUBMISSION THROUGH", async () => {
    funnel.__control.throws = true;
    const before = (await funnelRows()).length;

    const response = await submitToCall(HARLEM_LINK_ID);
    expect(response.status).toBe(200);
    expect(response.body.id).toBeTruthy();

    // The application is durable; only the measurement was lost.
    const application = await knex("applications")
      .where({ id: response.body.id })
      .first("id", "open_call_link_id", "status");
    expect(application.open_call_link_id).toBe(HARLEM_LINK_ID);
    expect(application.status).toBe("pending");
    expect((await funnelRows()).length).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Step 6 — payoff_viewed
// ───────────────────────────────────────────────────────────────────────────

describe("payoff_viewed", () => {
  let applicationId;

  beforeAll(async () => {
    applicationId = (
      await knex("applications")
        .where({ profile_id: PROFILE_ID, open_call_link_id: BROOKLYN_LINK_ID })
        .first("id")
    ).id;
  });

  test("the success screen reports that the payoff block rendered", async () => {
    const response = await request(talentApp)
      .post(`/api/talent/applications/${applicationId}/payoff-viewed`)
      .set("Accept", "application/json")
      .send({ action: PAYOFF_ACTIONS.VIEWED });
    expect(response.status).toBe(204);

    const rows = await funnelRows(
      FUNNEL_EVENT_TYPES.PAYOFF_VIEWED,
      BROOKLYN_LINK_ID,
    );
    expect(rows).toHaveLength(1);
    expect(parsedMetadata(rows[0]).action).toBe(PAYOFF_ACTIONS.VIEWED);
    // The client names an action; the server names the call and the person.
    expect(rows[0].open_call_link_id).toBe(BROOKLYN_LINK_ID);
    expect(rows[0].profile_id).toBe(PROFILE_ID);
  });

  test("the comp card and portfolio links report their own action", async () => {
    await request(talentApp)
      .post(`/api/talent/applications/${applicationId}/payoff-viewed`)
      .send({ action: PAYOFF_ACTIONS.COMP_CARD })
      .expect(204);
    await request(talentApp)
      .post(`/api/talent/applications/${applicationId}/payoff-viewed`)
      .send({ action: "download_everything_forever" })
      .expect(204);

    const actions = (
      await funnelRows(FUNNEL_EVENT_TYPES.PAYOFF_VIEWED, BROOKLYN_LINK_ID)
    ).map((row) => parsedMetadata(row).action);
    // An unknown action degrades to a plain view rather than being stored.
    expect(actions).toEqual([
      PAYOFF_ACTIONS.VIEWED,
      PAYOFF_ACTIONS.COMP_CARD,
      PAYOFF_ACTIONS.VIEWED,
    ]);
  });

  test("someone else's application records nothing and still answers 204", async () => {
    const response = await request(talentApp)
      .post(`/api/talent/applications/${uuidv4()}/payoff-viewed`)
      .send({ action: PAYOFF_ACTIONS.VIEWED });
    expect(response.status).toBe(204);
    expect(
      await funnelRows(FUNNEL_EVENT_TYPES.PAYOFF_VIEWED, BROOKLYN_LINK_ID),
    ).toHaveLength(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Step 8 — returned_d30
// ───────────────────────────────────────────────────────────────────────────

describe("returned_d30", () => {
  const D30_PROFILE_ID = uuidv4();
  const D30_USER_ID = uuidv4();
  const D30_APPLICATION_ID = uuidv4();
  const RECENT_APPLICATION_ID = uuidv4();
  const liveSid = uuidv4();

  beforeAll(async () => {
    await knex("users").insert({
      id: D30_USER_ID,
      email: `funnel-d30-${D30_USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: D30_PROFILE_ID,
      user_id: D30_USER_ID,
      slug: `funnel-d30-${D30_PROFILE_ID}`,
      first_name: "Noor",
      last_name: "Vance",
      city: "Queens",
      date_of_birth: "1996-06-06",
      gender: "Female",
      height_cm: 175,
      bust_cm: 84,
      waist_cm: 62,
      hips_cm: 90,
      phone: "555-0177",
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await knex("applications").insert([
      {
        id: D30_APPLICATION_ID,
        profile_id: D30_PROFILE_ID,
        agency_id: ORGANIZER_ID,
        status: "pending",
        open_call_link_id: HARLEM_LINK_ID,
        call_purpose: CALL_KINDS.EVENT_CASTING,
        created_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
        updated_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      },
      {
        // Inside the funnel but far too recent to have "returned".
        id: RECENT_APPLICATION_ID,
        profile_id: D30_PROFILE_ID,
        agency_id: ORGANIZER_ID,
        status: "pending",
        open_call_link_id: QUEENS_LINK_ID,
        call_purpose: CALL_KINDS.EVENT_CASTING,
        created_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
        updated_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
      },
    ]);
  });

  afterAll(async () => {
    await knex(EVENT_FUNNEL_TABLE)
      .where({ profile_id: D30_PROFILE_ID })
      .delete();
    await knex("applications")
      .whereIn("id", [D30_APPLICATION_ID, RECENT_APPLICATION_ID])
      .delete();
    await knex("sessions").where({ sid: liveSid }).delete();
    await knex("profiles").where({ id: D30_PROFILE_ID }).delete();
    await knex("users").where({ id: D30_USER_ID }).delete();
  });

  test("no live session means no return, however old the submission is", async () => {
    const result = await recordReturnedD30Events({ db: knex });
    expect(result.recorded).toBe(0);
    expect(
      await knex(EVENT_FUNNEL_TABLE)
        .where({ profile_id: D30_PROFILE_ID })
        .select("id"),
    ).toHaveLength(0);
  });

  test("a live session inside the window records exactly one return", async () => {
    await knex("sessions").insert({
      sid: liveSid,
      sess: JSON.stringify({
        cookie: { path: "/" },
        userId: D30_USER_ID,
        role: "TALENT",
      }),
      expired: new Date(Date.now() + DAY_MS).toISOString(),
    });

    const result = await recordReturnedD30Events({ db: knex });
    expect(result.recorded).toBe(1);

    const rows = await knex(EVENT_FUNNEL_TABLE)
      .where({
        profile_id: D30_PROFILE_ID,
        event_type: FUNNEL_EVENT_TYPES.RETURNED_D30,
      })
      .select("*");
    expect(rows).toHaveLength(1);
    // The 3-day-old submission is not a return; only the 30-day-old one is.
    expect(rows[0].open_call_link_id).toBe(HARLEM_LINK_ID);
    expect(parsedMetadata(rows[0]).daysSinceSubmit).toBe(30);
  });

  test("the daily job is idempotent — an eleven-day window is not eleven returns", async () => {
    // The window is 25–35 days wide and the job runs every day, so without the
    // guard this submission would report a return on each of eleven runs.
    for (let run = 0; run < 3; run += 1) {
      const result = await recordReturnedD30Events({ db: knex });
      expect(result.recorded).toBe(0);
    }
    expect(
      await knex(EVENT_FUNNEL_TABLE)
        .where({
          profile_id: D30_PROFILE_ID,
          event_type: FUNNEL_EVENT_TYPES.RETURNED_D30,
        })
        .select("id"),
    ).toHaveLength(1);
  });

  test("a broken sweep reports zero rather than throwing", async () => {
    const brokenDb = () => {
      throw new Error("connection terminated unexpectedly");
    };
    brokenDb.schema = { hasTable: async () => true };
    await expect(
      recordReturnedD30Events({ db: brokenDb }),
    ).resolves.toEqual({ candidates: 0, recorded: 0 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Reporting
// ───────────────────────────────────────────────────────────────────────────

describe("the report", () => {
  test("returns every event type, sane rates, and a day bucket", async () => {
    const report = await loadEventFunnelReport(BROOKLYN_LINK_ID, { db: knex });

    expect(report.openCallLinkId).toBe(BROOKLYN_LINK_ID);
    // A zero is reported as a zero, not as a missing key.
    expect(Object.keys(report.totals).sort()).toEqual(
      [...FUNNEL_EVENT_TYPE_VALUES].sort(),
    );
    expect(report.totals[FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED]).toBe(1);
    expect(report.totals[FUNNEL_EVENT_TYPES.PAYOFF_VIEWED]).toBe(3);
    expect(report.distinctProfiles[FUNNEL_EVENT_TYPES.PAYOFF_VIEWED]).toBe(1);

    // No arrivals were recorded against Brooklyn, so the rate is unknown —
    // and an unknown rate is null, never 0%.
    expect(report.rates.completionFromView).toBeNull();

    expect(report.byDay.length).toBeGreaterThan(0);
    for (const bucket of report.byDay) {
      expect(bucket.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(FUNNEL_EVENT_TYPE_VALUES).toContain(bucket.eventType);
      expect(bucket.count).toBeGreaterThan(0);
    }
  });

  test("computes the rates that the funnel exists to answer", async () => {
    const report = await loadEventFunnelReport(HARLEM_LINK_ID, { db: knex });
    const viewed = report.totals[FUNNEL_EVENT_TYPES.CALL_VIEWED];
    const completed = report.totals[FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED];
    expect(viewed).toBeGreaterThan(0);
    expect(report.rates.completionFromView).toBeCloseTo(completed / viewed, 3);
    // Nothing was started against Harlem through a draft, so start-derived
    // rates stay unknown rather than reporting an impossible completion.
    expect(report.rates.completionFromStart).toBeNull();
  });

  test("breaks blocked sends down by reason, commonest first", async () => {
    const breakdown = await blockedReasonBreakdown(HARLEM_LINK_ID, {
      db: knex,
    });
    expect(breakdown).toEqual([
      { reason: EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO, count: 1 },
    ]);
  });

  test("a call with no funnel rows reports zeroes, not an error", async () => {
    const report = await loadEventFunnelReport(REPRESENTATION_LINK_ID, {
      db: knex,
    });
    expect(report.totals[FUNNEL_EVENT_TYPES.CALL_VIEWED]).toBe(0);
    expect(report.byDay).toEqual([]);
    expect(report.blockedReasons).toEqual([]);
    expect(report.rates.startFromView).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The internal read route
// ───────────────────────────────────────────────────────────────────────────

describe("GET /api/internal/event-funnel/:linkId", () => {
  afterAll(async () => {
    await knex("platform_admins").where({ user_id: STAFF_USER_ID }).delete();
  });

  test("is closed to everybody who is not platform staff", async () => {
    const response = await request(internalApp).get(
      `/api/internal/event-funnel/${BROOKLYN_LINK_ID}`,
    );
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PLATFORM_ADMIN_REQUIRED");
  });

  test("hands platform staff the call and its funnel", async () => {
    await knex("platform_admins").insert({
      id: uuidv4(),
      user_id: STAFF_USER_ID,
      status: "ACTIVE",
      display_name: "Funnel Staff",
    });

    const response = await request(internalApp)
      .get(`/api/internal/event-funnel/${BROOKLYN_LINK_ID}`)
      .set("x-actor", "staff");
    expect(response.status).toBe(200);
    expect(response.body.data.call.isEventCall).toBe(true);
    expect(response.body.data.call.agencyId).toBe(ORGANIZER_ID);
    expect(
      response.body.data.funnel.totals[
        FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED
      ],
    ).toBe(1);
  });

  test("rejects an id that is not one, and 404s one that is not a call", async () => {
    await request(internalApp)
      .get("/api/internal/event-funnel/not-a-uuid")
      .set("x-actor", "staff")
      .expect(400);
    await request(internalApp)
      .get(`/api/internal/event-funnel/${uuidv4()}`)
      .set("x-actor", "staff")
      .expect(404);
  });
});

// Guards the memoized schema probe against leaking into another suite's file.
afterAll(() => resetEventFunnelSchemaCache());
