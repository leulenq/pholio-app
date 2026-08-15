"use strict";

/**
 * Auto-close, Pass B: the slot offer nobody answered.
 *
 * An `accepted` representation application is an open conversation about a
 * contract and has no clock. An `accepted` event application is a slot in a
 * show that happens on a fixed date, and every hour it sits unanswered is an
 * hour the organizer cannot give it to somebody else. So event offers lapse,
 * and the record says what actually happened — `closed_no_response` with
 * `metadata.previousStatus = 'accepted'`, which is what lets the talent's
 * notification say "your slot offer expired" instead of the flatly untrue
 * "the organizer never responded".
 *
 * Pass A is also asserted here for the one thing event casting changed about
 * it: a per-call `review_window_days` overrides the agency default, because
 * thirty days of silence is a reasonable agency policy and an absurd wait for
 * a show three weeks out.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("event-autoclose");

const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const {
  resolveOfferWindowHours,
  runApplicationAutoClose,
} = require("../../src/shared/lib/application-auto-close");
const {
  AUTO_CLOSED_APPLICATION_STATUS,
} = require("../../src/shared/constants/application-status");
const {
  CALL_KINDS,
  COMPENSATION_TYPES,
  DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
} = require("../../src/shared/constants/event-casting");
const {
  applicationStatusCopy,
} = require("../../src/shared/services/notifications");

jest.mock("../../src/shared/services/notify-talent-application", () => ({
  notifyTalentForApplicationStatus: jest.fn().mockResolvedValue(undefined),
}));
const {
  notifyTalentForApplicationStatus,
} = require("../../src/shared/services/notify-talent-application");

const NOW = new Date("2026-08-20T12:00:00.000Z");
const ORGANIZER_ID = uuidv4();
const AGENCY_ID = uuidv4();
const PROFILE_ID = uuidv4();
const USER_ID = uuidv4();
// 48h offer window, 7-day review window — a call on a much shorter clock than
// the 30-day agency default.
const EVENT_LINK_ID = uuidv4();

/* ISO strings, never Date objects: under jest's VM realm knex's `instanceof
 * Date` check fails and stores "[object Object]", which reads back as an
 * unparseable anchor and makes every application look immortal. */
function hoursAgo(hours) {
  return new Date(NOW.getTime() - hours * 3600000).toISOString();
}
function daysAgo(days) {
  return hoursAgo(days * 24);
}

