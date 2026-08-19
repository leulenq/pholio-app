"use strict";

/**
 * The designer pick-list surface end to end (design §(d), §(e)).
 *
 * The load-bearing assertion in this file is the field allowlist. A designer is
 * a third party the applicant was told about in the event consent copy —
 * "Designers see your name, digitals, height, measurements, availability and
 * walk video ... They cannot see your email, phone, socials or date of birth" —
 * so a leak here is a broken disclosure, not a bug.
 *
 * The fixture package is therefore deliberately POISONED: it carries an email,
 * a phone number, a date of birth, social handles, a portfolio slug and a comp
 * card, all in the places a careless spread would pick them up from. Every one
 * of them is enumerated below and asserted absent.
 */

const crypto = require("crypto");
const express = require("express");
const request = require("supertest");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("pick-share-page");
const db = require("../../src/shared/db/knex");

const {
  buildPickListTokenMaterial,
} = require("../../src/domains/events/services/pick-list-tokens");
const pickShareRoutes = require("../../src/domains/events/routes/pick-share");

const uuid = () => crypto.randomUUID();
const DAY_MS = 24 * 60 * 60 * 1000;

const app = express();
app.use(express.json());
app.use(pickShareRoutes);

const agencyId = uuid();
const linkId = uuid();

const adult = {
  userId: uuid(),
  profileId: uuid(),
  applicationId: uuid(),
  packageId: uuid(),
};
const minor = {
  userId: uuid(),
  profileId: uuid(),
  applicationId: uuid(),
  packageId: uuid(),
};
const redacted = {
  userId: uuid(),
  profileId: uuid(),
  applicationId: uuid(),
  packageId: uuid(),
};

/** Everything a designer must never receive, by the name it travels under. */
const FORBIDDEN_VALUES = Object.freeze({
  email: "ada@example.test",
  phone: "+1 555 0100",
  guardianEmail: "guardian@example.test",
  dateOfBirth: "1999-04-02",
  instagramHandle: "@ada.walks",
  instagramUrl: "https://instagram.com/ada.walks",
  portfolioSlug: "ada-lovelace-nyc",
  compCardSeed: "compcard-seed-9f21",
  bio: "Ada is represented in Milan and reachable on ada@example.test.",
  weight: "58",
});

function submissionPayload({ profileId, extra = {} }) {
  return {
    submittedAt: "2026-08-01T09:00:00.000Z",
    // A snapshot poisoned with every sensitive field a careless builder could
    // pick up. `buildEventDesignerDTO` is an allowlist, so none of it survives.
    profile: {
      id: profileId,
      slug: FORBIDDEN_VALUES.portfolioSlug,
      first_name: "Ada",
      last_name: "Lovelace",
      city: "Brooklyn",
      gender: "female",
      stats_track: "womenswear",
      height_cm: 178,
      bust_cm: 84,
      waist_cm: 61,
      hips_cm: 89,
      inseam_cm: 84,
      shoe_size: "40",
      dress_size: "34",
      hair_color: "auburn",
      eye_color: "green",
      date_of_birth: FORBIDDEN_VALUES.dateOfBirth,
      age: 27,
      age_band: "18_or_older",
      phone: FORBIDDEN_VALUES.phone,
      email: FORBIDDEN_VALUES.email,
      guardian_email: FORBIDDEN_VALUES.guardianEmail,
      weight_kg: FORBIDDEN_VALUES.weight,
      bio_curated: FORBIDDEN_VALUES.bio,
      social: [
        {
          platform: "instagram",
          handle: FORBIDDEN_VALUES.instagramHandle,
          url: FORBIDDEN_VALUES.instagramUrl,
          verified: true,
        },
      ],
    },
    contact: {
      email: FORBIDDEN_VALUES.email,
      phone: FORBIDDEN_VALUES.phone,
    },
    compCard: {
      id: "cc-1",
      name: "Ada — SS27",
      seed: FORBIDDEN_VALUES.compCardSeed,
    },
    digitalSlotPicks: { headshot: "img-2" },
    images: [
      { id: "img-1", public_url: "/uploads/ada-1.jpg", sort: 1 },
      { id: "img-2", public_url: "/uploads/ada-2.jpg", sort: 2 },
    ],
    availability: { from: "2026-09-14", to: "2026-09-20" },
    walkVideoUrl: "https://vimeo.com/999888777",
    ...extra,
  };
}

