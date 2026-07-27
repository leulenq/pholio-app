"use strict";

/**
 * Season analytics aggregation.
 *
 * Runs against a throwaway in-memory SQLite database with just the columns the
 * aggregator reads, so the assertions are about the folding logic rather than
 * about migration state.
 */

const knexFactory = require("knex");
const {
  buildSeasonAnalytics,
  replayJourney,
  buildFlow,
  buildQueue,
  buildCalibration,
  resolveGranularity,
  enumerateBuckets,
} = require("../season.queries");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const NOW = new Date("2026-07-27T12:00:00.000Z");
const AGENCY = "agency-1";

const daysAgo = (n) => new Date(NOW.getTime() - n * DAY_MS).toISOString();
const hoursAgo = (n) => new Date(NOW.getTime() - n * HOUR_MS).toISOString();

let db;

async function createSchema(knex) {
  await knex.schema.createTable("applications", (t) => {
    t.string("id").primary();
    t.string("profile_id");
    t.string("agency_id");
    t.string("status");
    t.string("board_id");
    t.integer("match_score");
    t.string("created_at");
    t.string("updated_at");
    t.string("viewed_at");
    t.string("accepted_at");
    t.string("declined_at");
  });
  await knex.schema.createTable("boards", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("name");
    t.string("client_name");
    t.integer("target_slots");
    t.boolean("is_active");
    t.string("closes_at");
  });
  await knex.schema.createTable("board_applications", (t) => {
    t.string("id").primary();
    t.string("board_id");
    t.string("application_id");
    t.integer("match_score");
  });
  await knex.schema.createTable("application_activities", (t) => {
    t.string("id").primary();
    t.string("application_id");
    t.string("agency_id");
    t.string("user_id");
    t.string("activity_type");
    t.text("metadata");
    t.string("created_at");
  });
  await knex.schema.createTable("interviews", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("status");
    t.string("interview_type");
    t.string("proposed_datetime");
    t.string("responded_at");
    t.string("created_at");
  });
  await knex.schema.createTable("reminders", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("status");
    t.string("priority");
    t.string("reminder_date");
    t.string("completed_at");
    t.string("created_at");
  });
  await knex.schema.createTable("agency_memberships", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("user_id");
    t.string("membership_role");
    t.string("status");
  });
  await knex.schema.createTable("users", (t) => {
    t.string("id").primary();
    t.string("first_name");
    t.string("last_name");
    t.string("email");
  });
  await knex.schema.createTable("roster_memberships", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("profile_id");
    t.string("talent_record_id");
    t.string("board_id");
    t.string("stage");
    t.string("status");
    t.string("joined_at");
    t.string("left_at");
  });
  await knex.schema.createTable("profiles", (t) => {
    t.string("id").primary();
    t.string("city");
    t.string("market");
    t.integer("height_cm");
    t.string("date_of_birth");
    t.string("gender");
    t.string("experience_level");
    t.string("archetype");
    t.integer("fit_score_runway");
    t.integer("fit_score_editorial");
    t.integer("fit_score_commercial");
    t.integer("fit_score_lifestyle");
    t.integer("fit_score_swim_fitness");
  });
}

