"use strict";

/**
 * Event calls (design A2 / §h Lane A).
 *
 * Two things are load-bearing here and everything else follows from them:
 *
 *  1. An event cast cannot exist without stating what it pays. The consent an
 *     applicant signs restates that sentence verbatim, so a blank field would
 *     put a blank into a legal record.
 *  2. Everything the event fields add is additive. Every link in the database
 *     today is a representation call and must keep serializing exactly as it
 *     did — the API surface grew, the existing shape did not move.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("event-call-brief");

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const SESSION_SECRET = require("../../src/config").sessionSecret;
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  ORG_KINDS,
  MAX_LINKS_BY_ORG_KIND,
} = require("../../src/shared/constants/event-casting");
const {
  briefDTO,
  eventCallColumns,
  eventCallDTO,
  eventCallFromLink,
  normalizeBrief,
  normalizeEventCall,
} = require("../../src/domains/agency/services/open-call-brief");

const VALID_BRIEF = {
  who: "Runway models for the autumn edition, New York.",
  what: "Four digitals: close-up, profile, waist-up and full length.",
  eligibility: "",
  nextSteps: "We shortlist in the first week of August and offer slots by the 15th.",
  deadline: "",
  ongoing: true,
};

function validEventCall(overrides = {}) {
  return {
    callKind: CALL_KINDS.EVENT_CASTING,
    event: {
      name: "Fashion Week Brooklyn — Autumn 2026",
      startsOn: "2026-09-14",
      endsOn: "2026-09-18",
      location: "Brooklyn Navy Yard",
    },
    compensation: {
      type: COMPENSATION_TYPES.PAID,
      details: "$350 per show day, paid within 30 days.",
    },
    intake: { walkVideo: true, availability: true, measurements: false },
    reviewWindowDays: 21,
    offerResponseWindowHours: 48,
    ...overrides,
  };
}

/* ---------------------------------------------------------------- unit --- */