async function seed() {
  await knex("users").insert({
    id: USER_ID,
    email: `autoclose-${USER_ID}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: USER_ID,
    slug: `autoclose-${PROFILE_ID}`,
    first_name: "Nadia",
    last_name: "Okafor",
    city: "Brooklyn",
    height_cm: 178,
    date_of_birth: "1999-04-02",
    bio_raw: "",
    bio_curated: "",
  });
  await knex("agencies").insert([
    {
      id: ORGANIZER_ID,
      name: "Fashion Week Brooklyn",
      slug: `fwb-${ORGANIZER_ID}`,
      status: "ACTIVE",
      org_kind: "event_organizer",
      application_review_window_days: 30,
    },
    {
      id: AGENCY_ID,
      name: "Standing House",
      slug: `standing-${AGENCY_ID}`,
      status: "ACTIVE",
      org_kind: "agency",
      application_review_window_days: 30,
    },
  ]);
  await knex("agency_open_call_links").insert({
    id: EVENT_LINK_ID,
    agency_id: ORGANIZER_ID,
    code: "fwbautumn001",
    label: "Autumn 2026 casting",
    status: "active",
    call_kind: CALL_KINDS.EVENT_CASTING,
    compensation_type: COMPENSATION_TYPES.UNPAID,
    compensation_details: "Unpaid; lookbook images provided.",
    event_name: "Autumn 2026",
    event_starts_on: "2026-09-14",
    event_ends_on: "2026-09-18",
    review_window_days: 7,
    offer_response_window_hours: 48,
  });
}

/*
 * The partial uniques from design A3 are live on this schema: one event
 * application per (profile, link) and one representation application per
 * (profile, agency). Every fixture row therefore needs its own call — which is
 * itself the behaviour those indexes exist to produce.
 */
async function extraEventLink(overrides = {}) {
  const id = uuidv4();
  await knex("agency_open_call_links").insert({
    id,
    agency_id: ORGANIZER_ID,
    code: `fwb${id.replace(/-/g, "").slice(0, 9)}`,
    label: "Extra edition",
    status: "active",
    call_kind: CALL_KINDS.EVENT_CASTING,
    compensation_type: COMPENSATION_TYPES.UNPAID,
    event_name: "Autumn 2026",
    event_starts_on: "2026-09-14",
    event_ends_on: "2026-09-18",
    review_window_days: 7,
    offer_response_window_hours: 48,
    ...overrides,
  });
  return id;
}

async function extraAgency() {
  const id = uuidv4();
  await knex("agencies").insert({
    id,
    name: `Standing House ${id.slice(0, 6)}`,
    slug: `standing-${id}`,
    status: "ACTIVE",
    org_kind: "agency",
    application_review_window_days: 30,
  });
  return id;
}

async function insertApplication({
  status,
  anchor,
  agencyId = ORGANIZER_ID,
  linkId = EVENT_LINK_ID,
  purpose = CALL_KINDS.EVENT_CASTING,
}) {
  const id = uuidv4();
  await knex("applications").insert({
    id,
    profile_id: PROFILE_ID,
    agency_id: agencyId,
    open_call_link_id: linkId,
    call_purpose: purpose,
    status,
    status_changed_at: anchor,
    created_at: anchor,
    updated_at: anchor,
  });
  return id;
}

async function statusOf(id) {
  return (await knex("applications").where({ id }).first("status")).status;
}

async function autoCloseActivity(id) {
  const row = await knex("application_activities")
    .where({ application_id: id, activity_type: "auto_closed" })
    .orderBy("created_at", "desc")
    .first();
  if (!row) return null;
  return {
    ...row,
    metadata:
      typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
  };
}

beforeAll(async () => {
  await migrate(knex);
  await seed();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

beforeEach(async () => {
  await knex("application_activities").delete();
  await knex("applications").delete();
  notifyTalentForApplicationStatus.mockClear();
});

describe("resolveOfferWindowHours", () => {
  test("null reads as the default, not as 'disabled'", () => {
    expect(resolveOfferWindowHours(null)).toBe(
      DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
    );
    expect(resolveOfferWindowHours(undefined)).toBe(
      DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
    );
    expect(resolveOfferWindowHours("nonsense")).toBe(
      DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
    );
  });

  test("zero is the organizer's opt-out", () => {
    expect(resolveOfferWindowHours(0)).toBe(0);
  });
});

describe("Pass B — unanswered slot offers", () => {
  test("closes an event offer past the call's response window", async () => {
    const stale = await insertApplication({
      status: "accepted",
      anchor: hoursAgo(49),
    });
    const fresh = await insertApplication({
      status: "accepted",
      anchor: hoursAgo(47),
      linkId: await extraEventLink(),
    });

    const result = await runApplicationAutoClose(knex, { now: NOW });

    expect(await statusOf(stale)).toBe(AUTO_CLOSED_APPLICATION_STATUS);
    expect(await statusOf(fresh)).toBe("accepted");
    expect(result.closed).toBe(1);

    const activity = await autoCloseActivity(stale);
    // The distinguishing fact. Without it, an expired offer and an untriaged
    // pool are the same row, and the talent gets the wrong sentence.
    expect(activity.metadata.previousStatus).toBe("accepted");
    expect(activity.metadata.offerResponseWindowHours).toBe(48);
    expect(activity.metadata.openCallLinkId).toBe(EVENT_LINK_ID);
    expect(activity.description).toContain("slot offer expired");
    expect(activity.user_id).toBeNull();
  });

  test("passes previousStatus to the notification so the copy can branch", async () => {
    await insertApplication({ status: "accepted", anchor: hoursAgo(72) });
    await runApplicationAutoClose(knex, { now: NOW });

    expect(notifyTalentForApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        newStatus: AUTO_CLOSED_APPLICATION_STATUS,
        previousStatus: "accepted",
        application: expect.objectContaining({
          call_purpose: CALL_KINDS.EVENT_CASTING,
        }),
      }),
    );
  });

  test("leaves a representation offer alone forever", async () => {
    // No clock on a contract conversation — the design says so explicitly, and
    // closing one would tell a model an agency withdrew an offer it did not.
    const repr = await insertApplication({
      status: "accepted",
      anchor: daysAgo(400),
      agencyId: AGENCY_ID,
      linkId: null,
      purpose: "representation",
    });
    await runApplicationAutoClose(knex, { now: NOW });
    expect(await statusOf(repr)).toBe("accepted");
  });

  test("is idempotent — a second run closes nothing", async () => {
    const stale = await insertApplication({
      status: "accepted",
      anchor: hoursAgo(96),
    });
    const first = await runApplicationAutoClose(knex, { now: NOW });
    expect(first.closed).toBe(1);

    const second = await runApplicationAutoClose(knex, { now: NOW });
    expect(second.closed).toBe(0);
    expect(await statusOf(stale)).toBe(AUTO_CLOSED_APPLICATION_STATUS);
    expect(
      await knex("application_activities")
        .where({ application_id: stale, activity_type: "auto_closed" })
        .count({ total: "*" })
        .first(),
    ).toEqual(expect.objectContaining({ total: 1 }));
  });

  test("pages past representation offers without looping", async () => {
    // The purpose filter runs in JS, so a page made entirely of rows that stay
    // put still has to advance the offset or the loop never terminates.
    for (let i = 0; i < 5; i += 1) {
      await insertApplication({
        status: "accepted",
        anchor: daysAgo(90),
        agencyId: await extraAgency(),
        linkId: null,
        purpose: "representation",
      });
    }
    const expiring = await insertApplication({
      status: "accepted",
      anchor: hoursAgo(96),
    });

    const result = await runApplicationAutoClose(knex, { now: NOW, batchSize: 2 });
    expect(result.closed).toBe(1);
    expect(await statusOf(expiring)).toBe(AUTO_CLOSED_APPLICATION_STATUS);
  });
});

describe("Pass A — the call's review window overrides the agency default", () => {
  test("an event application closes on the call's 7 days, not the agency's 30", async () => {
    const eventRow = await insertApplication({
      status: "pending",
      anchor: daysAgo(8),
    });
    const agencyRow = await insertApplication({
      status: "pending",
      anchor: daysAgo(8),
      agencyId: AGENCY_ID,
      linkId: null,
      purpose: "representation",
    });

    await runApplicationAutoClose(knex, { now: NOW });

    expect(await statusOf(eventRow)).toBe(AUTO_CLOSED_APPLICATION_STATUS);
    expect(await statusOf(agencyRow)).toBe("pending");

    const activity = await autoCloseActivity(eventRow);
    expect(activity.metadata.reviewWindowDays).toBe(7);
    expect(activity.metadata.previousStatus).toBe("pending");
    expect(activity.description).toContain("review window lapsed");
  });
});

describe("notification copy branches on what actually happened", () => {
  test("an expired offer and an untriaged pool read differently", () => {
    const expiredOffer = applicationStatusCopy(
      AUTO_CLOSED_APPLICATION_STATUS,
      "Fashion Week Brooklyn",
      { purpose: CALL_KINDS.EVENT_CASTING, previousStatus: "accepted" },
    );
    const neverTriaged = applicationStatusCopy(
      AUTO_CLOSED_APPLICATION_STATUS,
      "Fashion Week Brooklyn",
      { purpose: CALL_KINDS.EVENT_CASTING, previousStatus: "pending" },
    );

    expect(expiredOffer.title).toBe("Slot offer expired");
    expect(expiredOffer.body).toContain("released");
    expect(neverTriaged.title).not.toBe(expiredOffer.title);
    expect(neverTriaged.body).toContain("Treat it as a pass");
  });

  test("the representation copy is untouched by the purpose option", () => {
    const withoutOptions = applicationStatusCopy(
      AUTO_CLOSED_APPLICATION_STATUS,
      "Standing House",
    );
    const explicitRepresentation = applicationStatusCopy(
      AUTO_CLOSED_APPLICATION_STATUS,
      "Standing House",
      { purpose: "representation", previousStatus: "accepted" },
    );
    expect(explicitRepresentation).toEqual(withoutOptions);
    expect(withoutOptions.title).toBe("Application closed — no response");
  });

  test("an organizer's `accepted` is a slot, not an offer of representation", () => {
    const event = applicationStatusCopy("accepted", "Fashion Week Brooklyn", {
      purpose: CALL_KINDS.EVENT_CASTING,
    });
    expect(event.title).toBe("You've been offered a slot");
    expect(event.body).not.toContain("representation");
    expect(applicationStatusCopy("accepted", "Standing House").title).toBe(
      "Representation offer",
    );
  });
});
