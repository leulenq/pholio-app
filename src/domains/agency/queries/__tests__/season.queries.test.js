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

async function createSchema(
  knex,
  {
    fitScoreTable = "analysis",
    includeApplicationBoardId = false,
    includeBoardKind = false,
    includeBoardType = true,
  } = {},
) {
  await knex.schema.createTable("applications", (t) => {
    t.string("id").primary();
    t.string("profile_id");
    t.string("agency_id");
    t.string("status");
    if (includeApplicationBoardId) t.string("board_id");
    t.integer("match_score");
    t.boolean("minor_at_submission").notNullable().defaultTo(false);
    t.string("minor_access_revoked_at");
    t.string("guardian_consent_expires_at");
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
    if (includeBoardKind) t.string("kind");
    if (includeBoardType) t.string("board_type");
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
    t.string("application_id");
    t.string("status");
    t.string("interview_type");
    t.string("proposed_datetime");
    t.string("responded_at");
    t.string("created_at");
  });
  await knex.schema.createTable("reminders", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("application_id");
    t.string("status");
    t.string("priority");
    t.string("reminder_date");
    t.string("snoozed_until");
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
    t.string("source_application_id");
  });
  await knex.schema.createTable("roster_board_standings", (t) => {
    t.string("id").primary();
    t.string("membership_id");
    t.string("board_id");
    t.string("standing");
    t.boolean("is_primary");
  });
  await knex.schema.createTable("agency_setup_steps", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("step_key");
    t.text("data");
  });
  await knex.schema.createTable("talent_records", (t) => {
    t.string("id").primary();
    t.string("agency_id");
    t.string("market");
    t.integer("height_cm");
    t.string("date_of_birth");
    t.string("gender");
    t.boolean("is_minor").notNullable().defaultTo(false);
    t.string("minor_consent_status").notNullable().defaultTo("not_required");
    t.string("minor_consent_expires_at");
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
    if (fitScoreTable === "profile") {
      t.integer("fit_score_runway");
      t.integer("fit_score_editorial");
      t.integer("fit_score_commercial");
      t.integer("fit_score_lifestyle");
      t.integer("fit_score_swim_fitness");
    }
  });
  await knex.schema.createTable("ai_profile_analysis", (t) => {
    t.string("id").primary();
    t.string("profile_id").unique();
    if (fitScoreTable === "analysis") {
      t.integer("fit_score_runway");
      t.integer("fit_score_editorial");
      t.integer("fit_score_commercial");
      t.integer("fit_score_lifestyle");
      t.integer("fit_score_swim_fitness");
    }
  });
}