async function insertTalent({ userId, profileId, slug, firstName }) {
  await db("users").insert({
    id: userId,
    email: `${slug}@example.test`,
    role: "TALENT",
  });
  await db("profiles").insert({
    id: profileId,
    user_id: userId,
    slug,
    first_name: firstName,
    city: "Brooklyn",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
  });
}

async function createPickList({ status = "open", items = [] } = {}) {
  const id = uuid();
  const material = buildPickListTokenMaterial();
  await db("event_pick_lists").insert({
    id,
    agency_id: agencyId,
    open_call_link_id: linkId,
    designer_name: "Studio Aalto",
    label: "Look 1–12",
    organizer_note: "Six walkers for the opening block, please.",
    slots_requested: 6,
    status,
    token_hash: material.tokenHash,
    expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
  });
  if (items.length > 0) {
    await db("event_pick_list_items").insert(
      items.map((applicationId, index) => ({
        id: uuid(),
        pick_list_id: id,
        application_id: applicationId,
        sort: index,
      })),
    );
  }
  return { id, rawToken: material.rawToken };
}

beforeAll(async () => {
  await migrate(db);

  await db("agencies").insert({
    id: agencyId,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  await db("agency_open_call_links").insert({
    id: linkId,
    agency_id: agencyId,
    code: "fwbss27cast",
    label: "SS27 open casting",
    call_kind: "event_casting",
    event_name: "Fashion Week Brooklyn SS27",
    event_starts_on: "2026-09-14",
    event_ends_on: "2026-09-20",
    event_location: "Greenpoint Terminal",
    compensation_type: "stipend",
    compensation_details: "$150 per show plus travel.",
  });

  await insertTalent({ ...adult, slug: "ada-lovelace-nyc", firstName: "Ada" });
  await insertTalent({ ...minor, slug: "min-or-nyc", firstName: "Min" });
  await insertTalent({ ...redacted, slug: "red-acted-nyc", firstName: "Red" });

  await db("applications").insert([
    {
      id: adult.applicationId,
      profile_id: adult.profileId,
      agency_id: agencyId,
      status: "shortlisted",
      open_call_link_id: linkId,
      call_purpose: "event_casting",
      minor_at_submission: false,
    },
    {
      id: minor.applicationId,
      profile_id: minor.profileId,
      agency_id: agencyId,
      status: "shortlisted",
      open_call_link_id: linkId,
      call_purpose: "event_casting",
      minor_at_submission: true,
    },
    {
      id: redacted.applicationId,
      profile_id: redacted.profileId,
      agency_id: agencyId,
      status: "shortlisted",
      open_call_link_id: linkId,
      call_purpose: "event_casting",
      minor_at_submission: false,
    },
  ]);

  await db("talent_submission_packages").insert([
    {
      id: adult.packageId,
      user_id: adult.userId,
      profile_id: adult.profileId,
      application_id: adult.applicationId,
      payload: JSON.stringify(submissionPayload({ profileId: adult.profileId })),
    },
    {
      id: minor.packageId,
      user_id: minor.userId,
      profile_id: minor.profileId,
      application_id: minor.applicationId,
      payload: JSON.stringify(submissionPayload({ profileId: minor.profileId })),
    },
    {
      id: redacted.packageId,
      user_id: redacted.userId,
      profile_id: redacted.profileId,
      application_id: redacted.applicationId,
      payload: JSON.stringify({ redacted: true, reason: "guardian_revoked" }),
      revoked_at: new Date().toISOString(),
      redacted_at: new Date().toISOString(),
      redaction_reason: "guardian_revoked",
    },
  ]);
}, 180000);

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

// ---------------------------------------------------------------------------

describe("GET /api/picks/:token — the designer payload", () => {
  let token;
  let body;

  beforeAll(async () => {
    const list = await createPickList({
      items: [adult.applicationId, minor.applicationId, redacted.applicationId],
    });
    token = list.rawToken;
    const response = await request(app).get(`/api/picks/${token}`);
    expect(response.status).toBe(200);
    body = response.body.data;
  });

  test("carries the organizer masthead the designer needs to judge the ask", () => {
    expect(body.event).toEqual({
      organizerName: "Fashion Week Brooklyn",
      name: "Fashion Week Brooklyn SS27",
      startsOn: "2026-09-14",
      endsOn: "2026-09-20",
      location: "Greenpoint Terminal",
      compensation: {
        type: "stipend",
        details: "$150 per show plus travel.",
      },
    });
    expect(body.list).toEqual(
      expect.objectContaining({
        designerName: "Studio Aalto",
        label: "Look 1–12",
        organizerNote: "Six walkers for the opening block, please.",
        slotsRequested: 6,
        status: "open",
        readOnly: false,
      }),
    );
  });

  test("renders the applicant from the frozen snapshot", () => {
    expect(body.applicants).toHaveLength(1);
    const [applicant] = body.applicants;

    expect(applicant.applicationId).toBe(adult.applicationId);
    expect(applicant.display_name).toBe("Ada Lovelace");
    expect(applicant.height_cm).toBe(178);
    expect(applicant.waist_cm).toBe(61);
    expect(applicant.availability).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
      note: null,
    });
    expect(applicant.walk_video_url).toBe("https://vimeo.com/999888777");
    // Digitals, ordered by the applicant's own slot picks.
    expect(applicant.images.map((image) => image.id)).toEqual(["img-2", "img-1"]);
    expect(applicant.stats.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["height", "bust", "waist", "hips"]),
    );
  });

  test.each(Object.entries(FORBIDDEN_VALUES))(
    "never leaks the applicant's %s",
    (_label, value) => {
      expect(JSON.stringify(body)).not.toContain(value);
    },
  );

  test("emits exactly the allowlisted applicant keys and nothing else", () => {
    const [applicant] = body.applicants;
    expect(Object.keys(applicant).sort()).toEqual(
      [
        "applicationId",
        "availability",
        "bust_cm",
        "chest_cm",
        "display_name",
        "dress_size",
        "height_cm",
        "hips_cm",
        "images",
        "inseam_cm",
        "selection",
        "shoe_size",
        "stats",
        "stats_track",
        "suit_size",
        "waist_cm",
        "walk_video_url",
      ].sort(),
    );
  });

  test.each([
    "email",
    "phone",
    "date_of_birth",
    "dob",
    "age",
    "age_band",
    "social",
    "slug",
    "id",
    "profile_id",
    "compCard",
    "comp_card",
    "contact",
    "bio_curated",
    "weight_kg",
    "guardian_email",
    "hair_color",
    "eye_color",
    "city",
  ])("does not carry a %s key on the applicant", (key) => {
    const [applicant] = body.applicants;
    expect(applicant).not.toHaveProperty(key);
  });

  test("keeps weight out of the rendered stat lines as well as the fields", () => {
    const [applicant] = body.applicants;
    expect(applicant.stats.weight).toBeNull();
    expect(applicant.stats.fields.map((f) => f.key)).not.toContain("weight");
  });

  test("excludes minors — event calls are 18+ and a designer holds no grant", () => {
    const ids = body.applicants.map((a) => a.applicationId);
    expect(ids).not.toContain(minor.applicationId);
  });

  test("excludes an applicant whose package was redacted", () => {
    const ids = body.applicants.map((a) => a.applicationId);
    expect(ids).not.toContain(redacted.applicationId);
  });

  test("a later profile edit does not rewrite what the designer sees", async () => {
    await db("profiles")
      .where({ id: adult.profileId })
      .update({ first_name: "Renamed", height_cm: 150 });

    const response = await request(app).get(`/api/picks/${token}`);
    const [applicant] = response.body.data.applicants;

    expect(applicant.display_name).toBe("Ada Lovelace");
    expect(applicant.height_cm).toBe(178);
  });
});

