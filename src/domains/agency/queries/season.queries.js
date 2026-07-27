// src/domains/agency/queries/season.queries.js
"use strict";

/**
 * Season analytics — the aggregation behind GET /api/agency/analytics/season.
 *
 * Everything here is a real aggregate over the agency's own rows. Where the
 * data model cannot answer a question (no transition history for an
 * application, no measurements on a profile) the shape carries an explicit
 * `sample` / `coverage` count instead of a guessed number, so the surface can
 * say what it does not know rather than drawing a confident empty chart.
 *
 * Volumes are per-agency and small, so rows are fetched once and folded in JS
 * (the same approach the legacy /api/agency/analytics handler takes) rather
 * than issuing per-bucket SQL that would have to branch on SQLite vs Postgres.
 */

const {
  mapApplicationStatusToCastingStage,
} = require("../routes/casting-stage-helpers");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Forward pipeline. `Passed` is an exit lane, never a forward step. */
const FORWARD_STAGES = ["Applied", "Shortlisted", "Offered", "Represented"];
const EXIT_STAGE = "Passed";

const ALLOWED_RANGES = [30, 90, 365, 730];
const DEFAULT_RANGE = 90;

/** Application statuses that put talent on the roster (mirrors roster-memberships service). */
const REPRESENTED_STATUSES = ["accepted", "booked", "represented"];

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value, places = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function share(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * `YYYY-MM-DD` in the viewer's offset, so day buckets match the desk's
 * calendar. `offsetMinutes` is minutes east of UTC — the client sends
 * `-new Date().getTimezoneOffset()`, so New York is -300 and it is added.
 */
function localDayKey(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function localMonthKey(date, offsetMinutes) {
  return localDayKey(date, offsetMinutes).slice(0, 7);
}

/** ISO-ish week key anchored to the Monday of the local week. */
function localWeekKey(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const dow = (shifted.getUTCDay() + 6) % 7; // Monday = 0
  shifted.setUTCDate(shifted.getUTCDate() - dow);
  return shifted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Range + bucket planning
// ---------------------------------------------------------------------------

function resolveRange(requested) {
  const parsed = parseInt(requested, 10);
  return ALLOWED_RANGES.includes(parsed) ? parsed : DEFAULT_RANGE;
}

/**
 * Daily buckets stay readable to about four months; past that the series is
 * rolled up so the chart never renders 700 one-pixel columns.
 */
function resolveGranularity(rangeDays) {
  if (rangeDays <= 120) return "day";
  if (rangeDays <= 400) return "week";
  return "month";
}

function bucketKey(date, granularity, offsetMinutes) {
  if (granularity === "month") return localMonthKey(date, offsetMinutes);
  if (granularity === "week") return localWeekKey(date, offsetMinutes);
  return localDayKey(date, offsetMinutes);
}

function enumerateBuckets(start, end, granularity, offsetMinutes) {
  const keys = [];
  const seen = new Set();
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const key = bucketKey(cursor, granularity, offsetMinutes);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  const endKey = bucketKey(end, granularity, offsetMinutes);
  if (!seen.has(endKey)) keys.push(endKey);
  return keys;
}

// ---------------------------------------------------------------------------
// Stage journey replay
// ---------------------------------------------------------------------------

/**
 * Replays every recorded `status_change` for one application and returns the
 * journey we can actually evidence:
 *
 *   reachedIndex  furthest forward stage index the application is known to have held
 *   exitedFrom    stage index it was sitting in when it crossed to Passed (null if it didn't)
 *   dwell         [{ stageIndex, days }] time held in a stage before leaving it
 *   firstTouchAt  first recorded agency action on the application
 *
 * Applications with no activity rows still yield a journey from their current
 * status — we just cannot time it, which is what `dwell: []` means.
 */
function replayJourney(application, activities) {
  const createdAt = toDate(application.created_at);
  const currentStage = mapApplicationStatusToCastingStage(application.status);
  const journey = {
    reachedIndex: 0,
    exitedFrom: null,
    exitedAt: null,
    dwell: [],
    signedAt: null,
    firstTouchAt: null,
  };
  if (!createdAt) return journey;

  const currentIndex = FORWARD_STAGES.indexOf(currentStage);
  if (currentIndex > 0) journey.reachedIndex = currentIndex;

  let stage = "Applied";
  let stageIndex = 0;
  let enteredAt = createdAt;

  for (const activity of activities) {
    const at = toDate(activity.created_at);
    if (!at) continue;
    if (!journey.firstTouchAt || at < journey.firstTouchAt) {
      journey.firstTouchAt = at;
    }
    if (activity.activity_type !== "status_change") continue;

    const metadata = parseJson(activity.metadata);
    if (!metadata.new_status) continue;

    const nextStage = mapApplicationStatusToCastingStage(metadata.new_status);
    if (nextStage === stage) continue;

    const nextIndex = FORWARD_STAGES.indexOf(nextStage);
    journey.dwell.push({
      stageIndex,
      days: (at.getTime() - enteredAt.getTime()) / DAY_MS,
    });

    if (nextStage === EXIT_STAGE) {
      journey.exitedFrom = stageIndex;
      journey.exitedAt = at;
    } else if (nextIndex >= 0) {
      if (nextIndex > journey.reachedIndex) journey.reachedIndex = nextIndex;
      if (nextStage === "Represented" && !journey.signedAt) {
        journey.signedAt = at;
      }
    }

    stage = nextStage;
    stageIndex = nextIndex >= 0 ? nextIndex : stageIndex;
    enteredAt = at;
  }

  // No transition history but a terminal status still tells us the outcome.
  if (currentStage === EXIT_STAGE && journey.exitedFrom == null) {
    journey.exitedFrom = journey.reachedIndex;
    journey.exitedAt = toDate(application.declined_at) || toDate(application.updated_at);
  }
  if (currentStage === "Represented" && !journey.signedAt) {
    journey.signedAt = toDate(application.accepted_at) || toDate(application.updated_at);
  }

  journey.currentStage = currentStage;
  journey.stageIndex = stageIndex;
  journey.enteredCurrentStageAt = enteredAt;
  return journey;
}

/** The outcome label a submission carries in the volume chart. */
function journeyOutcome(journey) {
  if (journey.currentStage === EXIT_STAGE) return "passed";
  return ["applied", "shortlisted", "offered", "signed"][journey.reachedIndex] || "applied";
}

// ---------------------------------------------------------------------------
// Row loading
// ---------------------------------------------------------------------------

async function tableExists(knex, name) {
  try {
    return await knex.schema.hasTable(name);
  } catch {
    return false;
  }
}

async function loadRows(knex, agencyId, windowStart) {
  const [
    applications,
    boards,
    boardApplications,
    activities,
    interviews,
    reminders,
    memberships,
    hasRosterTable,
  ] = await Promise.all([
    knex("applications")
      .where({ agency_id: agencyId })
      .select(
        "id",
        "profile_id",
        "status",
        "board_id",
        "match_score",
        "created_at",
        "updated_at",
        "viewed_at",
        "accepted_at",
        "declined_at",
      ),
    knex("boards")
      .where({ agency_id: agencyId })
      .select("id", "name", "client_name", "target_slots", "is_active", "closes_at"),
    knex("board_applications as ba")
      .join("applications as a", "a.id", "ba.application_id")
      .where("a.agency_id", agencyId)
      .select(
        "ba.board_id",
        "ba.application_id",
        "ba.match_score",
      ),
    knex("application_activities")
      .where({ agency_id: agencyId })
      .select("application_id", "user_id", "activity_type", "metadata", "created_at")
      .orderBy("created_at", "asc"),
    knex("interviews")
      .where({ agency_id: agencyId })
      .select("status", "interview_type", "proposed_datetime", "responded_at", "created_at"),
    knex("reminders")
      .where({ agency_id: agencyId })
      .select("status", "priority", "reminder_date", "completed_at", "created_at"),
    knex("agency_memberships as m")
      .leftJoin("users as u", "u.id", "m.user_id")
      .where("m.agency_id", agencyId)
      .select(
        "m.user_id",
        "m.membership_role",
        "m.status",
        "u.first_name",
        "u.last_name",
        "u.email",
      ),
    tableExists(knex, "roster_memberships"),
  ]);

  let roster = [];
  if (hasRosterTable) {
    roster = await knex("roster_memberships")
      .where({ agency_id: agencyId })
      .select(
        "id",
        "profile_id",
        "talent_record_id",
        "board_id",
        "stage",
        "status",
        "joined_at",
        "left_at",
      );
  }

  // Roster fallback for environments still deriving membership from
  // applications (pre roster_memberships). Same definition the legacy
  // analytics endpoint used, so the two never disagree.
  if (!roster.length) {
    roster = applications
      .filter((a) => REPRESENTED_STATUSES.includes(a.status))
      .map((a) => ({
        id: `derived:${a.id}`,
        profile_id: a.profile_id,
        talent_record_id: null,
        board_id: a.board_id,
        stage: "main",
        status: "active",
        joined_at: a.accepted_at || a.updated_at || a.created_at,
        left_at: null,
        derived: true,
      }));
  }

  const rosterProfileIds = roster.map((r) => r.profile_id).filter(Boolean);
  const applicantProfileIds = applications
    .filter((a) => toDate(a.created_at) >= windowStart)
    .map((a) => a.profile_id)
    .filter(Boolean);
  const profileIds = [...new Set([...rosterProfileIds, ...applicantProfileIds])];

  const profiles = profileIds.length
    ? await knex("profiles")
        .whereIn("id", profileIds)
        .select(
          "id",
          "city",
          "market",
          "height_cm",
          "date_of_birth",
          "gender",
          "experience_level",
          "archetype",
          "fit_score_runway",
          "fit_score_editorial",
          "fit_score_commercial",
          "fit_score_lifestyle",
          "fit_score_swim_fitness",
        )
    : [];

  return {
    applications,
    boards,
    boardApplications,
    activities,
    interviews,
    reminders,
    memberships,
    roster,
    profiles,
    rosterIsDerived: !hasRosterTable,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildFlow(journeys) {
  const reached = FORWARD_STAGES.map(() => 0);
  const exited = FORWARD_STAGES.map(() => 0);
  const dwellByStage = FORWARD_STAGES.map(() => []);

  journeys.forEach(({ journey }) => {
    for (let i = 0; i <= journey.reachedIndex; i += 1) reached[i] += 1;
    if (journey.exitedFrom != null) exited[journey.exitedFrom] += 1;
    journey.dwell.forEach(({ stageIndex, days }) => {
      if (dwellByStage[stageIndex]) dwellByStage[stageIndex].push(days);
    });
  });

  const stages = FORWARD_STAGES.map((stage, i) => {
    const advanced = i + 1 < FORWARD_STAGES.length ? reached[i + 1] : 0;
    const lost = exited[i];
    const held = Math.max(0, reached[i] - advanced - lost);
    const dwell = dwellByStage[i];
    return {
      stage,
      index: i,
      reached: reached[i],
      advanced,
      exited: lost,
      held,
      conversion: i + 1 < FORWARD_STAGES.length ? share(advanced, reached[i]) : null,
      medianDwellDays: round(median(dwell)),
      dwellSample: dwell.length,
    };
  });

  return {
    stages,
    cohort: journeys.length,
    signed: reached[FORWARD_STAGES.length - 1],
    exited: exited.reduce((sum, v) => sum + v, 0),
    open: stages.reduce((sum, s) => sum + s.held, 0),
  };
}

function buildVolume(journeys, buckets, granularity, offsetMinutes) {
  const empty = () => ({
    applied: 0,
    shortlisted: 0,
    offered: 0,
    signed: 0,
    passed: 0,
    total: 0,
  });
  const index = new Map(buckets.map((key) => [key, { bucket: key, ...empty() }]));

  journeys.forEach(({ application, journey }) => {
    const createdAt = toDate(application.created_at);
    if (!createdAt) return;
    const key = bucketKey(createdAt, granularity, offsetMinutes);
    const row = index.get(key);
    if (!row) return;
    row[journeyOutcome(journey)] += 1;
    row.total += 1;
  });

  const series = buckets.map((key) => index.get(key));

  // Trailing average over the equivalent of a week, so the shape of the
  // intake is readable through day-to-day noise.
  const windowSize = granularity === "day" ? 7 : granularity === "week" ? 4 : 3;
  series.forEach((row, i) => {
    const slice = series.slice(Math.max(0, i - windowSize + 1), i + 1);
    row.trend = round(mean(slice.map((s) => s.total)), 2);
  });

  return { granularity, windowSize, series };
}

const QUEUE_BUCKETS = [
  { key: "0-2", label: "Under 2 days", min: 0, max: 2 },
  { key: "3-7", label: "3 – 7 days", min: 2, max: 7 },
  { key: "8-14", label: "8 – 14 days", min: 7, max: 14 },
  { key: "15-30", label: "15 – 30 days", min: 14, max: 30 },
  { key: "30+", label: "Over 30 days", min: 30, max: Infinity },
];

function buildQueue(openJourneys, now) {
  const buckets = QUEUE_BUCKETS.map((b) => ({ ...b, count: 0, unviewed: 0 }));
  const ages = [];
  let unviewed = 0;
  let oldest = 0;

  openJourneys.forEach(({ application, journey, lastTouchAt }) => {
    const since = lastTouchAt || toDate(application.created_at);
    if (!since) return;
    const days = (now.getTime() - since.getTime()) / DAY_MS;
    ages.push(days);
    if (days > oldest) oldest = days;
    const isUnviewed = !application.viewed_at;
    if (isUnviewed) unviewed += 1;
    const bucket =
      buckets.find((b) => days >= b.min && days < b.max) || buckets[buckets.length - 1];
    bucket.count += 1;
    if (isUnviewed) bucket.unviewed += 1;
    // stage breakdown lives on the bucket so the bar can split by depth
    const stageKey = FORWARD_STAGES[journey.reachedIndex] || "Applied";
    bucket[stageKey] = (bucket[stageKey] || 0) + 1;
  });

  return {
    buckets: buckets.map(({ min, max, ...rest }) => ({
      ...rest,
      minDays: min,
      maxDays: Number.isFinite(max) ? max : null,
    })),
    total: openJourneys.length,
    unviewed,
    oldestDays: round(oldest),
    medianAgeDays: round(median(ages)),
    stages: FORWARD_STAGES,
  };
}

const CALIBRATION_BINS = [
  { key: "0-39", label: "Under 40", lo: 0, hi: 40 },
  { key: "40-54", label: "40 – 54", lo: 40, hi: 55 },
  { key: "55-69", label: "55 – 69", lo: 55, hi: 70 },
  { key: "70-84", label: "70 – 84", lo: 70, hi: 85 },
  { key: "85-100", label: "85 +", lo: 85, hi: 101 },
];

/**
 * Does the match score predict what the desk actually does? Bins scored
 * submissions and splits each bin by outcome, so an agency can see whether
 * its scoring is calibrated or decorative.
 */
function buildCalibration(journeys, scoreForApplication) {
  const bins = CALIBRATION_BINS.map((b) => ({
    ...b,
    signed: 0,
    advanced: 0,
    open: 0,
    passed: 0,
    total: 0,
  }));
  const signedScores = [];
  const passedScores = [];

  journeys.forEach(({ application, journey }) => {
    const score = scoreForApplication(application);
    if (score == null) return;
    const bin = bins.find((b) => score >= b.lo && score < b.hi);
    if (!bin) return;
    bin.total += 1;
    if (journey.currentStage === EXIT_STAGE) {
      bin.passed += 1;
      passedScores.push(score);
    } else if (journey.reachedIndex === 3) {
      bin.signed += 1;
      signedScores.push(score);
    } else if (journey.reachedIndex > 0) {
      bin.advanced += 1;
    } else {
      bin.open += 1;
    }
  });

  const sample = bins.reduce((sum, b) => sum + b.total, 0);
  bins.forEach((b) => {
    const decided = b.signed + b.advanced + b.passed;
    b.advanceRate = decided ? share(b.signed + b.advanced, decided) : null;
  });

  return {
    bins,
    sample,
    signedAverage: round(mean(signedScores), 0),
    passedAverage: round(mean(passedScores), 0),
    signedSample: signedScores.length,
    passedSample: passedScores.length,
    separation:
      signedScores.length && passedScores.length
        ? round(mean(signedScores) - mean(passedScores), 1)
        : null,
  };
}

function buildBoardPerformance(boards, journeys, boardsForApplication, roster, now) {
  const rosterByBoard = new Map();
  roster
    .filter((r) => r.status === "active" && r.board_id)
    .forEach((r) => {
      rosterByBoard.set(r.board_id, (rosterByBoard.get(r.board_id) || 0) + 1);
    });

  const stats = new Map(
    boards.map((b) => [
      b.id,
      {
        id: b.id,
        name: b.name,
        clientName: b.client_name || null,
        isActive: b.is_active !== false,
        targetSlots: b.target_slots ?? null,
        closesAt: b.closes_at || null,
        daysToClose: b.closes_at
          ? round((toDate(b.closes_at).getTime() - now.getTime()) / DAY_MS, 0)
          : null,
        filled: rosterByBoard.get(b.id) || 0,
        submissions: 0,
        advanced: 0,
        signed: 0,
        passed: 0,
        scores: [],
      },
    ]),
  );

  journeys.forEach(({ application, journey }) => {
    boardsForApplication(application).forEach(({ boardId, score }) => {
      const row = stats.get(boardId);
      if (!row) return;
      row.submissions += 1;
      if (journey.reachedIndex >= 1) row.advanced += 1;
      if (journey.reachedIndex === 3) row.signed += 1;
      if (journey.currentStage === EXIT_STAGE) row.passed += 1;
      if (score != null) row.scores.push(score);
    });
  });

  return [...stats.values()]
    .map(({ scores, ...row }) => ({
      ...row,
      averageMatch: round(mean(scores), 0),
      scoredSubmissions: scores.length,
      advanceRate: share(row.advanced, row.submissions),
      signRate: share(row.signed, row.submissions),
      fillRate: row.targetSlots ? share(row.filled, row.targetSlots) : null,
    }))
    .sort((a, b) => b.submissions - a.submissions);
}

function buildCohorts(journeys, offsetMinutes, monthsBack = 12) {
  const index = new Map();
  journeys.forEach(({ application, journey }) => {
    const createdAt = toDate(application.created_at);
    if (!createdAt) return;
    const key = localMonthKey(createdAt, offsetMinutes);
    if (!index.has(key)) {
      index.set(key, {
        month: key,
        size: 0,
        reached: FORWARD_STAGES.map(() => 0),
        passed: 0,
      });
    }
    const row = index.get(key);
    row.size += 1;
    for (let i = 0; i <= journey.reachedIndex; i += 1) row.reached[i] += 1;
    if (journey.currentStage === EXIT_STAGE) row.passed += 1;
  });

  return [...index.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .slice(-monthsBack)
    .map((row) => ({
      month: row.month,
      size: row.size,
      stages: FORWARD_STAGES.map((stage, i) => ({
        stage,
        count: row.reached[i],
        rate: share(row.reached[i], row.size),
      })),
      passed: row.passed,
    }));
}

function buildDesk(context) {
  const {
    activities,
    windowStart,
    now,
    offsetMinutes,
    journeysById,
    memberships,
    interviews,
    reminders,
  } = context;

  // --- punchcard: when the desk actually works -----------------------------
  const grid = new Map();
  let punchMax = 0;
  let punchTotal = 0;
  const inWindow = activities.filter((a) => {
    const at = toDate(a.created_at);
    return at && at >= windowStart && at <= now;
  });

  inWindow.forEach((activity) => {
    const at = toDate(activity.created_at);
    const shifted = new Date(at.getTime() + offsetMinutes * 60_000);
    const dow = (shifted.getUTCDay() + 6) % 7; // Monday = 0
    const hour = shifted.getUTCHours();
    const key = `${dow}:${hour}`;
    const next = (grid.get(key) || 0) + 1;
    grid.set(key, next);
    if (next > punchMax) punchMax = next;
    punchTotal += 1;
  });

  const punchcard = [];
  for (let dow = 0; dow < 7; dow += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      punchcard.push({ dow, hour, count: grid.get(`${dow}:${hour}`) || 0 });
    }
  }

  // --- response latency ----------------------------------------------------
  const latencyHours = [];
  journeysById.forEach(({ application, journey, createdAt }) => {
    if (!createdAt || createdAt < windowStart) return;
    const touch = journey.firstTouchAt || toDate(application.viewed_at);
    if (!touch) return;
    const hours = (touch.getTime() - createdAt.getTime()) / HOUR_MS;
    if (hours >= 0) latencyHours.push(hours);
  });

  const LATENCY_BUCKETS = [
    { key: "<1h", label: "Under 1 hour", max: 1 },
    { key: "1-4h", label: "1 – 4 hours", max: 4 },
    { key: "4-12h", label: "4 – 12 hours", max: 12 },
    { key: "12-24h", label: "12 – 24 hours", max: 24 },
    { key: "1-3d", label: "1 – 3 days", max: 72 },
    { key: "3-7d", label: "3 – 7 days", max: 168 },
    { key: "7d+", label: "Over a week", max: Infinity },
  ].map((b) => ({ ...b, count: 0 }));

  latencyHours.forEach((hours) => {
    const bucket = LATENCY_BUCKETS.find((b) => hours < b.max);
    if (bucket) bucket.count += 1;
  });

  // --- team ---------------------------------------------------------------
  const memberIndex = new Map(
    memberships.map((m) => [
      m.user_id,
      {
        id: m.user_id,
        name:
          [m.first_name, m.last_name].filter(Boolean).join(" ") ||
          (m.email ? m.email.split("@")[0] : "Team member"),
        role: m.membership_role || null,
        active: m.status === "active",
        decisions: 0,
        notes: 0,
        touches: 0,
      },
    ]),
  );

  inWindow.forEach((activity) => {
    if (!activity.user_id) return;
    const member = memberIndex.get(activity.user_id);
    if (!member) return;
    member.touches += 1;
    if (activity.activity_type === "status_change") member.decisions += 1;
    if (String(activity.activity_type || "").startsWith("note")) member.notes += 1;
  });

  const team = [...memberIndex.values()]
    .filter((m) => m.touches > 0 || m.active)
    .sort((a, b) => b.touches - a.touches);
  const teamTotal = team.reduce((sum, m) => sum + m.touches, 0);
  team.forEach((m) => {
    m.share = share(m.touches, teamTotal);
  });

  // --- interviews ----------------------------------------------------------
  const windowInterviews = interviews.filter((i) => {
    const at = toDate(i.created_at) || toDate(i.proposed_datetime);
    return at && at >= windowStart && at <= now;
  });
  const interviewStatus = (status) =>
    windowInterviews.filter((i) => i.status === status).length;
  const answered = interviewStatus("accepted") + interviewStatus("declined");
  const typeIndex = new Map();
  windowInterviews.forEach((i) => {
    const key = i.interview_type || "unspecified";
    typeIndex.set(key, (typeIndex.get(key) || 0) + 1);
  });
  const leadDays = windowInterviews
    .map((i) => {
      const created = toDate(i.created_at);
      const proposed = toDate(i.proposed_datetime);
      if (!created || !proposed) return null;
      return (proposed.getTime() - created.getTime()) / DAY_MS;
    })
    .filter((v) => v != null && v >= 0);

  // --- reminders -----------------------------------------------------------
  const openReminders = reminders.filter((r) => r.status === "pending");
  const overdue = openReminders.filter((r) => {
    const due = toDate(r.reminder_date);
    return due && due < now;
  });
  const completedInWindow = reminders.filter((r) => {
    const at = toDate(r.completed_at);
    return r.status === "completed" && at && at >= windowStart;
  });
  const onTime = completedInWindow.filter((r) => {
    const due = toDate(r.reminder_date);
    const done = toDate(r.completed_at);
    return due && done && done <= due;
  });

  return {
    punchcard,
    punchMax,
    punchTotal,
    latency: {
      buckets: LATENCY_BUCKETS.map(({ max, ...rest }) => rest),
      sample: latencyHours.length,
      medianHours: round(median(latencyHours)),
      p90Hours: round(percentile(latencyHours, 90)),
    },
    team,
    teamTotal,
    interviews: {
      total: windowInterviews.length,
      pending: interviewStatus("pending"),
      accepted: interviewStatus("accepted"),
      declined: interviewStatus("declined"),
      completed: interviewStatus("completed"),
      cancelled: interviewStatus("cancelled"),
      acceptRate: answered ? share(interviewStatus("accepted"), answered) : null,
      answered,
      medianLeadDays: round(median(leadDays)),
      byType: [...typeIndex.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    },
    reminders: {
      open: openReminders.length,
      overdue: overdue.length,
      completedInWindow: completedInWindow.length,
      onTimeRate: completedInWindow.length
        ? share(onTime.length, completedInWindow.length)
        : null,
    },
  };
}

const HEIGHT_BINS = [
  { key: "<165", label: "Under 165", lo: 0, hi: 165 },
  { key: "165-169", label: "165 – 169", lo: 165, hi: 170 },
  { key: "170-174", label: "170 – 174", lo: 170, hi: 175 },
  { key: "175-179", label: "175 – 179", lo: 175, hi: 180 },
  { key: "180-184", label: "180 – 184", lo: 180, hi: 185 },
  { key: "185+", label: "185 and over", lo: 185, hi: Infinity },
];

const AGE_BINS = [
  { key: "u18", label: "Under 18", lo: 0, hi: 18 },
  { key: "18-21", label: "18 – 21", lo: 18, hi: 22 },
  { key: "22-25", label: "22 – 25", lo: 22, hi: 26 },
  { key: "26-30", label: "26 – 30", lo: 26, hi: 31 },
  { key: "31-40", label: "31 – 40", lo: 31, hi: 41 },
  { key: "41+", label: "41 and over", lo: 41, hi: Infinity },
];

const FIT_AXES = [
  { key: "fit_score_runway", label: "Runway" },
  { key: "fit_score_editorial", label: "Editorial" },
  { key: "fit_score_commercial", label: "Commercial" },
  { key: "fit_score_lifestyle", label: "Lifestyle" },
  { key: "fit_score_swim_fitness", label: "Swim / fitness" },
];

function ageFromDob(value, now) {
  const dob = toDate(value);
  if (!dob) return null;
  const years = (now.getTime() - dob.getTime()) / (365.2425 * DAY_MS);
  return years > 0 && years < 120 ? years : null;
}

function binCounts(bins, values) {
  const counts = bins.map((b) => ({ ...b, count: 0 }));
  values.forEach((value) => {
    const bin = counts.find((b) => value >= b.lo && value < b.hi);
    if (bin) bin.count += 1;
  });
  return counts;
}

function buildRoster(context) {
  const { roster, profiles, boards, now, offsetMinutes, pipelineProfileIds } = context;

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const active = roster.filter((r) => r.status === "active");

  // --- twelve months of joins and departures -------------------------------
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const anchor = new Date(now.getTime());
    anchor.setUTCMonth(anchor.getUTCMonth() - i, 1);
    months.push(localMonthKey(anchor, offsetMinutes));
  }
  const growth = months.map((month) => ({ month, joined: 0, left: 0, total: 0 }));
  const growthIndex = new Map(growth.map((row) => [row.month, row]));

  roster.forEach((r) => {
    const joined = toDate(r.joined_at);
    if (joined) {
      const row = growthIndex.get(localMonthKey(joined, offsetMinutes));
      if (row) row.joined += 1;
    }
    const left = toDate(r.left_at);
    if (left) {
      const row = growthIndex.get(localMonthKey(left, offsetMinutes));
      if (row) row.left += 1;
    }
  });

  growth.forEach((row) => {
    const monthEnd = new Date(`${row.month}-01T00:00:00.000Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    row.total = roster.filter((r) => {
      const joined = toDate(r.joined_at);
      const left = toDate(r.left_at);
      if (!joined || joined >= monthEnd) return false;
      return !left || left >= monthEnd;
    }).length;
    row.net = row.joined - row.left;
  });

  // --- composition ---------------------------------------------------------
  const stageIndex = new Map();
  const boardMix = new Map();
  const marketIndex = new Map();
  const experienceIndex = new Map();
  const rosterHeights = [];
  const rosterAges = [];
  const tenureMonths = [];
  const fitTotals = FIT_AXES.map(() => []);

  active.forEach((r) => {
    const stage = r.stage || "main";
    stageIndex.set(stage, (stageIndex.get(stage) || 0) + 1);

    const boardName = r.board_id ? boardById.get(r.board_id)?.name : null;
    const boardKey = boardName || "Unassigned";
    boardMix.set(boardKey, (boardMix.get(boardKey) || 0) + 1);

    const joined = toDate(r.joined_at);
    if (joined) tenureMonths.push((now.getTime() - joined.getTime()) / (30.44 * DAY_MS));

    const profile = r.profile_id ? profileById.get(r.profile_id) : null;
    if (!profile) return;

    const market = profile.market || profile.city;
    if (market) marketIndex.set(market, (marketIndex.get(market) || 0) + 1);
    if (profile.experience_level) {
      experienceIndex.set(
        profile.experience_level,
        (experienceIndex.get(profile.experience_level) || 0) + 1,
      );
    }
    if (profile.height_cm) rosterHeights.push(Number(profile.height_cm));
    const age = ageFromDob(profile.date_of_birth, now);
    if (age != null) rosterAges.push(age);
    FIT_AXES.forEach((axis, i) => {
      const value = profile[axis.key];
      if (value != null) fitTotals[i].push(Number(value));
    });
  });

  // --- the incoming pipeline, measured the same way ------------------------
  const pipelineHeights = [];
  const pipelineAges = [];
  const pipelineFit = FIT_AXES.map(() => []);
  pipelineProfileIds.forEach((id) => {
    const profile = profileById.get(id);
    if (!profile) return;
    if (profile.height_cm) pipelineHeights.push(Number(profile.height_cm));
    const age = ageFromDob(profile.date_of_birth, now);
    if (age != null) pipelineAges.push(age);
    FIT_AXES.forEach((axis, i) => {
      const value = profile[axis.key];
      if (value != null) pipelineFit[i].push(Number(value));
    });
  });

  const rosterHeightBins = binCounts(HEIGHT_BINS, rosterHeights);
  const pipelineHeightBins = binCounts(HEIGHT_BINS, pipelineHeights);
  const rosterAgeBins = binCounts(AGE_BINS, rosterAges);
  const pipelineAgeBins = binCounts(AGE_BINS, pipelineAges);

  const TENURE_BINS = [
    { key: "0-3", label: "Under 3 months", lo: 0, hi: 3 },
    { key: "3-6", label: "3 – 6 months", lo: 3, hi: 6 },
    { key: "6-12", label: "6 – 12 months", lo: 6, hi: 12 },
    { key: "12-24", label: "1 – 2 years", lo: 12, hi: 24 },
    { key: "24+", label: "Over 2 years", lo: 24, hi: Infinity },
  ];

  const rosterSize = active.length;

  return {
    size: rosterSize,
    everSize: roster.length,
    departed: roster.filter((r) => r.status !== "active").length,
    growth,
    stages: [...stageIndex.entries()]
      .map(([stage, count]) => ({ stage, count, share: share(count, rosterSize) }))
      .sort((a, b) => b.count - a.count),
    boardMix: [...boardMix.entries()]
      .map(([board, count]) => ({ board, count, share: share(count, rosterSize) }))
      .sort((a, b) => b.count - a.count),
    markets: [...marketIndex.entries()]
      .map(([market, count]) => ({ market, count, share: share(count, rosterSize) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    experience: [...experienceIndex.entries()]
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => b.count - a.count),
    tenure: binCounts(TENURE_BINS, tenureMonths).map(({ lo, hi, ...rest }) => rest),
    heights: HEIGHT_BINS.map(({ lo, hi, ...bin }, i) => ({
      ...bin,
      roster: rosterHeightBins[i].count,
      pipeline: pipelineHeightBins[i].count,
    })),
    ages: AGE_BINS.map(({ lo, hi, ...bin }, i) => ({
      ...bin,
      roster: rosterAgeBins[i].count,
      pipeline: pipelineAgeBins[i].count,
    })),
    fit: FIT_AXES.map((axis, i) => ({
      axis: axis.label,
      roster: round(mean(fitTotals[i]), 0),
      pipeline: round(mean(pipelineFit[i]), 0),
      rosterSample: fitTotals[i].length,
      pipelineSample: pipelineFit[i].length,
    })),
    coverage: {
      heights: rosterHeights.length,
      ages: rosterAges.length,
      markets: [...marketIndex.values()].reduce((sum, v) => sum + v, 0),
      fit: fitTotals[0].length,
      pipelineHeights: pipelineHeights.length,
      pipelineFit: pipelineFit[0].length,
      pipelineSize: pipelineProfileIds.size,
    },
  };
}

function buildSignals(current, previous, slices) {
  const signal = (key, label, value, previousValue, options = {}) => ({
    key,
    label,
    value,
    previous: previousValue,
    delta:
      value != null && previousValue != null ? round(value - previousValue, 1) : null,
    deltaPercent:
      value != null && previousValue ? share(value - previousValue, previousValue) : null,
    // The tile's spark is the same metric measured over equal slices of the
    // window — a real sub-series, not a decorative squiggle.
    series: slices.map((slice) => slice[options.metric || key] ?? null),
    ...options,
  });

  return [
    signal("submissions", "Submissions", current.submissions, previous.submissions, {
      unit: "count",
      goodDirection: "up",
    }),
    signal("advanceRate", "Advance rate", current.advanceRate, previous.advanceRate, {
      unit: "percent",
      goodDirection: "up",
      note: "Share of submissions that moved past Applied",
    }),
    signal("signed", "Signed", current.signed, previous.signed, {
      unit: "count",
      goodDirection: "up",
    }),
    signal(
      "firstResponse",
      "Median first response",
      current.firstResponseHours,
      previous.firstResponseHours,
      {
        unit: "hours",
        goodDirection: "down",
        sample: current.firstResponseSample,
        metric: "firstResponseHours",
      },
    ),
    signal(
      "timeToSign",
      "Median time to sign",
      current.timeToSignDays,
      previous.timeToSignDays,
      {
        unit: "days",
        goodDirection: "down",
        sample: current.timeToSignSample,
        metric: "timeToSignDays",
      },
    ),
    signal("openQueue", "Open from this window", current.open, previous.open, {
      unit: "count",
      goodDirection: "neutral",
      metric: "open",
    }),
  ];
}

/**
 * The window sliced into equal parts, each summarised the same way, so the
 * signal tiles can carry a real sub-series instead of a decorative sparkline.
 */
function buildSignalSlices(journeys, windowStart, windowEnd, count = 12) {
  const span = (windowEnd.getTime() - windowStart.getTime()) / count;
  const slices = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(windowStart.getTime() + i * span);
    const end = new Date(windowStart.getTime() + (i + 1) * span);
    slices.push(windowSummary(journeys, start, end));
  }
  return slices;
}

function windowSummary(journeys, windowStart, windowEnd) {
  const inWindow = journeys.filter(
    ({ createdAt }) => createdAt && createdAt >= windowStart && createdAt < windowEnd,
  );
  const submissions = inWindow.length;
  const advanced = inWindow.filter(({ journey }) => journey.reachedIndex >= 1).length;
  const signedJourneys = journeys.filter(
    ({ journey }) =>
      journey.signedAt && journey.signedAt >= windowStart && journey.signedAt < windowEnd,
  );
  const firstResponse = inWindow
    .map(({ application, journey, createdAt }) => {
      const touch = journey.firstTouchAt || toDate(application.viewed_at);
      if (!touch || !createdAt) return null;
      const hours = (touch.getTime() - createdAt.getTime()) / HOUR_MS;
      return hours >= 0 ? hours : null;
    })
    .filter((v) => v != null);
  const timeToSign = signedJourneys
    .map(({ journey, createdAt }) =>
      createdAt && journey.signedAt
        ? (journey.signedAt.getTime() - createdAt.getTime()) / DAY_MS
        : null,
    )
    .filter((v) => v != null && v >= 0);

  return {
    submissions,
    advanceRate: share(advanced, submissions),
    signed: signedJourneys.length,
    open: inWindow.filter(
      ({ journey }) =>
        journey.currentStage !== EXIT_STAGE && journey.reachedIndex < 3,
    ).length,
    firstResponseHours: round(median(firstResponse)),
    firstResponseSample: firstResponse.length,
    timeToSignDays: round(median(timeToSign)),
    timeToSignSample: timeToSign.length,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {import("knex")} knex
 * @param {object} options
 * @param {string} options.agencyId
 * @param {number|string} [options.range] one of 30 / 90 / 365 / 730
 * @param {string|null} [options.boardId] scope every section to one board
 * @param {number} [options.tzOffsetMinutes] viewer offset, so day/hour buckets
 *   line up with the desk's own calendar rather than UTC
 * @param {Date} [options.now] injectable clock for tests
 */
async function buildSeasonAnalytics(knex, options) {
  const {
    agencyId,
    range,
    boardId = null,
    tzOffsetMinutes = 0,
    now = new Date(),
  } = options;

  const rangeDays = resolveRange(range);
  const offsetMinutes = Math.max(-840, Math.min(840, Number(tzOffsetMinutes) || 0));
  const windowStart = new Date(now.getTime() - rangeDays * DAY_MS);
  const previousStart = new Date(now.getTime() - 2 * rangeDays * DAY_MS);

  const rows = await loadRows(knex, agencyId, previousStart);

  // --- board scoping -------------------------------------------------------
  const boardLinks = new Map();
  rows.boardApplications.forEach((link) => {
    if (!boardLinks.has(link.application_id)) boardLinks.set(link.application_id, []);
    boardLinks.get(link.application_id).push({
      boardId: link.board_id,
      score: link.match_score == null ? null : Number(link.match_score),
    });
  });
  const boardsForApplication = (application) => {
    const links = boardLinks.get(application.id) || [];
    if (links.length) return links;
    if (application.board_id) {
      return [
        {
          boardId: application.board_id,
          score:
            application.match_score == null ? null : Number(application.match_score),
        },
      ];
    }
    return [];
  };
  const scoreForApplication = (application) => {
    if (application.match_score != null) return Number(application.match_score);
    const scores = boardsForApplication(application)
      .map((l) => l.score)
      .filter((s) => s != null);
    return scores.length ? Math.max(...scores) : null;
  };

  const activeBoardId =
    boardId && rows.boards.some((b) => b.id === boardId) ? boardId : null;

  const scopedApplications = activeBoardId
    ? rows.applications.filter((a) =>
        boardsForApplication(a).some((l) => l.boardId === activeBoardId),
      )
    : rows.applications;

  // --- journeys ------------------------------------------------------------
  const activitiesByApplication = new Map();
  rows.activities.forEach((activity) => {
    if (!activitiesByApplication.has(activity.application_id)) {
      activitiesByApplication.set(activity.application_id, []);
    }
    activitiesByApplication.get(activity.application_id).push(activity);
  });

  const allJourneys = scopedApplications.map((application) => ({
    application,
    createdAt: toDate(application.created_at),
    journey: replayJourney(
      application,
      activitiesByApplication.get(application.id) || [],
    ),
    lastTouchAt: (() => {
      const list = activitiesByApplication.get(application.id);
      if (!list || !list.length) return null;
      return toDate(list[list.length - 1].created_at);
    })(),
  }));

  const windowJourneys = allJourneys.filter(
    ({ createdAt }) => createdAt && createdAt >= windowStart,
  );

  // Open work is a live queue — it is never bounded by the reporting window,
  // because a submission that has sat untouched for 200 days is exactly the
  // one a booker needs to see.
  const openJourneys = allJourneys.filter(
    ({ journey }) => journey.currentStage !== EXIT_STAGE && journey.reachedIndex < 3,
  );

  const buckets = enumerateBuckets(
    windowStart,
    now,
    resolveGranularity(rangeDays),
    offsetMinutes,
  );

  const scopedActivityIds = new Set(scopedApplications.map((a) => a.id));
  const scopedActivities = activeBoardId
    ? rows.activities.filter((a) => scopedActivityIds.has(a.application_id))
    : rows.activities;

  const pipelineProfileIds = new Set(
    windowJourneys.map(({ application }) => application.profile_id).filter(Boolean),
  );

  const scopedRoster = activeBoardId
    ? rows.roster.filter((r) => r.board_id === activeBoardId)
    : rows.roster;

  const current = windowSummary(allJourneys, windowStart, now);
  const previous = windowSummary(allJourneys, previousStart, windowStart);

  return {
    meta: {
      range: rangeDays,
      allowedRanges: ALLOWED_RANGES,
      granularity: resolveGranularity(rangeDays),
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      generatedAt: now.toISOString(),
      tzOffsetMinutes: offsetMinutes,
      boardId: activeBoardId,
      boards: rows.boards
        .map((b) => ({
          id: b.id,
          name: b.name,
          clientName: b.client_name || null,
          isActive: b.is_active !== false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      stages: FORWARD_STAGES,
      exitStage: EXIT_STAGE,
      rosterIsDerived: rows.rosterIsDerived,
    },
    signals: buildSignals(
      current,
      previous,
      buildSignalSlices(allJourneys, windowStart, now),
    ),
    flow: buildFlow(windowJourneys),
    volume: buildVolume(
      windowJourneys,
      buckets,
      resolveGranularity(rangeDays),
      offsetMinutes,
    ),
    queue: buildQueue(openJourneys, now),
    calibration: buildCalibration(windowJourneys, scoreForApplication),
    boards: buildBoardPerformance(
      activeBoardId
        ? rows.boards.filter((b) => b.id === activeBoardId)
        : rows.boards,
      windowJourneys,
      boardsForApplication,
      rows.roster,
      now,
    ),
    cohorts: buildCohorts(
      allJourneys.filter(({ createdAt }) => createdAt && createdAt >= previousStart),
      offsetMinutes,
    ),
    desk: buildDesk({
      activities: scopedActivities,
      windowStart,
      now,
      offsetMinutes,
      journeysById: allJourneys,
      memberships: rows.memberships,
      interviews: rows.interviews,
      reminders: rows.reminders,
    }),
    roster: buildRoster({
      roster: scopedRoster,
      profiles: rows.profiles,
      boards: rows.boards,
      now,
      offsetMinutes,
      pipelineProfileIds,
    }),
    totals: {
      allTimeSubmissions: scopedApplications.length,
      windowSubmissions: windowJourneys.length,
      activitiesObserved: scopedActivities.length,
      scoredSubmissions: windowJourneys.filter(
        ({ application }) => scoreForApplication(application) != null,
      ).length,
    },
  };
}

module.exports = {
  buildSeasonAnalytics,
  // exported for tests
  ALLOWED_RANGES,
  FORWARD_STAGES,
  EXIT_STAGE,
  replayJourney,
  buildFlow,
  buildQueue,
  buildCalibration,
  resolveGranularity,
  enumerateBuckets,
};