describe("normalizeEventCall", () => {
  test("a representation call is the default and carries nothing about events", () => {
    const call = normalizeEventCall({});
    expect(call).toEqual({
      callKind: CALL_KINDS.REPRESENTATION,
      event: null,
      compensation: null,
      intake: { walkVideo: false, availability: false, measurements: false },
      reviewWindowDays: null,
      offerResponseWindowHours: 72,
    });
  });

  test("event material on a representation call is cleared, not carried", () => {
    const call = normalizeEventCall({
      callKind: CALL_KINDS.REPRESENTATION,
      event: { name: "Left over from a previous edit", startsOn: "2026-09-14" },
      compensation: { type: COMPENSATION_TYPES.PAID, details: "$350" },
      intake: { walkVideo: true },
    });
    expect(call.event).toBeNull();
    expect(call.compensation).toBeNull();
    expect(call.intake.walkVideo).toBe(false);
  });

  test("rejects a kind that is neither", () => {
    expect(() => normalizeEventCall({ callKind: "audition" })).toThrow(
      expect.objectContaining({ code: "call_kind_invalid", status: 400 }),
    );
  });

  test("accepts a complete event call", () => {
    const call = normalizeEventCall(validEventCall());
    expect(call.callKind).toBe(CALL_KINDS.EVENT_CASTING);
    expect(call.event).toEqual({
      name: "Fashion Week Brooklyn — Autumn 2026",
      startsOn: "2026-09-14",
      endsOn: "2026-09-18",
      location: "Brooklyn Navy Yard",
    });
    expect(call.compensation).toEqual({
      type: "paid",
      details: "$350 per show day, paid within 30 days.",
    });
    expect(call.intake).toEqual({
      walkVideo: true,
      availability: true,
      measurements: false,
    });
    expect(call.reviewWindowDays).toBe(21);
    expect(call.offerResponseWindowHours).toBe(48);
  });

  describe("compensation is the field that cannot be skipped", () => {
    test("an event call with no compensation is refused", () => {
      expect(() =>
        normalizeEventCall(validEventCall({ compensation: undefined })),
      ).toThrow(
        expect.objectContaining({
          code: "compensation_required",
          field: "compensation.type",
          status: 400,
        }),
      );
      expect(() =>
        normalizeEventCall(validEventCall({ compensation: { details: "$350" } })),
      ).toThrow(expect.objectContaining({ code: "compensation_required" }));
    });

    test("only the three stated kinds are compensation", () => {
      expect(() =>
        normalizeEventCall(
          validEventCall({ compensation: { type: "tfp", details: "Prints" } }),
        ),
      ).toThrow(expect.objectContaining({ code: "compensation_type_invalid" }));
    });

    test("paid and stipend must say what they pay", () => {
      for (const type of [COMPENSATION_TYPES.PAID, COMPENSATION_TYPES.STIPEND]) {
        expect(() =>
          normalizeEventCall(validEventCall({ compensation: { type, details: "" } })),
        ).toThrow(
          expect.objectContaining({
            code: "compensation_details_required",
            field: "compensation.details",
          }),
        );
      }
    });

    test("unpaid is a complete answer on its own", () => {
      const call = normalizeEventCall(
        validEventCall({ compensation: { type: COMPENSATION_TYPES.UNPAID } }),
      );
      expect(call.compensation).toEqual({ type: "unpaid", details: null });
    });

    test("caps the detail so it stays a sentence", () => {
      expect(() =>
        normalizeEventCall(
          validEventCall({
            compensation: { type: COMPENSATION_TYPES.PAID, details: "x".repeat(601) },
          }),
        ),
      ).toThrow(expect.objectContaining({ code: "compensation_details_too_long" }));
    });
  });

  describe("the event itself", () => {
    test("must be named", () => {
      expect(() =>
        normalizeEventCall(validEventCall({ event: { startsOn: "2026-09-14" } })),
      ).toThrow(expect.objectContaining({ code: "event_name_required" }));
    });

    test("must say when it runs", () => {
      expect(() =>
        normalizeEventCall(validEventCall({ event: { name: "Fashion Week" } })),
      ).toThrow(expect.objectContaining({ code: "event_dates_required" }));
    });

    test("a one-day event ends the day it starts", () => {
      const call = normalizeEventCall(
        validEventCall({ event: { name: "One Night Only", startsOn: "2026-09-14" } }),
      );
      expect(call.event.startsOn).toBe("2026-09-14");
      expect(call.event.endsOn).toBe("2026-09-14");
      expect(call.event.location).toBeNull();
    });

    test("rejects dates that are not dates, and an event that ends first", () => {
      expect(() =>
        normalizeEventCall(
          validEventCall({ event: { name: "Fashion Week", startsOn: "14/09/2026" } }),
        ),
      ).toThrow(expect.objectContaining({ code: "event_dates_invalid" }));
      expect(() =>
        normalizeEventCall(
          validEventCall({
            event: { name: "Fashion Week", startsOn: "2026-09-18", endsOn: "2026-09-14" },
          }),
        ),
      ).toThrow(expect.objectContaining({ code: "event_dates_reversed" }));
    });

    test("caps the name and the location", () => {
      expect(() =>
        normalizeEventCall(
          validEventCall({ event: { name: "x".repeat(181), startsOn: "2026-09-14" } }),
        ),
      ).toThrow(expect.objectContaining({ code: "event_name_too_long" }));
      expect(() =>
        normalizeEventCall(
          validEventCall({
            event: { name: "Fashion Week", startsOn: "2026-09-14", location: "x".repeat(201) },
          }),
        ),
      ).toThrow(expect.objectContaining({ code: "event_location_too_long" }));
    });
  });

  describe("the two clocks", () => {
    test("the offer window defaults to 72 hours", () => {
      expect(
        normalizeEventCall(validEventCall({ offerResponseWindowHours: undefined }))
          .offerResponseWindowHours,
      ).toBe(72);
    });

    test("refuses a window that is not a whole number in range", () => {
      for (const value of [0, 121, 2.5, "soon"]) {
        expect(() =>
          normalizeEventCall(validEventCall({ reviewWindowDays: value })),
        ).toThrow(
          expect.objectContaining({
            code: "call_window_invalid",
            field: "reviewWindowDays",
          }),
        );
      }
      expect(() =>
        normalizeEventCall(validEventCall({ offerResponseWindowHours: 337 })),
      ).toThrow(
        expect.objectContaining({
          code: "call_window_invalid",
          field: "offerResponseWindowHours",
        }),
      );
    });

    test("an empty review window means inherit the agency default", () => {
      expect(
        normalizeEventCall(validEventCall({ reviewWindowDays: "" })).reviewWindowDays,
      ).toBeNull();
    });
  });

  test("a normalized call round-trips through storage columns", () => {
    const call = normalizeEventCall(validEventCall());
    const columns = eventCallColumns(call);
    expect(columns).toEqual({
      call_kind: "event_casting",
      compensation_type: "paid",
      compensation_details: "$350 per show day, paid within 30 days.",
      event_name: "Fashion Week Brooklyn — Autumn 2026",
      event_starts_on: "2026-09-14",
      event_ends_on: "2026-09-18",
      event_location: "Brooklyn Navy Yard",
      requires_walk_video: true,
      requires_availability: true,
      requires_measurements: false,
      review_window_days: 21,
      offer_response_window_hours: 48,
    });
    expect(normalizeEventCall(eventCallFromLink(columns))).toEqual(call);
  });
});