describe("open tracking", () => {
  test("counts every open and stamps first and last", async () => {
    const list = await createPickList({ items: [adult.applicationId] });

    await request(app).get(`/api/picks/${list.rawToken}`);
    const afterFirst = await db("event_pick_lists")
      .where({ id: list.id })
      .first("open_count", "first_opened_at", "last_opened_at");

    expect(Number(afterFirst.open_count)).toBe(1);
    expect(afterFirst.first_opened_at).toBeTruthy();
    expect(afterFirst.last_opened_at).toBeTruthy();

    await request(app).get(`/api/picks/${list.rawToken}`);
    await request(app).get(`/api/picks/${list.rawToken}`);
    const afterThree = await db("event_pick_lists")
      .where({ id: list.id })
      .first("open_count", "first_opened_at");

    expect(Number(afterThree.open_count)).toBe(3);
    // The first open is the one that says when the link escaped; it never moves.
    expect(afterThree.first_opened_at).toEqual(afterFirst.first_opened_at);
  });
});

describe("PUT /api/picks/:token/selections/:applicationId", () => {
  let list;

  beforeEach(async () => {
    list = await createPickList({ items: [adult.applicationId] });
  });

  test("creates, then updates, the one selection per applicant", async () => {
    const created = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "maybe", note: "Strong walk, check the shoe size." });

    expect(created.status).toBe(200);
    expect(created.body.data.selection).toEqual({
      mark: "maybe",
      note: "Strong walk, check the shoe size.",
    });

    const updated = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick" });
    expect(updated.status).toBe(200);

    const rows = await db("event_pick_selections").where({
      pick_list_id: list.id,
      application_id: adult.applicationId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].mark).toBe("pick");
    expect(rows[0].note).toBeNull();
  });

  test("records a hashed ip and the user agent, never a raw ip", async () => {
    await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .set("User-Agent", "StudioBrowser/1.0")
      .send({ mark: "pick" });

    const row = await db("event_pick_selections")
      .where({ pick_list_id: list.id })
      .first("ip_hash", "user_agent");

    expect(row.user_agent).toBe("StudioBrowser/1.0");
    if (row.ip_hash) {
      expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.ip_hash).not.toContain("127.0.0.1");
    }
  });

  test("clears the selection when the mark is null", async () => {
    await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pass" });

    const cleared = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.selection).toBeNull();
    expect(
      await db("event_pick_selections").where({ pick_list_id: list.id }),
    ).toHaveLength(0);
  });

  test.each(["approved", "PICK", "yes", "1", "shortlisted"])(
    "refuses the mark %p — marks come from the PICK_MARKS constant",
    async (mark) => {
      const response = await request(app)
        .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
        .send({ mark });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_PICK_MARK");
    },
  );

  test("refuses a note over 300 characters rather than truncating it", async () => {
    const response = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick", note: "x".repeat(301) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PICK_NOTE_TOO_LONG");

    const atCap = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick", note: "x".repeat(300) });
    expect(atCap.status).toBe(200);
  });

  test("refuses an application the organizer did not put in this list", async () => {
    const response = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${minor.applicationId}`)
      .send({ mark: "pick" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PICK_LIST_NOT_AVAILABLE");
  });

  test("a closed list is read-only — the write is refused, prior picks stay", async () => {
    await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick" });
    await db("event_pick_lists").where({ id: list.id }).update({ status: "closed" });

    const refused = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pass" });

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("PICK_LIST_CLOSED");

    const row = await db("event_pick_selections")
      .where({ pick_list_id: list.id })
      .first("mark");
    expect(row.mark).toBe("pick");

    // Reading still works — closed is read-only, not revoked.
    const read = await request(app).get(`/api/picks/${list.rawToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.list.readOnly).toBe(true);
  });

  test("an expired list refuses writes with the no-oracle 404", async () => {
    await db("event_pick_lists")
      .where({ id: list.id })
      .update({ expires_at: new Date(Date.now() - DAY_MS).toISOString() });

    const response = await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PICK_LIST_NOT_AVAILABLE");
  });

  test("a designer mark never moves the application status", async () => {
    await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick" });

    const application = await db("applications")
      .where({ id: adult.applicationId })
      .first("status");
    expect(application.status).toBe("shortlisted");
  });
});

describe("POST /api/picks/:token/submit", () => {
  test("stamps submitted_at and reports the tally", async () => {
    const list = await createPickList({ items: [adult.applicationId] });
    await request(app)
      .put(`/api/picks/${list.rawToken}/selections/${adult.applicationId}`)
      .send({ mark: "pick" });

    const response = await request(app).post(`/api/picks/${list.rawToken}/submit`);

    expect(response.status).toBe(200);
    expect(response.body.data.counts).toEqual({ pick: 1 });

    const row = await db("event_pick_lists")
      .where({ id: list.id })
      .first("submitted_at", "status");
    expect(row.submitted_at).toBeTruthy();
    // Submitting is the designer saying they are done, not the organizer
    // closing the list — the status stays theirs to change.
    expect(row.status).toBe("open");
  });

  test("a closed list cannot be submitted again", async () => {
    const list = await createPickList({ items: [adult.applicationId] });
    await db("event_pick_lists").where({ id: list.id }).update({ status: "closed" });

    const response = await request(app).post(`/api/picks/${list.rawToken}/submit`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PICK_LIST_CLOSED");
  });
});