async function seed(knex) {
  await knex("boards").insert([
    {
      id: "board-runway",
      agency_id: AGENCY,
      name: "Runway",
      client_name: null,
      target_slots: 10,
      is_active: true,
      closes_at: null,
    },
    {
      id: "board-commercial",
      agency_id: AGENCY,
      name: "Commercial",
      client_name: "House Client",
      target_slots: 4,
      is_active: true,
      closes_at: null,
    },
  ]);

  await knex("users").insert([
    { id: "user-booker", first_name: "Ada", last_name: "Reyes", email: "ada@x.test" },
    { id: "user-scout", first_name: null, last_name: null, email: "scout@x.test" },
  ]);
  await knex("agency_memberships").insert([
    {
      id: "m1",
      agency_id: AGENCY,
      user_id: "user-booker",
      membership_role: "OWNER",
      status: "active",
    },
    {
      id: "m2",
      agency_id: AGENCY,
      user_id: "user-scout",
      membership_role: "SCOUT",
      status: "active",
    },
  ]);

  // app-signed: applied → shortlisted → accepted → represented, all inside 90d
  // app-passed: applied → shortlisted → passed
  // app-open:   applied only, untouched for 40 days (stale queue item)
  // app-old:    outside the 90-day window entirely
  await knex("applications").insert([
    {
      id: "app-signed",
      profile_id: "p-signed",
      agency_id: AGENCY,
      status: "represented",
      board_id: "board-runway",
      match_score: 88,
      created_at: daysAgo(40),
      updated_at: daysAgo(20),
      viewed_at: daysAgo(39),
      accepted_at: daysAgo(22),
      declined_at: null,
    },
    {
      id: "app-passed",
      profile_id: "p-passed",
      agency_id: AGENCY,
      status: "passed",
      board_id: "board-runway",
      match_score: 41,
      created_at: daysAgo(30),
      updated_at: daysAgo(25),
      viewed_at: daysAgo(30),
      accepted_at: null,
      declined_at: daysAgo(25),
    },
    {
      id: "app-open",
      profile_id: "p-open",
      agency_id: AGENCY,
      status: "submitted",
      board_id: "board-commercial",
      match_score: 66,
      created_at: daysAgo(40),
      updated_at: daysAgo(40),
      viewed_at: null,
      accepted_at: null,
      declined_at: null,
    },
    {
      id: "app-old",
      profile_id: "p-old",
      agency_id: AGENCY,
      status: "passed",
      board_id: null,
      match_score: 20,
      created_at: daysAgo(300),
      updated_at: daysAgo(299),
      viewed_at: daysAgo(300),
      accepted_at: null,
      declined_at: daysAgo(299),
    },
  ]);

  await knex("board_applications").insert([
    { id: "ba1", board_id: "board-runway", application_id: "app-signed", match_score: 88 },
    { id: "ba2", board_id: "board-runway", application_id: "app-passed", match_score: 41 },
    {
      id: "ba3",
      board_id: "board-commercial",
      application_id: "app-open",
      match_score: 66,
    },
  ]);

  await knex("application_activities").insert([
    {
      id: "act1",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "status_change",
      metadata: JSON.stringify({ old_status: "submitted", new_status: "shortlisted" }),
      created_at: daysAgo(38),
    },
    {
      id: "act2",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "status_change",
      metadata: JSON.stringify({ old_status: "shortlisted", new_status: "accepted" }),
      created_at: daysAgo(30),
    },
    {
      id: "act3",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "status_change",
      metadata: JSON.stringify({ old_status: "accepted", new_status: "represented" }),
      created_at: daysAgo(22),
    },
    {
      id: "act4",
      application_id: "app-passed",
      agency_id: AGENCY,
      user_id: "user-scout",
      activity_type: "status_change",
      metadata: JSON.stringify({ old_status: "submitted", new_status: "shortlisted" }),
      created_at: daysAgo(29),
    },
    {
      id: "act5",
      application_id: "app-passed",
      agency_id: AGENCY,
      user_id: "user-scout",
      activity_type: "status_change",
      metadata: JSON.stringify({ old_status: "shortlisted", new_status: "passed" }),
      created_at: daysAgo(25),
    },
    {
      id: "act6",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "note_added",
      metadata: "{}",
      created_at: daysAgo(35),
    },
  ]);

  await knex("roster_memberships").insert([
    {
      id: "rm1",
      agency_id: AGENCY,
      profile_id: "p-signed",
      talent_record_id: null,
      board_id: "board-runway",
      stage: "new_face",
      status: "active",
      joined_at: daysAgo(22),
      left_at: null,
    },
    {
      id: "rm2",
      agency_id: AGENCY,
      profile_id: "p-veteran",
      talent_record_id: null,
      board_id: "board-commercial",
      stage: "main",
      status: "active",
      joined_at: daysAgo(400),
      left_at: null,
    },
    {
      id: "rm3",
      agency_id: AGENCY,
      profile_id: "p-left",
      talent_record_id: null,
      board_id: "board-runway",
      stage: "main",
      status: "left",
      joined_at: daysAgo(500),
      left_at: daysAgo(60),
    },
  ]);

  await knex("profiles").insert([
    {
      id: "p-signed",
      city: "New York",
      market: "new-york",
      height_cm: 178,
      date_of_birth: "2004-05-02",
      experience_level: "new_face",
      fit_score_runway: 80,
      fit_score_editorial: 70,
      fit_score_commercial: 40,
      fit_score_lifestyle: 45,
      fit_score_swim_fitness: 30,
    },
    {
      id: "p-veteran",
      city: "Paris",
      market: "paris",
      height_cm: 182,
      date_of_birth: "1998-01-10",
      experience_level: "established",
      fit_score_runway: 90,
      fit_score_editorial: 85,
      fit_score_commercial: 35,
      fit_score_lifestyle: 40,
      fit_score_swim_fitness: 25,
    },
    { id: "p-passed", city: "Milan", market: "milan", height_cm: 168 },
    { id: "p-open", city: "New York", market: "new-york", height_cm: 172 },
  ]);

  await knex("interviews").insert([
    {
      id: "i1",
      agency_id: AGENCY,
      status: "accepted",
      interview_type: "video_call",
      proposed_datetime: daysAgo(18),
      responded_at: daysAgo(19),
      created_at: daysAgo(20),
    },
    {
      id: "i2",
      agency_id: AGENCY,
      status: "declined",
      interview_type: "in_person",
      proposed_datetime: daysAgo(10),
      responded_at: daysAgo(11),
      created_at: daysAgo(12),
    },
  ]);

  await knex("reminders").insert([
    {
      id: "r1",
      agency_id: AGENCY,
      status: "pending",
      priority: "high",
      reminder_date: daysAgo(3),
      completed_at: null,
      created_at: daysAgo(10),
    },
    {
      id: "r2",
      agency_id: AGENCY,
      status: "completed",
      priority: "normal",
      reminder_date: daysAgo(6),
      completed_at: daysAgo(7),
      created_at: daysAgo(12),
    },
  ]);
}

