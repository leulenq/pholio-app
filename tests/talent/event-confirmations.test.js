"use strict";

/**
 * The event submission end to end, and the two statuses only an applicant may
 * write.
 *
 * Three things are being defended here:
 *
 *  1. A submission that arrives through an event call is recorded as one —
 *     `call_purpose`, `open_call_link_id`, the event consent copy with the
 *     organizer's compensation sentence quoted verbatim, and the availability
 *     and walk video frozen into the package the designers will read.
 *  2. An offered slot can be answered exactly once, only from `accepted`, and
 *     only by the applicant.
 *  3. The organizer can NEVER write `confirmed` or `declined_by_talent`. That
 *     is the whole reason those two live outside `WRITABLE_APPLICATION_STATUSES`,
 *     and a route test is what proves the constant is actually load-bearing
 *     rather than decorative.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("event-confirmations");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

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
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
} = require("../../src/shared/constants/event-casting");
const {
  CONFIRMED_APPLICATION_STATUS,
  TALENT_DECLINED_APPLICATION_STATUS,
  WRITABLE_APPLICATION_STATUSES,
} = require("../../src/shared/constants/application-status");

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

const {
  notifyAgencyEventSlotResponse,
} = require("../../src/shared/services/agency-notifications");

const TALENT_USER_ID = uuidv4();
const AGENCY_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const ORGANIZER_ID = uuidv4();
const BROOKLYN_LINK_ID = uuidv4();
const QUEENS_LINK_ID = uuidv4();
const IMAGE_SET_ID = uuidv4();
const HEADSHOT_ID = uuidv4();
const FULL_LENGTH_ID = uuidv4();

const AVAILABILITY = Object.freeze({ from: "2026-09-14", to: "2026-09-18" });
const WALK_VIDEO = "https://vimeo.com/1234567890";
const COMPENSATION_DETAILS =
  "$250 per show plus travel within the five boroughs.";

let app;

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
    compensation_details: COMPENSATION_DETAILS,
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
      email: `event-talent-${TALENT_USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    },
    {
      id: AGENCY_USER_ID,
      email: `event-organizer-${AGENCY_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    },
  ]);
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `event-talent-${PROFILE_ID}`,
    first_name: "Vera",
    last_name: "Lang",
    city: "Brooklyn",
    date_of_birth: "1999-04-02",
    gender: "Female",
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    phone: "555-0142",
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
      code: "fwbbrooklyn1",
      eventName: "Autumn 2026 Brooklyn",
    }),
    eventLinkRow({
      id: QUEENS_LINK_ID,
      code: "fwbqueens0001",
      eventName: "Autumn 2026 Queens",
    }),
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
      copyright_owner: "Vera Lang",
    });
  }
  await recordSubmissionProgramAcknowledgment(knex, TALENT_USER_ID);
  // The agency API sits behind the legal gate; the organizer half of this
  // suite 403s before reaching the status check without it.
  await recordLegalAcceptance(knex, AGENCY_USER_ID, { terms: true, privacy: true });
}

/** An active claim on `linkId` — exactly what an arrival mints. */
async function mintClaim(linkId) {
  await knex("agency_open_call_claims")
    .where({ profile_id: PROFILE_ID, agency_id: ORGANIZER_ID })
    .delete();
  const id = uuidv4();
  await knex("agency_open_call_claims").insert({
    id,
    link_id: linkId,
    agency_id: ORGANIZER_ID,
    profile_id: PROFILE_ID,
    status: "active",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  return id;
}

function submitBody({ linkId, availability = AVAILABILITY, walkVideoUrl = WALK_VIDEO }) {
  const imageIds = [HEADSHOT_ID, FULL_LENGTH_ID];
  return {
    agencyId: ORGANIZER_ID,
    idempotencyKey: `event-submit-${uuidv4()}`,
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

beforeAll(async () => {
  await migrate(knex);
  await seed();

  // Mounted bare, with the session injected: the talent router is the unit
  // under test, not the app's middleware chain.
  const applicationsRouter = require("../../src/domains/talent/routes/applications");
  const inboxRouter = require("../../src/domains/agency/routes/inbox");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = req.headers["x-actor"] === "agency"
      ? {
          userId: AGENCY_USER_ID,
          role: "AGENCY",
          agencyId: ORGANIZER_ID,
          agencyMembershipRole: "OWNER",
          // The agency API guard reads both off the session and 403s before
          // any handler runs without them.
          agencyOnboardingCompletedAt: new Date().toISOString(),
        }
      : { userId: TALENT_USER_ID, role: "TALENT" };
    next();
  });
  app.use("/api/talent/applications", applicationsRouter);
  app.use(inboxRouter);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

beforeEach(() => {
  notifyAgencyEventSlotResponse.mockClear();
});

async function submitToCall(linkId, overrides = {}) {
  await mintClaim(linkId);
  return request(app)
    .post("/api/talent/applications")
    .set("Accept", "application/json")
    .send(submitBody({ linkId, ...overrides }));
}

describe("event submission", () => {
  let brooklynApplicationId;

  test("records the call, the purpose and the frozen event package", async () => {
    const response = await submitToCall(BROOKLYN_LINK_ID);
    expect(response.status).toBe(200);
    brooklynApplicationId = response.body.id;

    const application = await knex("applications")
      .where({ id: brooklynApplicationId })
      .first();
    expect(application.call_purpose).toBe(CALL_KINDS.EVENT_CASTING);
    expect(application.open_call_link_id).toBe(BROOKLYN_LINK_ID);
    expect(application.status).toBe("pending");
    expect(application.status_changed_at).toBeTruthy();

    // Top-level keys: the designer pick page reads them straight off the
    // frozen snapshot and never touches a live application row.
    const pkg = await knex("talent_submission_packages")
      .where({ application_id: brooklynApplicationId })
      .first();
    const payload =
      typeof pkg.payload === "string" ? JSON.parse(pkg.payload) : pkg.payload;
    expect(payload.availability).toEqual(AVAILABILITY);
    expect(payload.walkVideoUrl).toBe(WALK_VIDEO);
    expect(payload.openCallLinkId).toBe(BROOKLYN_LINK_ID);
    expect(payload.callPurpose).toBe(CALL_KINDS.EVENT_CASTING);
  });

  test("the consent record carries the purpose and the organizer's own compensation sentence", async () => {
    const consent = await knex("application_submission_consent_events")
      .where({ application_id: brooklynApplicationId })
      .first();
    expect(consent.purpose).toBe(CALL_KINDS.EVENT_CASTING);
    expect(consent.open_call_link_id).toBe(BROOKLYN_LINK_ID);
    expect(consent.consent_text_version).toBe("2026-09-01");

    const disclosure =
      typeof consent.disclosure_snapshot === "string"
        ? JSON.parse(consent.disclosure_snapshot)
        : consent.disclosure_snapshot;
    // Verbatim, not paraphrased: the applicant and the audit record hold the
    // same sentence, which is the entire point of the restatement.
    expect(disclosure.compensation).toContain("PAID");
    expect(disclosure.compensation).toContain(COMPENSATION_DETAILS);
    // The designers clause — an applicant who did not know strangers would see
    // their walk video did not consent to it.
    expect(disclosure.thirdPartyAccess).toContain("Designers see your name");
    expect(disclosure.acknowledgements.join(" ")).toContain(
      "does not guarantee selection, a booking, or payment",
    );
    // Representation-only reassurance must not appear on a casting.
    expect(JSON.stringify(disclosure)).not.toContain("monthly discovery limit");

    const compensationDisclosure =
      typeof consent.compensation_disclosure === "string"
        ? JSON.parse(consent.compensation_disclosure)
        : consent.compensation_disclosure;
    expect(compensationDisclosure.type).toBe(COMPENSATION_TYPES.PAID);
    expect(compensationDisclosure.details).toBe(COMPENSATION_DETAILS);
  });

  test("a second edition of the same organizer is a separate application", async () => {
    // The old blanket UNIQUE(profile_id, agency_id) said a model who walked
    // Brooklyn may never apply to Queens. Design A3 replaced it; this is that
    // rule in behaviour rather than in DDL.
    const response = await submitToCall(QUEENS_LINK_ID);
    expect(response.status).toBe(200);
    expect(response.body.id).not.toBe(brooklynApplicationId);

    const rows = await knex("applications").where({ profile_id: PROFILE_ID });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.open_call_link_id))).toEqual(
      new Set([BROOKLYN_LINK_ID, QUEENS_LINK_ID]),
    );
  });

  test("re-applying to the same call is refused", async () => {
    const response = await submitToCall(BROOKLYN_LINK_ID);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("application_already_submitted");
  });

  test("event submissions never draw on the monthly discovery allowance", async () => {
    // Two event submissions already landed above; both were claim-backed and
    // therefore quota-exempt. The exemption is recorded, not inferred.
    const requests = await knex("application_submission_requests")
      .where({ profile_id: PROFILE_ID, status: "completed" })
      .select("quota_exempt");
    expect(requests).toHaveLength(2);
    expect(requests.every((row) => Boolean(row.quota_exempt))).toBe(true);
  });

  test("a required walk video blocks the send at the server, with a stable code", async () => {
    const thirdLink = uuidv4();
    await knex("agency_open_call_links").insert(
      eventLinkRow({
        id: thirdLink,
        code: "fwbharlem0001",
        eventName: "Autumn 2026 Harlem",
      }),
    );
    const response = await submitToCall(thirdLink, { walkVideoUrl: null });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("submission_package_incomplete");
    expect(response.body.errors.map((error) => error.code)).toContain(
      "event_walk_video_required",
    );

    const missingDates = await submitToCall(thirdLink, { availability: null });
    expect(missingDates.status).toBe(400);
    expect(missingDates.body.errors.map((error) => error.code)).toContain(
      "event_availability_required",
    );
  });
});

describe("answering a slot offer", () => {
  let applicationId;

  beforeAll(async () => {
    applicationId = (
      await knex("applications")
        .where({ profile_id: PROFILE_ID, open_call_link_id: BROOKLYN_LINK_ID })
        .first("id")
    ).id;
  });

  async function setStatus(status) {
    await knex("applications").where({ id: applicationId }).update({
      status,
      status_changed_at: new Date("2026-08-10T09:00:00.000Z").toISOString(),
    });
  }

  test("cannot be answered before a slot is offered", async () => {
    await setStatus("shortlisted");
    const response = await request(app).post(
      `/api/talent/applications/${applicationId}/confirm`,
    );
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("slot_offer_not_open");
    expect(
      (await knex("applications").where({ id: applicationId }).first()).status,
    ).toBe("shortlisted");
  });

  test("confirming from `accepted` writes `confirmed`, moves the clock and tells the organizer", async () => {
    await setStatus("accepted");
    const before = await knex("applications").where({ id: applicationId }).first();

    const response = await request(app).post(
      `/api/talent/applications/${applicationId}/confirm`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(CONFIRMED_APPLICATION_STATUS);

    const after = await knex("applications").where({ id: applicationId }).first();
    expect(after.status).toBe(CONFIRMED_APPLICATION_STATUS);
    expect(new Date(after.status_changed_at).getTime()).toBeGreaterThan(
      new Date(before.status_changed_at).getTime(),
    );

    const activity = await knex("application_activities")
      .where({ application_id: applicationId, activity_type: "status_change" })
      .orderBy("created_at", "desc")
      .first();
    expect(activity.description).toBe("Talent confirmed the slot");

    expect(notifyAgencyEventSlotResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: ORGANIZER_ID,
        applicationId,
        confirmed: true,
        eventName: "Autumn 2026 Brooklyn",
      }),
    );
  });

  test("an answered offer cannot be answered again", async () => {
    const response = await request(app).post(
      `/api/talent/applications/${applicationId}/decline-slot`,
    );
    expect(response.status).toBe(409);
    expect(
      (await knex("applications").where({ id: applicationId }).first()).status,
    ).toBe(CONFIRMED_APPLICATION_STATUS);
  });

  test("declining writes `declined_by_talent` — never `withdrawn`", async () => {
    await setStatus("accepted");
    const response = await request(app).post(
      `/api/talent/applications/${applicationId}/decline-slot`,
    );
    expect(response.status).toBe(200);

    const after = await knex("applications").where({ id: applicationId }).first();
    expect(after.status).toBe(TALENT_DECLINED_APPLICATION_STATUS);
    // A withdrawal redacts the package and hides the row from an organizer who
    // still has to refill the slot. A decline must do neither.
    const pkg = await knex("talent_submission_packages")
      .where({ application_id: applicationId })
      .first();
    expect(pkg.redacted_at).toBeFalsy();
    expect(notifyAgencyEventSlotResponse).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: false }),
    );
  });

  test("a representation application has no slot to answer", async () => {
    const reprId = uuidv4();
    await knex("applications").insert({
      id: reprId,
      profile_id: PROFILE_ID,
      agency_id: ORGANIZER_ID,
      status: "accepted",
      call_purpose: "representation",
      status_changed_at: new Date().toISOString(),
    });
    const response = await request(app).post(
      `/api/talent/applications/${reprId}/confirm`,
    );
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("not_an_event_application");
    await knex("applications").where({ id: reprId }).delete();
  });

  test("another talent's application is not found, not forbidden", async () => {
    const response = await request(app).post(
      `/api/talent/applications/${uuidv4()}/confirm`,
    );
    expect(response.status).toBe(404);
  });
});