async function seed(knex, { fitScoreTable = "analysis" } = {}) {
  await knex("boards").insert([
    {
      id: "board-runway",
      agency_id: AGENCY,
      name: "Runway",
      client_name: null,
      target_slots: 10,
      is_active: true,
      closes_at: null,
      board_type: "package",
    },
    {
      id: "board-commercial",
      agency_id: AGENCY,
      name: "Commercial",
      client_name: "House Client",
      target_slots: 4,
      is_active: true,
      closes_at: null,
      board_type: "package",
    },
    {
      id: "division-development",
      agency_id: AGENCY,
      name: "Development",
      client_name: null,
      target_slots: null,
      is_active: true,
      closes_at: null,
      board_type: null,
    },
    {
      id: "division-main",
      agency_id: AGENCY,
      name: "Main",
      client_name: null,
      target_slots: null,
      is_active: true,
      closes_at: null,
      board_type: null,
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
  await knex("agency_setup_steps").insert({
    id: "setup-defaults",
    agency_id: AGENCY,
    step_key: "defaults",
    data: JSON.stringify({ timezone: "America/New_York" }),
  });

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
      match_score: 88,
      minor_at_submission: false,
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
      match_score: 41,
      minor_at_submission: false,
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
      match_score: 66,
      minor_at_submission: false,
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
      match_score: 20,
      minor_at_submission: false,
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
      board_id: "division-development",
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
      board_id: "division-main",
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
      board_id: "division-development",
      stage: "main",
      status: "left",
      joined_at: daysAgo(500),
      left_at: daysAgo(60),
    },
  ]);

  await knex("roster_board_standings").insert([
    {
      id: "rbs1",
      membership_id: "rm1",
      board_id: "division-development",
      standing: "developing",
      is_primary: true,
    },
    {
      id: "rbs2",
      membership_id: "rm2",
      board_id: "division-main",
      standing: "represented",
      is_primary: true,
    },
    {
      id: "rbs3",
      membership_id: "rm2",
      board_id: "division-development",
      standing: "active",
      is_primary: false,
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
    },
    {
      id: "p-veteran",
      city: "Paris",
      market: "paris",
      height_cm: 182,
      date_of_birth: "1998-01-10",
      experience_level: "established",
    },
    { id: "p-passed", city: "Milan", market: "milan", height_cm: 168 },
    { id: "p-open", city: "New York", market: "new-york", height_cm: 172 },
  ]);

  const fitScores = [
    {
      profile_id: "p-signed",
      fit_score_runway: 80,
      fit_score_editorial: 70,
      fit_score_commercial: 40,
      fit_score_lifestyle: 45,
      fit_score_swim_fitness: 30,
    },
    {
      profile_id: "p-veteran",
      fit_score_runway: 90,
      fit_score_editorial: 85,
      fit_score_commercial: 35,
      fit_score_lifestyle: 40,
      fit_score_swim_fitness: 25,
    },
  ];
  if (fitScoreTable === "analysis") {
    await knex("ai_profile_analysis").insert(
      fitScores.map((scores, index) => ({
        id: `analysis-${index}`,
        ...scores,
      })),
    );
  } else if (fitScoreTable === "profile") {
    await Promise.all(
      fitScores.map(({ profile_id: profileId, ...values }) =>
        knex("profiles").where({ id: profileId }).update(values),
      ),
    );
  }

  await knex("interviews").insert([
    {
      id: "i1",
      agency_id: AGENCY,
      application_id: "app-signed",
      status: "accepted",
      interview_type: "video_call",
      proposed_datetime: daysAgo(18),
      responded_at: daysAgo(19),
      created_at: daysAgo(20),
    },
    {
      id: "i2",
      agency_id: AGENCY,
      application_id: "app-passed",
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
      application_id: "app-open",
      status: "pending",
      priority: "high",
      reminder_date: daysAgo(3),
      completed_at: null,
      created_at: daysAgo(10),
    },
    {
      id: "r2",
      agency_id: AGENCY,
      application_id: "app-signed",
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
    expect(journey.reachedStages).toEqual([true, false, false, true]);
    expect(journey.flowComplete).toBe(false);
  });

  it.each([
    ["kept_on_file", "Kept on file"],
    ["withdrawn", "Withdrawn"],
  ])("treats %s as a closed outcome rather than open work", (status, stage) => {
    const journey = replayJourney(
      { created_at: daysAgo(5), updated_at: daysAgo(1), status },
      [],
    );
    expect(journey.currentStage).toBe(stage);
    expect(journey.isOpen).toBe(false);
  });
});