describe("eventCallDTO is additive", () => {
  test("a link that predates event casting reads as a representation call", () => {
    expect(eventCallDTO({})).toEqual({
      callKind: CALL_KINDS.REPRESENTATION,
      event: null,
      compensation: null,
      intake: { walkVideo: false, availability: false, measurements: false },
      reviewWindowDays: null,
      offerResponseWindowHours: 72,
    });
  });

  test("the brief DTO is untouched by the event fields", () => {
    const brief = normalizeBrief(
      { ...VALID_BRIEF, eligibility: "18 and over." },
      "2026-08-15",
    );
    const stored = {
      brief_completed_at: "2026-08-15T00:00:00.000Z",
      brief_who: brief.who,
      brief_what: brief.what,
      brief_eligibility: brief.eligibility,
      brief_next_steps: brief.nextSteps,
      brief_deadline: brief.deadline,
      brief_ongoing: brief.ongoing,
      ...eventCallColumns(normalizeEventCall(validEventCall())),
    };
    expect(Object.keys(briefDTO(stored)).sort()).toEqual([
      "deadline",
      "eligibility",
      "nextSteps",
      "ongoing",
      "what",
      "who",
    ]);
  });

  // Postgres hands `date` columns back as Date objects, SQLite as strings.
  test("reads Date-typed event dates the same as string ones", () => {
    const dto = eventCallDTO({
      call_kind: "event_casting",
      event_starts_on: new Date("2026-09-14T00:00:00.000Z"),
      event_ends_on: new Date("2026-09-18T00:00:00.000Z"),
    });
    expect(dto.event.startsOn).toBe("2026-09-14");
    expect(dto.event.endsOn).toBe("2026-09-18");
  });
});

/* ---------------------------------------------------------------- http --- */