describe("draft schema v2", () => {
  const {
    DRAFT_SCHEMA_VERSION: CURRENT,
    normalizeDraftPayloadWithRepairs,
  } = require("../../src/domains/talent/services/application-drafts");
  const {
    isMaterialRepairWarning,
  } = require("../../src/domains/talent/services/application-drafts");

  async function normalize(payload) {
    return normalizeDraftPayloadWithRepairs(knex, {
      profileId: PROFILE_ID,
      agency: { id: ORGANIZER_ID, open_boards: "[]" },
      payload,
    });
  }

  test("a v1 draft upgrades to the event shape without losing anything it chose", async () => {
    const { payload, repairWarnings } = await normalize({
      schemaVersion: 1,
      mediaSetId: "current",
      note: "Written before event casting existed.",
      consent: true,
    });

    expect(payload.schemaVersion).toBe(CURRENT);
    expect(payload.note).toBe("Written before event casting existed.");
    expect(payload.consent).toBe(true);
    // Absence, not a rewrite: an old draft simply has no event fields.
    expect(payload.openCallLinkId).toBeNull();
    expect(payload.availability).toBeNull();
    expect(payload.walkVideoUrl).toBeNull();

    // The upgrade is announced, but it is not a changed selection — blocking on
    // it would make a version bump invalidate every draft in flight.
    expect(repairWarnings.map((warning) => warning.code)).toEqual([
      "schema_upgraded",
    ]);
    expect(repairWarnings.filter(isMaterialRepairWarning)).toEqual([]);
  });

  test("event fields survive a round trip when the call is still live", async () => {
    const { payload, repairWarnings } = await normalize({
      schemaVersion: CURRENT,
      mediaSetId: "current",
      openCallLinkId: BROOKLYN_LINK_ID,
      availability: AVAILABILITY,
      walkVideoUrl: WALK_VIDEO,
      measurementsConfirmed: true,
    });
    expect(payload.openCallLinkId).toBe(BROOKLYN_LINK_ID);
    expect(payload.availability).toEqual(AVAILABILITY);
    expect(payload.walkVideoUrl).toBe(WALK_VIDEO);
    expect(payload.measurementsConfirmed).toBe(true);
    expect(repairWarnings).toEqual([]);
  });

  test("a call that closed is dropped rather than silently submitted to", async () => {
    const closedLink = uuidv4();
    await knex("agency_open_call_links").insert(
      eventLinkRow({
        id: closedLink,
        code: "fwbclosed0001",
        eventName: "Spring 2026",
      }),
    );
    await knex("agency_open_call_links")
      .where({ id: closedLink })
      .update({ status: "revoked" });

    const { payload, repairWarnings } = await normalize({
      schemaVersion: CURRENT,
      mediaSetId: "current",
      openCallLinkId: closedLink,
    });
    expect(payload.openCallLinkId).toBeNull();
    expect(repairWarnings.map((warning) => warning.code)).toContain(
      "open_call_unavailable",
    );
  });

  test.each([
    ["a reversed range", { availability: { from: "2026-09-18", to: "2026-09-14" } }, "availability_invalid"],
    ["half a range", { availability: { from: "2026-09-14" } }, "availability_invalid"],
    ["a non-http link", { walkVideoUrl: "javascript:alert(1)" }, "walk_video_url_invalid"],
    ["a bare word", { walkVideoUrl: "my walk" }, "walk_video_url_invalid"],
  ])("%s is repaired away and reported", async (_label, patch, code) => {
    const { payload, repairWarnings } = await normalize({
      schemaVersion: CURRENT,
      mediaSetId: "current",
      openCallLinkId: BROOKLYN_LINK_ID,
      ...patch,
    });
    expect(repairWarnings.map((warning) => warning.code)).toContain(code);
    if (patch.availability) expect(payload.availability).toBeNull();
    if (patch.walkVideoUrl) expect(payload.walkVideoUrl).toBeNull();
  });
});

describe("the organizer can never record the applicant's answer", () => {
  test("both statuses are absent from the agency-writable list", () => {
    expect(WRITABLE_APPLICATION_STATUSES).not.toContain(
      CONFIRMED_APPLICATION_STATUS,
    );
    expect(WRITABLE_APPLICATION_STATUSES).not.toContain(
      TALENT_DECLINED_APPLICATION_STATUS,
    );
  });

  test.each([CONFIRMED_APPLICATION_STATUS, TALENT_DECLINED_APPLICATION_STATUS])(
    "the agency status PATCH rejects %s",
    async (status) => {
      const applicationId = (
        await knex("applications")
          .where({ profile_id: PROFILE_ID, open_call_link_id: QUEENS_LINK_ID })
          .first("id")
      ).id;
      const before = await knex("applications")
        .where({ id: applicationId })
        .first("status");

      const response = await request(app)
        .patch(`/api/agency/applications/${applicationId}/status`)
        .set("x-actor", "agency")
        .send({ status });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Unsupported application status");
      expect(
        (await knex("applications").where({ id: applicationId }).first()).status,
      ).toBe(before.status);
    },
  );
});