describe("buildFlow", () => {
  it("splits every stage into advanced / held / exited without double counting", () => {
    const journeys = [
      { journey: { reachedIndex: 3, exitedFrom: null, dwell: [], flowComplete: true } },
      { journey: { reachedIndex: 1, exitedFrom: 1, exitKind: "passed", dwell: [], flowComplete: true } },
      { journey: { reachedIndex: 0, exitedFrom: null, dwell: [], flowComplete: true } },
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

  it("excludes journeys whose intermediate hand-offs are not evidenced", () => {
    const flow = buildFlow([
      { journey: { reachedIndex: 3, exitedFrom: null, dwell: [], flowComplete: false } },
      { journey: { reachedIndex: 0, exitedFrom: null, dwell: [], flowComplete: true } },
    ]);
    expect(flow.totalCohort).toBe(2);
    expect(flow.cohort).toBe(1);
    expect(flow.excludedIncomplete).toBe(1);
    expect(flow.signed).toBe(0);
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
      "UTC",
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
      timeZone: "UTC",
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
    expect(result.meta.boards.map((b) => b.name)).toEqual([
      "Commercial",
      "Development",
      "Main",
      "Runway",
    ]);
    expect(result.meta.boards.filter((b) => b.kind === "package")).toHaveLength(2);
    expect(result.meta.boards.filter((b) => b.kind === "division")).toHaveLength(2);
    expect(result.meta.timeZone).toBe("UTC");
    expect(result.meta.rosterIsDerived).toBe(false);
  });

  it("excludes submissions outside the window from the flow cohort", () => {
    // app-old is outside the window; app-signed skips the Offered hand-off and
    // is truthfully disclosed outside the sequential ribbon cohort.
    expect(result.flow.totalCohort).toBe(3);
    expect(result.flow.cohort).toBe(2);
    expect(result.flow.signed).toBe(0);
    expect(result.flow.exited).toBe(1);
  });

  it("times the pipeline from real transitions", () => {
    const applied = result.flow.stages[0];
    expect(applied.reached).toBe(2);
    expect(applied.advanced).toBe(1);
    expect(applied.conversion).toBe(50);
    expect(applied.medianDwellDays).toBe(1);
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

  it("reports package intake without inventing board-specific conversions", () => {
    const runway = result.boards.find((b) => b.name === "Runway");
    expect(runway.submissions).toBe(2);
    expect(runway.averageMatch).toBe(65); // (88 + 41) / 2 rounded
    expect(runway.scoreCoverage).toBe(100);
    expect(runway).not.toHaveProperty("signed");
    expect(runway).not.toHaveProperty("advanceRate");
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
    // Viewing happened before the first status-change activities, so the
    // earlier view timestamps must win: 0h and 24h, median 12h.
    expect(result.desk.latency.medianHours).toBe(12);
  });

  it("does not count talent-originated activity as agency desk work", async () => {
    await db("application_activities").insert({
      id: "talent-originated-activity",
      application_id: "app-open",
      agency_id: AGENCY,
      user_id: "talent-user",
      activity_type: "note_added",
      metadata: "{}",
      created_at: daysAgo(1),
    });
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.desk.punchTotal).toBe(6);
      expect(scoped.desk.latency.sample).toBe(2);
      expect(scoped.totals.activitiesObserved).toBe(6);
    } finally {
      await db("application_activities")
        .where({ id: "talent-originated-activity" })
        .delete();
    }
  });

  it("uses historical IANA offsets when bucketing work across DST", async () => {
    await db("application_activities").insert({
      id: "pre-dst-activity",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "note_added",
      metadata: "{}",
      // 04:30 UTC was 23:30 Saturday in New York before the 2026 spring shift.
      created_at: "2026-03-08 04:30:00",
    });
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 365,
        timeZone: "America/New_York",
        now: NOW,
      });
      expect(
        scoped.desk.punchcard.find(
          (cell) => cell.dow === 5 && cell.hour === 23,
        ).count,
      ).toBe(1);
    } finally {
      await db("application_activities")
        .where({ id: "pre-dst-activity" })
        .delete();
    }
  });

  it("counts an interview by its proposed date when it was created earlier", async () => {
    await db("interviews").insert({
      id: "i-proposed-in-window",
      agency_id: AGENCY,
      application_id: "app-open",
      status: "pending",
      interview_type: "in_person",
      proposed_datetime: daysAgo(5),
      responded_at: null,
      created_at: daysAgo(120),
    });
    try {
      const withScheduledInterview = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(withScheduledInterview.desk.interviews.total).toBe(3);
      expect(withScheduledInterview.desk.interviews.pending).toBe(1);
    } finally {
      await db("interviews").where({ id: "i-proposed-in-window" }).delete();
    }
  });

  it("excludes future submissions and operational timestamps", async () => {
    await db("applications").insert({
      id: "app-future",
      profile_id: null,
      agency_id: AGENCY,
      status: "submitted",
      minor_at_submission: false,
      created_at: "2026-07-27 13:00:00",
    });
    await db("application_activities").insert({
      id: "future-agency-activity",
      application_id: "app-signed",
      agency_id: AGENCY,
      user_id: "user-booker",
      activity_type: "note_added",
      metadata: "{}",
      created_at: "2026-07-27 13:00:00",
    });
    await db("interviews").insert({
      id: "future-interview",
      application_id: "app-signed",
      agency_id: AGENCY,
      status: "pending",
      interview_type: "video_call",
      proposed_datetime: "2026-07-27 14:00:00",
      responded_at: null,
      created_at: "2026-07-27 13:00:00",
    });
    await db("reminders").insert({
      id: "future-completion",
      application_id: "app-signed",
      agency_id: AGENCY,
      status: "completed",
      priority: "normal",
      reminder_date: "2026-07-27 14:00:00",
      completed_at: "2026-07-27 13:00:00",
      created_at: daysAgo(2),
    });
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.flow.totalCohort).toBe(3);
      expect(scoped.totals.windowSubmissions).toBe(3);
      expect(scoped.desk.punchTotal).toBe(6);
      expect(scoped.desk.interviews.total).toBe(2);
      expect(scoped.desk.reminders.completedInWindow).toBe(1);
    } finally {
      await db("reminders").where({ id: "future-completion" }).delete();
      await db("interviews").where({ id: "future-interview" }).delete();
      await db("application_activities")
        .where({ id: "future-agency-activity" })
        .delete();
      await db("applications").where({ id: "app-future" }).delete();
    }
  });

  it("summarises interview and reminder operations", () => {
    expect(result.desk.interviews.total).toBe(2);
    expect(result.desk.interviews.acceptRate).toBe(50);
    expect(result.desk.reminders.open).toBe(1);
    expect(result.desk.reminders.overdue).toBe(1);
  });

  it("uses the snoozed deadline for open and completed reminders", async () => {
    await db("reminders").insert([
      {
        id: "r-snoozed-open",
        agency_id: AGENCY,
        application_id: "app-open",
        status: "snoozed",
        priority: "normal",
        reminder_date: daysAgo(10),
        snoozed_until: new Date(NOW.getTime() + DAY_MS).toISOString(),
        completed_at: null,
        created_at: daysAgo(12),
      },
      {
        id: "r-snoozed-complete",
        agency_id: AGENCY,
        application_id: "app-signed",
        status: "completed",
        priority: "normal",
        reminder_date: daysAgo(10),
        snoozed_until: daysAgo(2),
        completed_at: daysAgo(3),
        created_at: daysAgo(12),
      },
    ]);
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.desk.reminders.open).toBe(2);
      expect(scoped.desk.reminders.overdue).toBe(1);
      expect(scoped.desk.reminders.completedInWindow).toBe(2);
      expect(scoped.desk.reminders.onTimeRate).toBe(100);
    } finally {
      await db("reminders")
        .whereIn("id", ["r-snoozed-open", "r-snoozed-complete"])
        .delete();
    }
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
    expect(result.roster.boardMix).toEqual([
      { board: "Development", count: 2, share: 100 },
      { board: "Main", count: 1, share: 50 },
    ]);
  });

  it("includes agency-private off-platform talent in roster composition", async () => {
    await db("talent_records").insert({
      id: "tr-private",
      agency_id: AGENCY,
      market: "london",
      height_cm: 176,
      date_of_birth: "1999-03-04",
      gender: "female",
      is_minor: false,
      minor_consent_status: "not_required",
    });
    await db("roster_memberships").insert({
      id: "rm-private",
      agency_id: AGENCY,
      profile_id: null,
      talent_record_id: "tr-private",
      board_id: "division-main",
      stage: "main",
      status: "active",
      joined_at: daysAgo(15),
      left_at: null,
    });
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.roster.size).toBe(3);
      expect(scoped.roster.markets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ market: "london", count: 1 }),
        ]),
      );
      expect(scoped.roster.coverage.heights).toBe(3);
    } finally {
      await db("roster_memberships").where({ id: "rm-private" }).delete();
      await db("talent_records").where({ id: "tr-private" }).delete();
    }
  });

  it("preserves a legitimate empty canonical roster", async () => {
    const memberships = await db("roster_memberships");
    const standings = await db("roster_board_standings");
    await db("roster_board_standings").delete();
    await db("roster_memberships").delete();
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.roster.size).toBe(0);
      expect(scoped.meta.rosterIsDerived).toBe(false);
    } finally {
      await db("roster_memberships").insert(memberships);
      await db("roster_board_standings").insert(standings);
    }
  });

  it("compares roster fit against the incoming pipeline on the same axes", () => {
    const runway = result.roster.fit.find((f) => f.axis === "Runway");
    expect(runway.roster).toBe(85); // (80 + 90) / 2
    expect(runway.rosterSample).toBe(2);
    // only p-signed in the window carries fit scores
    expect(runway.pipeline).toBe(80);
    expect(runway.pipelineSample).toBe(1);
  });

  it("returns twelve calendar cohorts independent of the selected range", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 30,
      timeZone: "UTC",
      now: NOW,
    });
    expect(scoped.cohorts).toHaveLength(12);
    expect(scoped.cohorts[0].month).toBe("2025-08");
    expect(scoped.cohorts[11].month).toBe("2026-07");
  });

  it("chunks profile coverage loading for large applicant sets", async () => {
    const profiles = Array.from({ length: 1100 }, (_, index) => ({
      id: `scale-profile-${index}`,
      market: "london",
      height_cm: 175,
    }));
    const applications = profiles.map((profile, index) => ({
      id: `scale-app-${index}`,
      profile_id: profile.id,
      agency_id: AGENCY,
      status: "submitted",
      minor_at_submission: false,
      created_at: daysAgo(1),
    }));
    for (let index = 0; index < profiles.length; index += 200) {
      // eslint-disable-next-line no-await-in-loop
      await db("profiles").insert(profiles.slice(index, index + 200));
      // eslint-disable-next-line no-await-in-loop
      await db("applications").insert(applications.slice(index, index + 200));
    }
    try {
      const scoped = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 30,
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.totals.windowSubmissions).toBe(1101);
      expect(scoped.roster.coverage.pipelineSize).toBe(1101);
      expect(scoped.roster.coverage.pipelineHeights).toBe(1101);
    } finally {
      await db("applications").where("id", "like", "scale-app-%").delete();
      await db("profiles").where("id", "like", "scale-profile-%").delete();
    }
  });

  it("scopes pipeline and linked desk records to a package", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      boardId: "board-commercial",
      now: NOW,
    });
    expect(scoped.meta.boardId).toBe("board-commercial");
    expect(scoped.meta.boardScope).toBe("package");
    expect(scoped.flow.cohort).toBe(1);
    expect(scoped.boards).toHaveLength(1);
    expect(scoped.roster.size).toBe(2);
    expect(scoped.desk.interviews.total).toBe(0);
    expect(scoped.desk.reminders.open).toBe(1);
  });

  it("scopes only the roster lens to a division", async () => {
    const scoped = await buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      boardId: "division-main",
      now: NOW,
    });
    expect(scoped.meta.boardScope).toBe("division");
    expect(scoped.flow.cohort).toBe(2);
    expect(scoped.roster.size).toBe(1);
    expect(scoped.roster.boardMix).toEqual([
      { board: "Main", count: 1, share: 100 },
    ]);
  });

  it("rejects an unknown board instead of failing open to agency-wide data", async () => {
    await expect(buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      boardId: "not-a-board",
      now: NOW,
    })).rejects.toMatchObject({ code: "ANALYTICS_INVALID_BOARD" });
  });

  it("filters minor submissions before aggregation unless permission and consent are current", async () => {
    await db("applications").insert({
      id: "app-minor",
      profile_id: null,
      agency_id: AGENCY,
      status: "submitted",
      match_score: 72,
      minor_at_submission: true,
      guardian_consent_expires_at: "2027-08-01T00:00:00.000Z",
      minor_access_revoked_at: null,
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    });
    await db("board_applications").insert({
      id: "ba-minor",
      board_id: "board-runway",
      application_id: "app-minor",
      match_score: 72,
    });

    try {
      const restricted = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        allowMinorSubmissions: false,
        now: NOW,
      });
      const permitted = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        allowMinorSubmissions: true,
        now: NOW,
      });
      expect(restricted.flow.totalCohort).toBe(3);
      expect(permitted.flow.totalCohort).toBe(4);

      await db("applications")
        .where({ id: "app-minor" })
        .update({ minor_access_revoked_at: daysAgo(1) });
      const revoked = await buildSeasonAnalytics(db, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        allowMinorSubmissions: true,
        now: NOW,
      });
      expect(revoked.flow.totalCohort).toBe(3);
    } finally {
      await db("board_applications").where({ id: "ba-minor" }).delete();
      await db("applications").where({ id: "app-minor" }).delete();
    }
  });

  it("rejects an unsupported range instead of silently changing the request", async () => {
    await expect(buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 7,
      now: NOW,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "ANALYTICS_INVALID_RANGE",
    });
  });

  it("rejects invalid explicit and browser-fallback timezones", async () => {
    await expect(buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      timeZone: "Not/A_Real_Zone",
      now: NOW,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "ANALYTICS_INVALID_TIMEZONE",
    });
    await expect(buildSeasonAnalytics(db, {
      agencyId: AGENCY,
      range: 90,
      requestedTimeZone: "240junk",
      now: NOW,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "ANALYTICS_INVALID_TIMEZONE",
    });
  });

  it("infers package scope and application board links on legacy schemas", async () => {
    const legacyDb = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    try {
      await createSchema(legacyDb, {
        fitScoreTable: "none",
        includeApplicationBoardId: true,
        includeBoardKind: true,
        includeBoardType: false,
      });
      await legacyDb("boards").insert({
        id: "legacy-package",
        agency_id: AGENCY,
        name: "Legacy Client Intake",
        client_name: "Client",
        target_slots: 4,
        is_active: true,
        kind: "division",
      });
      await legacyDb("applications").insert({
        id: "legacy-app",
        profile_id: null,
        agency_id: AGENCY,
        board_id: "legacy-package",
        status: "submitted",
        match_score: 73,
        minor_at_submission: false,
        created_at: daysAgo(2),
      });
      await legacyDb("users").insert({
        id: AGENCY,
        first_name: "Legacy",
        last_name: "Owner",
        email: "legacy@test.local",
      });
      await legacyDb("agency_memberships").insert({
        id: "legacy-membership",
        agency_id: AGENCY,
        user_id: AGENCY,
        membership_role: "OWNER",
        status: "active",
      });

      const scoped = await buildSeasonAnalytics(legacyDb, {
        agencyId: AGENCY,
        range: 90,
        boardId: "legacy-package",
        timeZone: "UTC",
        now: NOW,
      });
      expect(scoped.meta.boardScope).toBe("package");
      expect(scoped.meta.boards).toEqual([
        expect.objectContaining({ id: "legacy-package", kind: "package" }),
      ]);
      expect(scoped.flow.totalCohort).toBe(1);
      expect(scoped.totals.allTimeSubmissions).toBe(1);
    } finally {
      await legacyDb.destroy();
    }
  });

  it("reads fit scores from the fresh-migration profile layout too", async () => {
    const freshDb = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    try {
      await createSchema(freshDb, { fitScoreTable: "profile" });
      await seed(freshDb, { fitScoreTable: "profile" });
      const freshResult = await buildSeasonAnalytics(freshDb, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      const runway = freshResult.roster.fit.find((row) => row.axis === "Runway");
      expect(runway.roster).toBe(85);
      expect(runway.pipeline).toBe(80);
    } finally {
      await freshDb.destroy();
    }
  });

  it("returns empty fit coverage when neither fit-score layout is present", async () => {
    const fitlessDb = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    try {
      await createSchema(fitlessDb, { fitScoreTable: "none" });
      await seed(fitlessDb, { fitScoreTable: "none" });
      const fitless = await buildSeasonAnalytics(fitlessDb, {
        agencyId: AGENCY,
        range: 90,
        timeZone: "UTC",
        now: NOW,
      });
      expect(fitless.roster.fit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            axis: "Runway",
            roster: null,
            pipeline: null,
            rosterSample: 0,
            pipelineSample: 0,
          }),
        ]),
      );
      expect(fitless.roster.coverage.fit).toBe(0);
      expect(fitless.roster.coverage.pipelineFit).toBe(0);
    } finally {
      await fitlessDb.destroy();
    }
  });
});