beforeAll(async () => {
  db = knexFactory({
    client: "sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
  });
  await createSchema(db);
  await seed(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("replayJourney", () => {
  it("records the furthest stage reached and the dwell before each move", () => {
    const journey = replayJourney(
      { created_at: daysAgo(10), status: "shortlisted" },
      [
        {
          activity_type: "status_change",
          metadata: { new_status: "shortlisted" },
          created_at: daysAgo(6),
        },
      ],
    );
    expect(journey.reachedIndex).toBe(1);
    expect(journey.exitedFrom).toBeNull();
    expect(journey.dwell).toHaveLength(1);
    expect(Math.round(journey.dwell[0].days)).toBe(4);
    expect(journey.dwell[0].stageIndex).toBe(0);
  });

  it("attributes an exit to the stage the application was sitting in", () => {
    const journey = replayJourney(
      { created_at: daysAgo(10), status: "passed", declined_at: daysAgo(2) },
      [
        {
          activity_type: "status_change",
          metadata: { new_status: "shortlisted" },
          created_at: daysAgo(8),
        },
        {
          activity_type: "status_change",
          metadata: { new_status: "passed" },
          created_at: daysAgo(2),
        },
      ],
    );
    expect(journey.exitedFrom).toBe(1);
    expect(journey.currentStage).toBe("Passed");
  });

  it("falls back to the current status when no transitions were recorded", () => {
    const journey = replayJourney(
      { created_at: daysAgo(5), status: "passed", declined_at: daysAgo(1) },
      [],
    );
    expect(journey.exitedFrom).toBe(0);
    expect(journey.dwell).toHaveLength(0);
  });

  it("never lets a status jump invent an intermediate transition", () => {
    const journey = replayJourney(
      { created_at: daysAgo(9), status: "represented" },
      [
        {
          activity_type: "status_change",
          metadata: { new_status: "represented" },
          created_at: daysAgo(1),
        },
      ],
    );
    expect(journey.reachedIndex).toBe(3);
    // one recorded move, timed from Applied — not three fabricated hand-offs
    expect(journey.dwell).toHaveLength(1);
    expect(journey.dwell[0].stageIndex).toBe(0);
  });
});

describe("buildFlow", () => {
  it("splits every stage into advanced / held / exited without double counting", () => {
    const journeys = [
      { journey: { reachedIndex: 3, exitedFrom: null, dwell: [] } },
      { journey: { reachedIndex: 1, exitedFrom: 1, dwell: [] } },
      { journey: { reachedIndex: 0, exitedFrom: null, dwell: [] } },
    ];
    const flow = buildFlow(journeys);
    const [applied, shortlisted] = flow.stages;

    expect(applied.reached).toBe(3);
    expect(applied.advanced).toBe(2);
    expect(applied.exited).toBe(0);
    expect(applied.held).toBe(1);
    expect(applied.advanced + applied.held + applied.exited).toBe(applied.reached);

    expect(shortlisted.reached).toBe(2);
    expect(shortlisted.exited).toBe(1);
    expect(shortlisted.advanced).toBe(1);
    expect(shortlisted.held).toBe(0);
    expect(flow.signed).toBe(1);
  });
});

describe("buildQueue", () => {
  it("buckets open work by time since the last touch, not by submission date", () => {
    const queue = buildQueue(
      [
        {
          application: { created_at: daysAgo(90), viewed_at: null },
          journey: { reachedIndex: 0 },
          lastTouchAt: new Date(NOW.getTime() - 1 * DAY_MS),
        },
        {
          application: { created_at: daysAgo(5), viewed_at: daysAgo(4) },
          journey: { reachedIndex: 1 },
          lastTouchAt: null,
        },
      ],
      NOW,
    );
    expect(queue.total).toBe(2);
    expect(queue.unviewed).toBe(1);
    expect(queue.buckets.find((b) => b.key === "0-2").count).toBe(1);
    expect(queue.buckets.find((b) => b.key === "3-7").count).toBe(1);
    expect(queue.oldestDays).toBe(5);
  });
});

describe("buildCalibration", () => {
  it("skips unscored submissions rather than binning them at zero", () => {
    const calibration = buildCalibration(
      [
        { application: { id: "a" }, journey: { reachedIndex: 3, currentStage: "Represented" } },
        { application: { id: "b" }, journey: { reachedIndex: 0, currentStage: "Passed" } },
        { application: { id: "c" }, journey: { reachedIndex: 0, currentStage: "Applied" } },
      ],
      (app) => ({ a: 90, b: 45, c: null })[app.id],
    );
    expect(calibration.sample).toBe(2);
    expect(calibration.bins.find((b) => b.key === "85-100").signed).toBe(1);
    expect(calibration.bins.find((b) => b.key === "40-54").passed).toBe(1);
    expect(calibration.separation).toBe(45);
  });
});

describe("bucket planning", () => {
  it("rolls long ranges up so the series never renders one column per day", () => {
    expect(resolveGranularity(30)).toBe("day");
    expect(resolveGranularity(90)).toBe("day");
    expect(resolveGranularity(365)).toBe("week");
    expect(resolveGranularity(730)).toBe("month");
  });

  it("enumerates a continuous axis including empty buckets", () => {
    const keys = enumerateBuckets(
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-05T00:00:00Z"),
      "day",
      0,
    );
    expect(keys).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);
  });
});

describe("buildSeasonAnalytics", () => {
  let result;

  beforeAll(async () => {
    result = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      tzOffsetMinutes: 0,
      now: NOW,
    });
  });

  it("gives every signal tile a real sub-series to draw", () => {
    expect(result.signals).toHaveLength(6);
    result.signals.forEach((signal) => {
      expect(signal.series).toHaveLength(12);
      // A signal whose metric key does not exist would silently draw an empty
      // spark, so every tile must resolve at least one observation.
      expect(signal.series.some((v) => v != null)).toBe(true);
    });
  });

  it("reports the requested window and the agency's boards", () => {
    expect(result.meta.range).toBe(90);
    expect(result.meta.granularity).toBe("day");
    expect(result.meta.boards.map((b) => b.name)).toEqual(["Commercial", "Runway"]);
    expect(result.meta.rosterIsDerived).toBe(false);
  });

  it("excludes submissions outside the window from the flow cohort", () => {
    expect(result.flow.cohort).toBe(3); // app-old is 300 days back
    expect(result.flow.signed).toBe(1);
    expect(result.flow.exited).toBe(1);
  });

  it("times the pipeline from real transitions", () => {
    const applied = result.flow.stages[0];
    expect(applied.reached).toBe(3);
    expect(applied.advanced).toBe(2);
    expect(applied.conversion).toBe(67);
    expect(applied.medianDwellDays).toBeCloseTo(1.5, 1);
  });

  it("keeps stale open work in the queue even though it predates the window", () => {
    const stale = result.queue.buckets.find((b) => b.key === "30+");
    expect(result.queue.total).toBe(1);
    expect(stale.count).toBe(1);
    expect(result.queue.unviewed).toBe(1);
  });

  it("lays the volume series on a continuous daily axis", () => {
    expect(result.volume.granularity).toBe("day");
    expect(result.volume.series).toHaveLength(91);
    const totals = result.volume.series.reduce((sum, row) => sum + row.total, 0);
    expect(totals).toBe(3);
    expect(result.volume.series.every((row) => row.trend != null)).toBe(true);
  });

  it("separates signed from passed match scores", () => {
    expect(result.calibration.signedAverage).toBe(88);
    expect(result.calibration.passedAverage).toBe(41);
    expect(result.calibration.separation).toBe(47);
  });

  it("scores board performance from board links", () => {
    const runway = result.boards.find((b) => b.name === "Runway");
    expect(runway.submissions).toBe(2);
    expect(runway.signed).toBe(1);
    expect(runway.averageMatch).toBe(65); // (88 + 41) / 2 rounded
    expect(runway.filled).toBe(1);
    expect(runway.fillRate).toBe(10);
  });

  it("attributes desk activity to the team member who acted", () => {
    const booker = result.desk.team.find((m) => m.name === "Ada Reyes");
    const scout = result.desk.team.find((m) => m.name === "scout");
    expect(booker.decisions).toBe(3);
    expect(booker.notes).toBe(1);
    expect(scout.decisions).toBe(2);
    expect(result.desk.punchcard).toHaveLength(7 * 24);
    expect(result.desk.punchTotal).toBe(6);
  });

  it("measures first response from the first recorded touch", () => {
    // app-open has never been viewed or acted on, so it contributes no latency
    // sample rather than an invented one.
    expect(result.desk.latency.sample).toBe(2);
    expect(result.desk.latency.medianHours).not.toBeNull();
  });

  it("summarises interview and reminder operations", () => {
    expect(result.desk.interviews.total).toBe(2);
    expect(result.desk.interviews.acceptRate).toBe(50);
    expect(result.desk.reminders.open).toBe(1);
    expect(result.desk.reminders.overdue).toBe(1);
  });

  it("reads the roster from memberships, including departures", () => {
    expect(result.roster.size).toBe(2);
    expect(result.roster.departed).toBe(1);
    const lastMonth = result.roster.growth[result.roster.growth.length - 1];
    expect(lastMonth.total).toBe(2);
    expect(result.roster.markets.map((m) => m.market).sort()).toEqual([
      "new-york",
      "paris",
    ]);
  });

  it("compares roster fit against the incoming pipeline on the same axes", () => {
    const runway = result.roster.fit.find((f) => f.axis === "Runway");
    expect(runway.roster).toBe(85); // (80 + 90) / 2
    expect(runway.rosterSample).toBe(2);
    // only p-signed in the window carries fit scores
    expect(runway.pipeline).toBe(80);
    expect(runway.pipelineSample).toBe(1);
  });

  it("scopes every section to a single board when asked", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      boardId: "board-commercial",
      now: NOW,
    });
    expect(scoped.meta.boardId).toBe("board-commercial");
    expect(scoped.flow.cohort).toBe(1);
    expect(scoped.boards).toHaveLength(1);
    expect(scoped.roster.size).toBe(1);
  });

  it("ignores an unknown board id rather than returning an empty report", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      boardId: "not-a-board",
      now: NOW,
    });
    expect(scoped.meta.boardId).toBeNull();
    expect(scoped.flow.cohort).toBe(3);
  });

  it("falls back to the default range for an unsupported value", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 7,
      now: NOW,
    });
    expect(scoped.meta.range).toBe(90);
  });
});
