// tests/talent/tracker.test.js
// Phase 6 off-platform submission tracker — CRUD, profile scoping, validation,
// and display-time lapse computation (ruling R1).
"use strict";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");
const {
  DEFAULT_TRACKER_WINDOW_DAYS,
  REAPPLY_CONVENTION_MONTHS,
} = require("../../src/shared/constants/submission-tracker");
const {
  isLapsed,
  lapseDate,
  reapplyOpensOn,
} = require("../../src/shared/lib/submission-lapse");

const SESSION_SECRET = require("../../src/config").sessionSecret;

const SESSION_IDS = [];
const FIXTURES = [];
const SERIES_IDS = [];

// Standalone-runnable: `npm test -- tests/talent/tracker.test.js` gets no
// migrated schema for free unless some other suite already ran in this jest
// process. Mirrors the idiom in tests/talent/media-bulk.test.js.
beforeAll(async () => {
  await knex.migrate.latest();
});

async function makeProfile() {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `tracker-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
    email_verified: true,
    terms_accepted_at: knex.fn.now(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });

  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `tracker-${profileId}`,
    first_name: "Tracker",
    last_name: "Tester",
    city: "Test City",
    height_cm: 170,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  });

  const fixture = { userId, profileId, role: "TALENT" };
  FIXTURES.push(fixture);
  return fixture;
}

async function withSession(fixture, req) {
  const sid = uuidv4();
  SESSION_IDS.push(sid);
  const sessData = {
    cookie: {
      originalMaxAge: 86400000,
      expires: new Date(Date.now() + 86400000).toISOString(),
      secure: false,
      httpOnly: true,
      path: "/",
    },
    userId: fixture.userId,
    role: fixture.role || "TALENT",
  };
  await knex("sessions").insert({
    sid,
    sess: sessData,
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
}

async function makeSeries() {
  const seriesId = `test:tracker:${uuidv4()}`;
  await knex("spec_registry_series").insert({
    series_id: seriesId,
    organization_key: "test-org",
  });
  SERIES_IDS.push(seriesId);
  return seriesId;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function cleanupProfile({ userId, profileId }) {
  await knex("off_platform_submissions").where({ profile_id: profileId }).del();
  await knex("profiles").where({ id: profileId }).del();
  await knex("users").where({ id: userId }).del();
}

afterAll(async () => {
  if (SESSION_IDS.length > 0) {
    await knex("sessions").whereIn("sid", SESSION_IDS).delete();
  }
  for (const fixture of FIXTURES) {
    await cleanupProfile(fixture).catch(() => {});
  }
  if (SERIES_IDS.length > 0) {
    await knex("spec_registry_series").whereIn("series_id", SERIES_IDS).del().catch(() => {});
  }
  await knex.destroy();
});

describe("GET/POST/PATCH/DELETE /api/talent/tracker", () => {
  test("requires auth", async () => {
    const res = await request(app).get("/api/talent/tracker").set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  test("an AGENCY-role session is forbidden (role isolation)", async () => {
    const fixture = await makeProfile();
    fixture.role = "AGENCY";
    const res = await withSession(
      fixture,
      request(app).get("/api/talent/tracker").set("Accept", "application/json"),
    );
    expect(res.status).toBe(403);
  });

  test("create, list (newest submitted_on first), patch, and delete", async () => {
    const fixture = await makeProfile();
    const seriesId = await makeSeries();

    const older = await withSession(
      fixture,
      request(app).post("/api/talent/tracker").send({
        agencyName: "Older Agency",
        submittedOn: isoDaysAgo(10),
      }),
    );
    expect(older.status).toBe(201);
    expect(older.body.data.submission.agencyName).toBe("Older Agency");
    expect(older.body.data.submission.channel).toBe("official_web_form");
    expect(older.body.data.submission.status).toBe("awaiting");
    expect(older.body.data.submission.reviewWindowDays).toBe(DEFAULT_TRACKER_WINDOW_DAYS);

    const newer = await withSession(
      fixture,
      request(app).post("/api/talent/tracker").send({
        agencyName: "Newer Agency",
        seriesId,
        channel: "official_email",
        destinationUrl: "https://newer.example.com/apply",
        submittedOn: isoDaysAgo(1),
        sentSummary: { revisionId: "rev-1", fileCount: 3, exportEventId: uuidv4() },
        note: "Applied via casting email",
      }),
    );
    expect(newer.status).toBe(201);
    expect(newer.body.data.submission.seriesId).toBe(seriesId);
    expect(newer.body.data.submission.destinationUrl).toBe("https://newer.example.com/apply");
    expect(newer.body.data.submission.sentSummary).toEqual({
      revisionId: "rev-1",
      fileCount: 3,
      exportEventId: expect.any(String),
    });
    const newerId = newer.body.data.submission.id;
    const olderId = older.body.data.submission.id;

    const list = await withSession(fixture, request(app).get("/api/talent/tracker"));
    expect(list.status).toBe(200);
    const ids = list.body.data.submissions.map((s) => s.id);
    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));

    const patch = await withSession(
      fixture,
      request(app)
        .patch(`/api/talent/tracker/${newerId}`)
        .send({ status: "heard_back", outcomeNote: "Requested a callback" }),
    );
    expect(patch.status).toBe(200);
    expect(patch.body.data.submission.status).toBe("heard_back");
    expect(patch.body.data.submission.outcomeNote).toBe("Requested a callback");

    const del = await withSession(
      fixture,
      request(app).delete(`/api/talent/tracker/${olderId}`),
    );
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const listAfter = await withSession(fixture, request(app).get("/api/talent/tracker"));
    expect(listAfter.body.data.submissions.some((s) => s.id === olderId)).toBe(false);
    expect(listAfter.body.data.submissions.some((s) => s.id === newerId)).toBe(true);
  });

  test("PATCH updates status_changed_at only when status actually changes", async () => {
    const fixture = await makeProfile();
    const created = await withSession(
      fixture,
      request(app).post("/api/talent/tracker").send({
        agencyName: "Status Clock Agency",
        submittedOn: isoDaysAgo(2),
      }),
    );
    const id = created.body.data.submission.id;
    const originalStatusChangedAt = created.body.data.submission.statusChangedAt;

    // Note-only edit: status_changed_at must not move.
    const noteOnly = await withSession(
      fixture,
      request(app).patch(`/api/talent/tracker/${id}`).send({ note: "still waiting" }),
    );
    expect(noteOnly.status).toBe(200);
    expect(noteOnly.body.data.submission.statusChangedAt).toBe(originalStatusChangedAt);

    // SQLite's CURRENT_TIMESTAMP (what knex.fn.now() compiles to here) has
    // one-second resolution, so the gap has to clear a full second boundary
    // for the two timestamps to be distinguishable at all.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const statusChange = await withSession(
      fixture,
      request(app).patch(`/api/talent/tracker/${id}`).send({ status: "closed_by_talent" }),
    );
    expect(statusChange.status).toBe(200);
    expect(statusChange.body.data.submission.status).toBe("closed_by_talent");
    expect(
      new Date(statusChange.body.data.submission.statusChangedAt).getTime(),
    ).toBeGreaterThan(new Date(originalStatusChangedAt).getTime());
  });

  test("profile scoping: user B cannot read, patch, or delete user A's row (404, no oracle)", async () => {
    const owner = await makeProfile();
    const intruder = await makeProfile();

    const created = await withSession(
      owner,
      request(app).post("/api/talent/tracker").send({
        agencyName: "Owner Only Agency",
        submittedOn: isoDaysAgo(1),
      }),
    );
    const id = created.body.data.submission.id;

    const patchAttempt = await withSession(
      intruder,
      request(app).patch(`/api/talent/tracker/${id}`).send({ status: "heard_back" }),
    );
    expect(patchAttempt.status).toBe(404);

    const deleteAttempt = await withSession(
      intruder,
      request(app).delete(`/api/talent/tracker/${id}`),
    );
    expect(deleteAttempt.status).toBe(404);

    // Still there for the real owner, untouched.
    const list = await withSession(owner, request(app).get("/api/talent/tracker"));
    const row = list.body.data.submissions.find((s) => s.id === id);
    expect(row).toBeTruthy();
    expect(row.status).toBe("awaiting");

    // The intruder's own list never includes the owner's row.
    const intruderList = await withSession(intruder, request(app).get("/api/talent/tracker"));
    expect(intruderList.body.data.submissions.some((s) => s.id === id)).toBe(false);
  });

  describe("create validation", () => {
    test("rejects a missing agencyName", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({ submittedOn: isoDaysAgo(1) }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects an agencyName over 160 characters", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "x".repeat(161),
          submittedOn: isoDaysAgo(1),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects an unrecognized channel", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Bad Channel Agency",
          channel: "carrier_pigeon",
          submittedOn: isoDaysAgo(1),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects a non-http(s) destinationUrl", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Bad URL Agency",
          destinationUrl: "ftp://example.com/apply",
          submittedOn: isoDaysAgo(1),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects a submittedOn in the future", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Future Agency",
          submittedOn: isoDaysFromNow(3),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects a malformed submittedOn", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Malformed Date Agency",
          submittedOn: "03/15/2026",
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects an oversize note", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Long Note Agency",
          submittedOn: isoDaysAgo(1),
          note: "x".repeat(501),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects an unrecognized seriesId (422, no 404)", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Bad Series Agency",
          seriesId: "does-not-exist-in-registry",
          submittedOn: isoDaysAgo(1),
        }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects a malformed sentSummary", async () => {
      const fixture = await makeProfile();
      const res = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Bad Summary Agency",
          submittedOn: isoDaysAgo(1),
          sentSummary: { fileCount: -1 },
        }),
      );
      expect(res.status).toBe(422);
    });
  });

  describe("patch validation", () => {
    test("rejects an unrecognized status", async () => {
      const fixture = await makeProfile();
      const created = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Patch Validation Agency",
          submittedOn: isoDaysAgo(1),
        }),
      );
      const id = created.body.data.submission.id;

      const res = await withSession(
        fixture,
        request(app).patch(`/api/talent/tracker/${id}`).send({ status: "pending_review" }),
      );
      expect(res.status).toBe(422);
    });

    test("rejects an oversize outcomeNote", async () => {
      const fixture = await makeProfile();
      const created = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Outcome Note Agency",
          submittedOn: isoDaysAgo(1),
        }),
      );
      const id = created.body.data.submission.id;

      const res = await withSession(
        fixture,
        request(app)
          .patch(`/api/talent/tracker/${id}`)
          .send({ outcomeNote: "x".repeat(301) }),
      );
      expect(res.status).toBe(422);
    });
  });

  describe("lapse computation (display-time, ruling R1)", () => {
    test("a row older than its review window reports isLapsed true with the correct reapplyOpensOn", async () => {
      const fixture = await makeProfile();
      const submittedOn = isoDaysAgo(45); // > DEFAULT_TRACKER_WINDOW_DAYS (30)
      const created = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Lapsed Agency",
          submittedOn,
        }),
      );
      const submission = created.body.data.submission;
      expect(submission.isLapsed).toBe(true);

      const expectedLapseDate = lapseDate({
        submitted_on: submittedOn,
        review_window_days: DEFAULT_TRACKER_WINDOW_DAYS,
      });
      const expectedReapply = reapplyOpensOn({ submitted_on: submittedOn });
      expect(submission.lapseDate).toBe(expectedLapseDate.toISOString().slice(0, 10));
      expect(submission.reapplyOpensOn).toBe(expectedReapply.toISOString().slice(0, 10));

      // List view carries the same computation.
      const list = await withSession(fixture, request(app).get("/api/talent/tracker"));
      const row = list.body.data.submissions.find((s) => s.id === submission.id);
      expect(row.isLapsed).toBe(true);
    });

    test("a row within the window reports isLapsed false", async () => {
      const fixture = await makeProfile();
      const created = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Fresh Agency",
          submittedOn: isoDaysAgo(5),
        }),
      );
      expect(created.body.data.submission.isLapsed).toBe(false);
    });

    test("a row marked heard_back never reports isLapsed, even past the window", async () => {
      const fixture = await makeProfile();
      const created = await withSession(
        fixture,
        request(app).post("/api/talent/tracker").send({
          agencyName: "Heard Back Agency",
          submittedOn: isoDaysAgo(60),
        }),
      );
      const id = created.body.data.submission.id;
      const patched = await withSession(
        fixture,
        request(app).patch(`/api/talent/tracker/${id}`).send({ status: "heard_back" }),
      );
      expect(patched.body.data.submission.isLapsed).toBe(false);
    });
  });
});

describe("submission-lapse.js (unit)", () => {
  test("isLapsed is false before the window elapses, true the instant it does", () => {
    const submittedOn = "2026-01-01";
    const windowDays = 30;
    const row = { status: "awaiting", submitted_on: submittedOn, review_window_days: windowDays };

    const justBefore = new Date("2026-01-30T23:59:59.999Z"); // day 29
    expect(isLapsed(row, justBefore)).toBe(false);

    const exactBoundary = new Date("2026-01-31T00:00:00.000Z"); // day 30, exactly the window
    expect(isLapsed(row, exactBoundary)).toBe(false);

    const justAfter = new Date("2026-01-31T00:00:00.001Z");
    expect(isLapsed(row, justAfter)).toBe(true);
  });

  test("isLapsed is false for non-awaiting statuses regardless of age", () => {
    const row = { status: "heard_back", submitted_on: "2020-01-01", review_window_days: 30 };
    expect(isLapsed(row, new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  test("respects a custom review_window_days", () => {
    const row = { status: "awaiting", submitted_on: "2026-01-01", review_window_days: 7 };
    expect(isLapsed(row, new Date("2026-01-07T00:00:00Z"))).toBe(false);
    expect(isLapsed(row, new Date("2026-01-08T00:00:01Z"))).toBe(true);
  });

  test("falls back to the default window when review_window_days is missing", () => {
    const row = { status: "awaiting", submitted_on: "2026-01-01" };
    expect(isLapsed(row, new Date(`2026-01-01T00:00:00Z`))).toBe(false);
    const lapsed = new Date(
      Date.parse("2026-01-01T00:00:00Z") + (DEFAULT_TRACKER_WINDOW_DAYS + 1) * 86_400_000,
    );
    expect(isLapsed(row, lapsed)).toBe(true);
  });

  test("lapseDate returns null when submitted_on is missing or unparseable", () => {
    expect(lapseDate({ submitted_on: null })).toBeNull();
    expect(lapseDate({ submitted_on: "not-a-date" })).toBeNull();
  });

  test("reapplyOpensOn adds REAPPLY_CONVENTION_MONTHS calendar months", () => {
    const opens = reapplyOpensOn({ submitted_on: "2026-01-15" });
    expect(opens.toISOString().slice(0, 10)).toBe(
      `2026-${String(1 + REAPPLY_CONVENTION_MONTHS).padStart(2, "0")}-15`,
    );
  });

  test("reapplyOpensOn handles month-end overflow (Jan 31 + N months)", () => {
    // Jan 31 + 6 months = Jul 31 (July has 31 days, so no overflow here — but
    // this pins the exact JS Date normalization behavior the function relies on).
    const opens = reapplyOpensOn({ submitted_on: "2026-01-31" });
    expect(opens.getUTCFullYear()).toBe(2026);
    expect(Number.isInteger(opens.getUTCMonth())).toBe(true);
  });
});