describe("open call link API", () => {
  const agencyUserId = uuidv4();
  const agencyId = agencyUserId;
  const membershipId = uuidv4();
  let asAgency;

  async function agentWithSession(userId) {
    const sid = uuidv4();
    await knex("sessions").insert({
      sid,
      sess: JSON.stringify({
        cookie: { originalMaxAge: null, expires: null, secure: false, httpOnly: true, path: "/" },
        userId,
        memberUserId: userId,
        role: "AGENCY",
        agencyId,
        agencyMembershipId: membershipId,
        agencyMembershipRole: "OWNER",
        agencyOnboardingCompletedAt: new Date().toISOString(),
      }),
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const encoded = encodeURIComponent(`s:${cookieSig.sign(sid, SESSION_SECRET)}`);
    return (req) =>
      req
        .set("Cookie", `connect.sid=${encoded}`)
        // Dashboard writes carry the same-origin marker the SPA's fetch wrapper
        // sets; without it the mutation guard answers before the route does.
        .set("x-pholio-request", "same-origin")
        .set("Origin", "http://localhost:3000");
  }

  beforeAll(async () => {
    await migrate(knex);
    await knex("users").insert({
      id: agencyUserId,
      email: `event-call-${agencyUserId}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    });
    await knex("agencies").insert({
      id: agencyId,
      name: "Fashion Week Brooklyn",
      slug: `fwb-${agencyId}`,
      status: "ACTIVE",
      onboarding_completed_at: new Date().toISOString(),
    });
    await knex("agency_memberships")
      .insert({
        id: membershipId,
        agency_id: agencyId,
        user_id: agencyUserId,
        membership_role: "OWNER",
        status: "ACTIVE",
      })
      .onConflict(["agency_id", "user_id"])
      .merge({ id: membershipId, membership_role: "OWNER", status: "ACTIVE" });
    asAgency = await agentWithSession(agencyUserId);
  }, 60000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  afterEach(async () => {
    await knex("agency_open_call_links").delete();
    await knex("agencies").where({ id: agencyId }).update({ org_kind: ORG_KINDS.AGENCY });
  });

  function post(body) {
    return asAgency(request(app).post("/api/agency/open-call/links")).send(body);
  }

  test("a representation link is created exactly as before, and reports its kind", async () => {
    const res = await post({ label: "Website", brief: VALID_BRIEF });
    expect(res.status).toBe(200);
    expect(res.body.data.callKind).toBe(CALL_KINDS.REPRESENTATION);
    expect(res.body.data.event).toBeNull();
    expect(res.body.data.compensation).toBeNull();
    expect(res.body.data.brief.who).toBe(VALID_BRIEF.who);
  });

  test("an event call is refused until it states what it pays", async () => {
    const res = await post({
      label: "FWB autumn",
      brief: VALID_BRIEF,
      ...validEventCall({ compensation: undefined }),
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: "compensation_required",
      field: "compensation.type",
    });
    expect(await knex("agency_open_call_links").count({ n: "*" }).first()).toMatchObject({
      n: 0,
    });
  });

  test("an event call is refused until it names the event and its dates", async () => {
    const res = await post({
      label: "FWB autumn",
      brief: VALID_BRIEF,
      ...validEventCall({ event: { location: "Brooklyn" } }),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("event_name_required");
  });

  test("a complete event call is stored and serialized", async () => {
    const res = await post({ label: "FWB autumn", brief: VALID_BRIEF, ...validEventCall() });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      callKind: CALL_KINDS.EVENT_CASTING,
      event: {
        name: "Fashion Week Brooklyn — Autumn 2026",
        startsOn: "2026-09-14",
        endsOn: "2026-09-18",
        location: "Brooklyn Navy Yard",
      },
      compensation: { type: "paid", details: "$350 per show day, paid within 30 days." },
      intake: { walkVideo: true, availability: true, measurements: false },
      reviewWindowDays: 21,
      offerResponseWindowHours: 48,
    });

    const row = await knex("agency_open_call_links").where({ id: res.body.data.id }).first();
    expect(row.call_kind).toBe("event_casting");
    expect(row.compensation_type).toBe("paid");
  });

  describe("PATCH", () => {
    let linkId;

    beforeEach(async () => {
      const res = await post({ label: "FWB autumn", brief: VALID_BRIEF, ...validEventCall() });
      linkId = res.body.data.id;
    });

    function patch(body) {
      return asAgency(request(app).patch(`/api/agency/open-call/links/${linkId}`)).send(body);
    }

    test("correcting one field leaves the rest of the call standing", async () => {
      const res = await patch({
        compensation: { type: COMPENSATION_TYPES.STIPEND, details: "$150 flat, travel covered." },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.compensation).toEqual({
        type: "stipend",
        details: "$150 flat, travel covered.",
      });
      expect(res.body.data.event.name).toBe("Fashion Week Brooklyn — Autumn 2026");
      expect(res.body.data.intake.walkVideo).toBe(true);
    });

    test("an edit cannot remove the compensation an applicant consented to", async () => {
      const res = await patch({ compensation: { type: "" } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("compensation_required");
      const row = await knex("agency_open_call_links").where({ id: linkId }).first();
      expect(row.compensation_type).toBe("paid");
    });

    test("switching a call back to representation clears the event", async () => {
      const res = await patch({ callKind: CALL_KINDS.REPRESENTATION });
      expect(res.status).toBe(200);
      expect(res.body.data.callKind).toBe(CALL_KINDS.REPRESENTATION);
      expect(res.body.data.event).toBeNull();
      const row = await knex("agency_open_call_links").where({ id: linkId }).first();
      expect(row.event_name).toBeNull();
      expect(row.compensation_type).toBeNull();
    });

    test("a patch touching nothing is still refused", async () => {
      const res = await patch({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("no_changes");
    });
  });

  /*
   * What the arrival page is handed. The public endpoint is the only place the
   * event terms reach an applicant before they consent, so its payload is
   * asserted here rather than left to the client to discover at runtime.
   */
  describe("GET /api/public/open-call/:code", () => {
    async function publicCall(body) {
      const created = await post(body);
      expect(created.status).toBe(200);
      const code = created.body.data.code;
      const res = await request(app).get(`/api/public/open-call/${code}`);
      expect(res.status).toBe(200);
      return res.body.data;
    }

    test("a representation call keeps the payload it always had, plus its kind", async () => {
      const data = await publicCall({ label: "Website", brief: VALID_BRIEF });
      expect(data).toMatchObject({
        valid: true,
        closed: false,
        alreadyApplied: false,
        authenticated: false,
        callKind: CALL_KINDS.REPRESENTATION,
        event: null,
        compensation: null,
      });
      expect(data.agency.name).toBe("Fashion Week Brooklyn");
      expect(data.brief.who).toBe(VALID_BRIEF.who);
    });

    test("an event call publishes the event, the pay and what the intake asks for", async () => {
      const data = await publicCall({
        label: "FWB autumn",
        brief: VALID_BRIEF,
        ...validEventCall(),
      });
      expect(data).toMatchObject({
        valid: true,
        callKind: CALL_KINDS.EVENT_CASTING,
        event: {
          name: "Fashion Week Brooklyn — Autumn 2026",
          startsOn: "2026-09-14",
          endsOn: "2026-09-18",
          location: "Brooklyn Navy Yard",
        },
        compensation: { type: "paid", details: "$350 per show day, paid within 30 days." },
        intake: { walkVideo: true, availability: true, measurements: false },
      });
      // The brief is still the brief — the event fields sit beside it.
      expect(data.brief.nextSteps).toBe(VALID_BRIEF.nextSteps);
    });

    test("an unknown code still confirms nothing", async () => {
      const res = await request(app).get("/api/public/open-call/notarealcode");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ valid: false });
    });
  });

  describe("link ceiling by org kind (R6)", () => {
    async function fillLinks(count) {
      const rows = [];
      for (let i = 0; i < count; i += 1) {
        rows.push({
          id: uuidv4(),
          agency_id: agencyId,
          code: `filler${String(i).padStart(6, "0")}`,
          label: `Filler ${i}`,
          status: "active",
          created_by_user_id: agencyUserId,
        });
      }
      await knex("agency_open_call_links").insert(rows);
    }

    test("an agency stops at the agency ceiling", async () => {
      await fillLinks(MAX_LINKS_BY_ORG_KIND[ORG_KINDS.AGENCY]);
      const res = await post({ label: "One too many", brief: VALID_BRIEF });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("link_limit_reached");
    });

    test("an event organizer runs a call per city per season and does not", async () => {
      await knex("agencies")
        .where({ id: agencyId })
        .update({ org_kind: ORG_KINDS.EVENT_ORGANIZER });
      await fillLinks(MAX_LINKS_BY_ORG_KIND[ORG_KINDS.AGENCY]);
      const res = await post({ label: "Queens edition", brief: VALID_BRIEF });
      expect(res.status).toBe(200);
    });

    test("the organizer ceiling is still a ceiling", async () => {
      await knex("agencies")
        .where({ id: agencyId })
        .update({ org_kind: ORG_KINDS.EVENT_ORGANIZER });
      await fillLinks(MAX_LINKS_BY_ORG_KIND[ORG_KINDS.EVENT_ORGANIZER]);
      const res = await post({ label: "One too many", brief: VALID_BRIEF });
      expect(res.status).toBe(409);
    });
  });
});
