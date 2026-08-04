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
const {
  applyMinorSubmissionFilter,
} = require("../services/minor-submission-access");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Forward pipeline. `Passed` is an exit lane, never a forward step. */
const FORWARD_STAGES = ["Applied", "Shortlisted", "Offered", "Represented"];
const EXIT_STAGE = "Passed";

const ALLOWED_RANGES = [30, 90, 365, 730];
const DEFAULT_RANGE = 90;
const DEFAULT_TIME_ZONE = "UTC";
const CLOSED_STAGES = new Set(["Passed", "Kept on file", "Withdrawn"]);
const CLOSED_APPLICATION_STATUSES = [
  "passed",
  "declined",
  "archived",
  "kept_on_file",
  "withdrawn",
];
const FIT_SCORE_COLUMNS = [
  "fit_score_runway",
  "fit_score_editorial",
  "fit_score_commercial",
  "fit_score_lifestyle",
  "fit_score_swim_fitness",
];

/** Application statuses that put talent on the roster (mirrors roster-memberships service). */
const REPRESENTED_STATUSES = ["accepted", "booked", "represented"];

class AnalyticsInputError extends Error {
  constructor(message, code = "ANALYTICS_INVALID_BOARD") {
    super(message);
    this.name = "AnalyticsInputError";
    this.code = code;
    this.statusCode = 400;
  }
}

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
  // SQLite CURRENT_TIMESTAMP is UTC but is returned without a zone suffix.
  // Node otherwise interprets it in the server's local timezone.
  const normalized =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const date = value instanceof Date ? value : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dbBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function earliestDate(...values) {
  return values
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => a - b)[0] || null;
}

function latestDate(...values) {
  return values
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
}

function latestDateAtOrBefore(cutoff, ...values) {
  return values
    .map(toDate)
    .filter((date) => date && date <= cutoff)
    .sort((a, b) => b - a)[0] || null;
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

function validTimeZone(value) {
  if (!value || typeof value !== "string" || value.length > 100) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return null;
  }
}

function resolveTimeZoneInput(value, label) {
  if (value == null || value === "") return null;
  const resolved = validTimeZone(value);
  if (!resolved) {
    throw new AnalyticsInputError(
      `${label} must be a valid IANA timezone`,
      "ANALYTICS_INVALID_TIMEZONE",
    );
  }
  return resolved;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** `YYYY-MM-DD` in the agency's IANA timezone, including historical DST. */
function localDayKey(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMonthKey(date, timeZone) {
  return localDayKey(date, timeZone).slice(0, 7);
}

/** ISO-ish week key anchored to Monday in the agency's local calendar. */
function localWeekKey(date, timeZone) {
  const dayKey = localDayKey(date, timeZone);
  const localDate = new Date(`${dayKey}T12:00:00.000Z`);
  const dow = (localDate.getUTCDay() + 6) % 7; // Monday = 0
  localDate.setUTCDate(localDate.getUTCDate() - dow);
  return localDate.toISOString().slice(0, 10);
}

function localDowAndHour(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    parts.weekday,
  );
  return { dow: Math.max(0, dow), hour: Number(parts.hour) };
}

// ---------------------------------------------------------------------------
// Range + bucket planning
// ---------------------------------------------------------------------------

function resolveRange(requested) {
  if (requested == null || requested === "") return DEFAULT_RANGE;
  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || !ALLOWED_RANGES.includes(parsed)) {
    throw new AnalyticsInputError(
      "range must be one of 30, 90, 365, or 730",
      "ANALYTICS_INVALID_RANGE",
    );
  }
  return parsed;
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

function bucketKey(date, granularity, timeZone) {
  if (granularity === "month") return localMonthKey(date, timeZone);
  if (granularity === "week") return localWeekKey(date, timeZone);
  return localDayKey(date, timeZone);
}

function enumerateBuckets(start, end, granularity, timeZone = DEFAULT_TIME_ZONE) {
  const keys = [];
  const seen = new Set();
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const key = bucketKey(cursor, granularity, timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  const endKey = bucketKey(end, granularity, timeZone);
  if (!seen.has(endKey)) keys.push(endKey);
  return keys;
}

// ---------------------------------------------------------------------------
// Stage journey replay
// ---------------------------------------------------------------------------

function analyticsStageForStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "kept_on_file":
      return "Kept on file";
    case "withdrawn":
      return "Withdrawn";
    case "booked":
      return "Represented";
    default:
      return mapApplicationStatusToCastingStage(status);
  }
}

function isClosedStage(stage) {
  return CLOSED_STAGES.has(stage);
}

function exitKey(stage) {
  if (stage === "Kept on file") return "keptOnFile";
  if (stage === "Withdrawn") return "withdrawn";
  return "passed";
}

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
function replayJourney(application, activities, agencyActorIds = null) {
  const createdAt = toDate(application.created_at);
  const currentStage = analyticsStageForStatus(application.status);
  const journey = {
    reachedIndex: 0,
    reachedStages: FORWARD_STAGES.map((_, index) => index === 0),
    transitions: [],
    exitedFrom: null,
    exitKind: null,
    exitedAt: null,
    dwell: [],
    signedAt: null,
    firstTouchAt: null,
  };
  if (!createdAt) return journey;

  const currentIndex = FORWARD_STAGES.indexOf(currentStage);
  if (currentIndex > 0) {
    journey.reachedIndex = currentIndex;
    journey.reachedStages[currentIndex] = true;
  }

  let stage = "Applied";
  let stageIndex = 0;
  let enteredAt = createdAt;

  for (const activity of activities) {
    if (
      agencyActorIds &&
      (!activity.user_id || !agencyActorIds.has(activity.user_id))
    ) {
      continue;
    }
    const at = toDate(activity.created_at);
    if (!at) continue;
    if (!journey.firstTouchAt || at < journey.firstTouchAt) {
      journey.firstTouchAt = at;
    }
    if (activity.activity_type !== "status_change") continue;

    const metadata = parseJson(activity.metadata);
    if (!metadata.new_status) continue;

    const nextStage = analyticsStageForStatus(metadata.new_status);
    if (nextStage === stage) continue;

    const nextIndex = FORWARD_STAGES.indexOf(nextStage);
    if (stageIndex >= 0) {
      journey.dwell.push({
        stageIndex,
        days: (at.getTime() - enteredAt.getTime()) / DAY_MS,
      });
    }

    if (isClosedStage(nextStage)) {
      journey.exitedFrom = stageIndex;
      journey.exitKind = exitKey(nextStage);
      journey.exitedAt = at;
    } else if (nextIndex >= 0) {
      if (nextIndex > journey.reachedIndex) journey.reachedIndex = nextIndex;
      journey.reachedStages[nextIndex] = true;
      journey.transitions.push({
        fromIndex: stageIndex,
        toIndex: nextIndex,
        at,
      });
      if (nextStage === "Represented" && !journey.signedAt) {
        journey.signedAt = at;
      }
    }

    stage = nextStage;
    stageIndex = nextIndex >= 0 ? nextIndex : stageIndex;
    enteredAt = at;
  }

  // No transition history but a terminal status still tells us the outcome.
  if (isClosedStage(currentStage) && journey.exitedFrom == null) {
    journey.exitedFrom = journey.reachedIndex;
    journey.exitKind = exitKey(currentStage);
    journey.exitedAt = toDate(application.declined_at) || toDate(application.updated_at);
  }
  if (currentStage === "Represented" && !journey.signedAt) {
    journey.signedAt = toDate(application.accepted_at) || toDate(application.updated_at);
  }

  journey.currentStage = currentStage;
  journey.stageIndex = currentIndex >= 0 ? currentIndex : stageIndex;
  journey.enteredCurrentStageAt = enteredAt;
  journey.isOpen = currentIndex >= 0 && currentStage !== "Represented";

  // A ribbon is a sequential-flow claim, so only journeys with every adjacent
  // hand-off evidenced may enter it. Current status can prove an outcome, but
  // it cannot prove the intermediate hand-offs used to reach that outcome.
  const terminalIndex = currentIndex >= 0 ? currentIndex : journey.exitedFrom || 0;
  journey.flowComplete = Array.from({ length: terminalIndex }, (_, index) =>
    journey.transitions.some(
      (transition) =>
        transition.fromIndex === index && transition.toIndex === index + 1,
    ),
  ).every(Boolean);
  return journey;
}

/** The outcome label a submission carries in the volume chart. */
function journeyOutcome(journey) {
  if (isClosedStage(journey.currentStage)) return exitKey(journey.currentStage);
  return ["applied", "shortlisted", "offered", "signed"][journey.reachedIndex] || "applied";
}

function firstResponseAt(application, journey, cutoff = null) {
  const touch = earliestDate(journey.firstTouchAt, application.viewed_at);
  return touch && (!cutoff || touch < cutoff) ? touch : null;
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

async function columnExists(knex, table, column) {
  try {
    return await knex.schema.hasColumn(table, column);
  } catch {
    return false;
  }
}

function compareTimestamp(
  query,
  knex,
  column,
  operator,
  value,
  { or = false } = {},
) {
  if (knex.client.config.client === "sqlite3") {
    const method = or ? "orWhereRaw" : "whereRaw";
    return query[method](`datetime(??) ${operator} datetime(?)`, [column, value]);
  }
  const method = or ? "orWhere" : "where";
  return query[method](column, operator, value);
}

/**
 * Mirrors the signing/package vocabulary on schemas that predate board_type.
 * Client metadata or a slot target identifies a casting package; `kind` is the
 * older discriminator and remains a fallback for partially migrated installs.
 */
function resolveBoardType(board) {
  if (!board) return null;
  if (board.board_type === "division" || board.board_type === "package") {
    return board.board_type;
  }
  if (board.client_name || board.target_slots) return "package";
  if (board.kind && board.kind !== "division") return "package";
  return "division";
}

const schemaCapabilitiesByClient = new WeakMap();

async function loadSchemaCapabilities(knex) {
  const cached = schemaCapabilitiesByClient.get(knex);
  if (cached) return cached;

  const pending = (async () => {
    const [
      hasRosterTable,
      hasStandingsTable,
      hasApplicationsBoardId,
      hasBoardKind,
      hasBoardType,
      hasMinorAtSubmission,
      hasMinorRevokedAt,
      hasMinorExpiry,
      hasSetupSteps,
      rosterHasSourceApplication,
      hasTalentRecords,
      talentRecordIsMinor,
      talentRecordConsentStatus,
      talentRecordConsentExpiry,
      remindersHaveSnoozedUntil,
      fitScoreLocations,
    ] = await Promise.all([
      tableExists(knex, "roster_memberships"),
      tableExists(knex, "roster_board_standings"),
      columnExists(knex, "applications", "board_id"),
      columnExists(knex, "boards", "kind"),
      columnExists(knex, "boards", "board_type"),
      columnExists(knex, "applications", "minor_at_submission"),
      columnExists(knex, "applications", "minor_access_revoked_at"),
      columnExists(knex, "applications", "guardian_consent_expires_at"),
      tableExists(knex, "agency_setup_steps"),
      columnExists(knex, "roster_memberships", "source_application_id"),
      tableExists(knex, "talent_records"),
      columnExists(knex, "talent_records", "is_minor"),
      columnExists(knex, "talent_records", "minor_consent_status"),
      columnExists(knex, "talent_records", "minor_consent_expires_at"),
      columnExists(knex, "reminders", "snoozed_until"),
      Promise.all(
        FIT_SCORE_COLUMNS.map(async (column) => ({
          column,
          inProfile: await columnExists(knex, "profiles", column),
          inAnalysis: await columnExists(knex, "ai_profile_analysis", column),
        })),
      ),
    ]);

    return {
      hasRosterTable,
      hasStandingsTable,
      hasApplicationsBoardId,
      hasBoardKind,
      hasBoardType,
      hasMinorColumns:
        hasMinorAtSubmission && hasMinorRevokedAt && hasMinorExpiry,
      hasSetupSteps,
      rosterHasSourceApplication,
      hasTalentRecords,
      talentRecordHasMinorColumns:
        hasTalentRecords &&
        talentRecordIsMinor &&
        talentRecordConsentStatus &&
        talentRecordConsentExpiry,
      remindersHaveSnoozedUntil,
      fitScoreLocations,
    };
  })();

  schemaCapabilitiesByClient.set(knex, pending);
  try {
    return await pending;
  } catch (error) {
    schemaCapabilitiesByClient.delete(knex);
    throw error;
  }
}

function applyAnalyticsMinorFilter(query, alias, allowMinor, hasMinorColumns) {
  if (!hasMinorColumns) return query;
  return applyMinorSubmissionFilter(query, {
    alias,
    allowMinor,
    force: true,
  });
}

async function loadRows(
  knex,
  agencyId,
  windowStart,
  { allowMinorSubmissions = false, now = new Date() } = {},
) {
  const {
    hasRosterTable,
    hasStandingsTable,
    hasApplicationsBoardId,
    hasBoardKind,
    hasBoardType,
    hasMinorColumns,
    hasSetupSteps,
    rosterHasSourceApplication,
    hasTalentRecords,
    talentRecordHasMinorColumns,
    remindersHaveSnoozedUntil,
    fitScoreLocations,
  } = await loadSchemaCapabilities(knex);
  const windowStartValue = windowStart.toISOString();
  const nowValue = now.toISOString();

  let applicationsQuery = knex("applications as a")
    .where("a.agency_id", agencyId)
    .andWhere((scope) => {
      compareTimestamp(
        scope,
        knex,
        "a.created_at",
        ">=",
        windowStartValue,
      );
      compareTimestamp(
        scope,
        knex,
        "a.accepted_at",
        ">=",
        windowStartValue,
        { or: true },
      );
      compareTimestamp(
        scope,
        knex,
        "a.declined_at",
        ">=",
        windowStartValue,
        { or: true },
      );
      scope.orWhereNull("a.status").orWhereNotIn("a.status", [
        ...CLOSED_APPLICATION_STATUSES,
        ...REPRESENTED_STATUSES,
      ]);
      // A deployment without the canonical roster table still needs historic
      // represented applications to derive its legacy roster.
      if (!hasRosterTable) scope.orWhereIn("a.status", REPRESENTED_STATUSES);
    });
  applicationsQuery = compareTimestamp(
    applicationsQuery,
    knex,
    "a.created_at",
    "<",
    nowValue,
  ).select(
    "a.id",
    "a.profile_id",
    "a.status",
    ...(hasApplicationsBoardId ? ["a.board_id"] : []),
    "a.match_score",
    "a.created_at",
    "a.updated_at",
    "a.viewed_at",
    "a.accepted_at",
    "a.declined_at",
  );
  applicationsQuery = applyAnalyticsMinorFilter(
    applicationsQuery,
    "a",
    allowMinorSubmissions,
    hasMinorColumns,
  );

  let allTimeCountQuery = knex("applications as a")
    .where("a.agency_id", agencyId);
  allTimeCountQuery = compareTimestamp(
    allTimeCountQuery,
    knex,
    "a.created_at",
    "<",
    nowValue,
  )
    .count({ count: "a.id" })
    .first();
  allTimeCountQuery = applyAnalyticsMinorFilter(
    allTimeCountQuery,
    "a",
    allowMinorSubmissions,
    hasMinorColumns,
  );

  const boardQuery = knex("boards")
    .where({ agency_id: agencyId })
    .select("id", "name", "client_name", "target_slots", "is_active", "closes_at")
    .modify((query) => {
      if (hasBoardKind) query.select("kind");
      if (hasBoardType) query.select("board_type");
    });

  const membershipQuery = knex("agency_memberships as m")
    .leftJoin("users as u", "u.id", "m.user_id")
    .where("m.agency_id", agencyId)
    .select(
      "m.user_id",
      "m.membership_role",
      "m.status",
      "u.first_name",
      "u.last_name",
      "u.email",
    );

  const setupQuery = hasSetupSteps
    ? knex("agency_setup_steps")
        .where({ agency_id: agencyId, step_key: "defaults" })
        .first("data")
    : Promise.resolve(null);

  const [applications, boards, memberships, allTimeCountRow, setupDefaults] =
    await Promise.all([
      applicationsQuery,
      boardQuery,
      membershipQuery,
      allTimeCountQuery,
      setupQuery,
    ]);

  const applicationIds = applications.map((application) => application.id);
  const forVisibleApplications = (query, column = "application_id") =>
    applicationIds.length
      ? query.whereIn(column, applicationIds)
      : query.whereRaw("1 = 0");

  let roster = [];
  if (hasRosterTable) {
    let rosterQuery = knex("roster_memberships as rm").where(
      "rm.agency_id",
      agencyId,
    );
    if (rosterHasSourceApplication) {
      rosterQuery = rosterQuery.leftJoin(
        "applications as source_application",
        "source_application.id",
        "rm.source_application_id",
      );
    }
    if (hasTalentRecords) {
      rosterQuery = rosterQuery.leftJoin(
        "talent_records as tr",
        "tr.id",
        "rm.talent_record_id",
      );
    }
    roster = await rosterQuery.select(
      "rm.id",
      "rm.profile_id",
      "rm.talent_record_id",
      "rm.board_id",
      "rm.stage",
      "rm.status",
      "rm.joined_at",
      "rm.left_at",
      ...(rosterHasSourceApplication && hasMinorColumns
        ? [
            "source_application.minor_at_submission as source_is_minor",
            "source_application.minor_access_revoked_at as source_minor_revoked_at",
            "source_application.guardian_consent_expires_at as source_minor_expires_at",
          ]
        : []),
      ...(talentRecordHasMinorColumns
        ? [
            "tr.is_minor as record_is_minor",
            "tr.minor_consent_status as record_minor_consent_status",
            "tr.minor_consent_expires_at as record_minor_expires_at",
          ]
        : []),
    );
  }

  // Only deployments without the roster table use the application fallback.
  // An empty canonical roster is a truthful empty roster, not a derivation cue.
  if (!hasRosterTable) {
    roster = applications
      .filter((application) => REPRESENTED_STATUSES.includes(application.status))
      .map((application) => ({
        id: `derived:${application.id}`,
        profile_id: application.profile_id,
        talent_record_id: null,
        board_id: application.board_id || null,
        stage: "main",
        status: "active",
        joined_at:
          application.accepted_at ||
          application.updated_at ||
          application.created_at,
        left_at: null,
        derived: true,
      }));
  }

  const rosterStandings = hasStandingsTable
    ? await knex("roster_board_standings as rbs")
        .join("roster_memberships as rm", "rm.id", "rbs.membership_id")
        .where("rm.agency_id", agencyId)
        .select(
          "rbs.membership_id",
          "rbs.board_id",
          "rbs.standing",
          "rbs.is_primary",
        )
    : [];

  const rosterProfileIds = roster.map((row) => row.profile_id).filter(Boolean);
  const applicantProfileIds = applications
    .filter((a) => toDate(a.created_at) >= windowStart)
    .map((a) => a.profile_id)
    .filter(Boolean);
  const profileIds = [...new Set([...rosterProfileIds, ...applicantProfileIds])];

  const profiles = [];
  // Stay below SQLite's bind-variable ceiling and avoid enormous PG IN lists.
  for (let index = 0; index < profileIds.length; index += 500) {
    let profilesQuery = knex("profiles as p")
      .whereIn("p.id", profileIds.slice(index, index + 500))
      .select(
        "p.id",
        "p.city",
        "p.market",
        "p.height_cm",
        "p.date_of_birth",
        "p.gender",
        "p.experience_level",
        "p.archetype",
      );
    if (fitScoreLocations.some((location) => location.inAnalysis)) {
      profilesQuery = profilesQuery.leftJoin(
        "ai_profile_analysis as analysis",
        "analysis.profile_id",
        "p.id",
      );
    }
    fitScoreLocations.forEach(({ column, inProfile, inAnalysis }) => {
      if (inAnalysis) {
        profilesQuery.select({ [column]: `analysis.${column}` });
      } else if (inProfile) {
        profilesQuery.select({ [column]: `p.${column}` });
      } else {
        profilesQuery.select(knex.raw("NULL as ??", [column]));
      }
    });
    // eslint-disable-next-line no-await-in-loop
    profiles.push(...(await profilesQuery));
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const talentRecordIds = [
    ...new Set(roster.map((row) => row.talent_record_id).filter(Boolean)),
  ];
  const talentRecords = [];
  if (hasTalentRecords) {
    for (let index = 0; index < talentRecordIds.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      const records = await knex("talent_records")
        .where({ agency_id: agencyId })
        .whereIn("id", talentRecordIds.slice(index, index + 500))
        .select("id", "market", "height_cm", "date_of_birth", "gender");
      talentRecords.push(...records);
    }
  }
  const talentRecordById = new Map(
    talentRecords.map((record) => [record.id, record]),
  );
  const rosterVisible = roster.filter((row) => {
    const sourceGrantCurrent =
      !row.source_is_minor ||
      (!row.source_minor_revoked_at &&
        toDate(row.source_minor_expires_at)?.getTime() > now.getTime());
    const recordGrantCurrent =
      !row.record_is_minor ||
      (row.record_minor_consent_status === "verified" &&
        toDate(row.record_minor_expires_at)?.getTime() > now.getTime());
    const profileAge = row.profile_id
      ? ageFromDob(profileById.get(row.profile_id)?.date_of_birth, now)
      : null;
    const recordAge = row.talent_record_id
      ? ageFromDob(talentRecordById.get(row.talent_record_id)?.date_of_birth, now)
      : null;
    const subjectIsMinor =
      (profileAge != null && profileAge < 18) ||
      (recordAge != null && recordAge < 18);
    if (!allowMinorSubmissions) {
      return !row.source_is_minor && !row.record_is_minor && !subjectIsMinor;
    }
    return sourceGrantCurrent && recordGrantCurrent;
  });

  const visibleRosterIds = new Set(rosterVisible.map((row) => row.id));
  const visibleRosterStandings = rosterStandings.filter((standing) =>
    visibleRosterIds.has(standing.membership_id),
  );

  const [boardApplications, activities, interviews, reminders] =
    await Promise.all([
      forVisibleApplications(
        knex("board_applications as ba").select(
          "ba.board_id",
          "ba.application_id",
          "ba.match_score",
        ),
        "ba.application_id",
      ),
      forVisibleApplications(
        compareTimestamp(
          knex("application_activities").where({ agency_id: agencyId }),
          knex,
          "created_at",
          "<",
          nowValue,
        )
          .select(
            "application_id",
            "user_id",
            "activity_type",
            "metadata",
            "created_at",
          )
          .orderBy("created_at", "asc"),
      ),
      forVisibleApplications(
        knex("interviews")
          .where({ agency_id: agencyId })
          .andWhere((scope) => {
            compareTimestamp(
              scope,
              knex,
              "created_at",
              ">=",
              windowStartValue,
            );
            compareTimestamp(
              scope,
              knex,
              "proposed_datetime",
              ">=",
              windowStartValue,
              { or: true },
            );
          })
          .select(
            "application_id",
            "status",
            "interview_type",
            "proposed_datetime",
            "responded_at",
            "created_at",
          ),
      ),
      forVisibleApplications(
        knex("reminders")
          .where({ agency_id: agencyId })
          .andWhere((scope) => {
            scope.whereIn("status", ["pending", "snoozed"]);
            compareTimestamp(
              scope,
              knex,
              "completed_at",
              ">=",
              windowStartValue,
              { or: true },
            );
          })
          .select(
            "application_id",
            "status",
            "priority",
            "reminder_date",
            ...(remindersHaveSnoozedUntil ? ["snoozed_until"] : []),
            "completed_at",
            "created_at",
          ),
      ),
    ]);

  return {
    applications,
    boards,
    boardApplications,
    activities,
    interviews,
    reminders,
    memberships,
    roster: rosterVisible,
    rosterStandings: visibleRosterStandings,
    profiles,
    talentRecords,
    rosterIsDerived: !hasRosterTable,
    allTimeSubmissionCount: Number(allTimeCountRow?.count || 0),
    configuredTimeZone: validTimeZone(parseJson(setupDefaults?.data).timezone),
    hasBoardType,
    hasApplicationsBoardId,
    hasStandingsTable,
    hasMinorColumns,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildFlow(journeys) {
  const eligible = journeys.filter(({ journey }) => journey.flowComplete);
  const reached = FORWARD_STAGES.map(() => 0);
  const exited = FORWARD_STAGES.map(() => 0);
  const exitsByKind = FORWARD_STAGES.map(() => ({
    passed: 0,
    keptOnFile: 0,
    withdrawn: 0,
  }));
  const dwellByStage = FORWARD_STAGES.map(() => []);

  eligible.forEach(({ journey }) => {
    for (let i = 0; i <= journey.reachedIndex; i += 1) reached[i] += 1;
    if (journey.exitedFrom != null) {
      exited[journey.exitedFrom] += 1;
      const key = journey.exitKind || "passed";
      exitsByKind[journey.exitedFrom][key] += 1;
    }
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
      ...exitsByKind[i],
      held,
      conversion: i + 1 < FORWARD_STAGES.length ? share(advanced, reached[i]) : null,
      medianDwellDays: round(median(dwell)),
      dwellSample: dwell.length,
    };
  });

  return {
    stages,
    cohort: eligible.length,
    totalCohort: journeys.length,
    excludedIncomplete: journeys.length - eligible.length,
    signed: reached[FORWARD_STAGES.length - 1],
    exited: exited.reduce((sum, v) => sum + v, 0),
    open: stages.reduce((sum, s) => sum + s.held, 0),
  };
}

function buildVolume(journeys, buckets, granularity, timeZone) {
  const empty = () => ({
    applied: 0,
    shortlisted: 0,
    offered: 0,
    signed: 0,
    passed: 0,
    keptOnFile: 0,
    withdrawn: 0,
    total: 0,
  });
  const index = new Map(buckets.map((key) => [key, { bucket: key, ...empty() }]));

  journeys.forEach(({ application, journey }) => {
    const createdAt = toDate(application.created_at);
    if (!createdAt) return;
    const key = bucketKey(createdAt, granularity, timeZone);
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
 * Retrospective association between the currently stored match score and the
 * submission's current outcome. This is intentionally not called predictive
 * calibration because the schema has no immutable score-at-submission event.
 */
function buildCalibration(journeys, scoreForApplication) {
  const bins = CALIBRATION_BINS.map((b) => ({
    ...b,
    signed: 0,
    advanced: 0,
    open: 0,
    passed: 0,
    keptOnFile: 0,
    withdrawn: 0,
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
    if (journey.currentStage === "Passed") {
      bin.passed += 1;
      passedScores.push(score);
    } else if (journey.currentStage === "Kept on file") {
      bin.keptOnFile += 1;
    } else if (journey.currentStage === "Withdrawn") {
      bin.withdrawn += 1;
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
    const decided =
      b.signed + b.advanced + b.passed + b.keptOnFile + b.withdrawn;
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

function buildBoardPerformance(boards, journeys, boardsForApplication, now) {
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
        submissions: 0,
        scores: [],
      },
    ]),
  );

  journeys.forEach(({ application }) => {
    boardsForApplication(application).forEach(({ boardId, score }) => {
      const row = stats.get(boardId);
      if (!row) return;
      row.submissions += 1;
      if (score != null) row.scores.push(score);
    });
  });

  return [...stats.values()]
    .map(({ scores, ...row }) => ({
      ...row,
      averageMatch: round(mean(scores), 0),
      scoredSubmissions: scores.length,
      scoreCoverage: share(scores.length, row.submissions),
    }))
    .sort((a, b) => b.submissions - a.submissions);
}

function buildCohorts(journeys, timeZone, now, monthsBack = 12) {
  const index = new Map();
  const currentMonth = new Date(
    `${localMonthKey(now, timeZone)}-01T12:00:00.000Z`,
  );
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const anchor = new Date(currentMonth.getTime());
    anchor.setUTCMonth(anchor.getUTCMonth() - offset);
    const month = anchor.toISOString().slice(0, 7);
    index.set(month, {
      month,
      size: 0,
      reached: FORWARD_STAGES.map(() => 0),
      passed: 0,
    });
  }
  journeys.forEach(({ application, journey }) => {
    const createdAt = toDate(application.created_at);
    if (!createdAt) return;
    const key = localMonthKey(createdAt, timeZone);
    if (!index.has(key)) return;
    const row = index.get(key);
    row.size += 1;
    journey.reachedStages.forEach((didReach, index) => {
      if (didReach) row.reached[index] += 1;
    });
    if (journey.currentStage === "Passed") row.passed += 1;
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
        rate: row.size ? share(row.reached[i], row.size) : null,
      })),
      passed: row.passed,
    }));
}

function buildDesk(context) {
  const {
    activities,
    windowStart,
    now,
    timeZone,
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
    const { dow, hour } = localDowAndHour(at, timeZone);
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
    const touch = firstResponseAt(application, journey, now);
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
    const at = toDate(i.proposed_datetime) || toDate(i.created_at);
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
  const openReminders = reminders.filter((r) => {
    const createdAt = toDate(r.created_at);
    return (
      ["pending", "snoozed"].includes(r.status) &&
      (!createdAt || createdAt < now)
    );
  });
  const overdue = openReminders.filter((r) => {
    const due =
      r.status === "snoozed"
        ? toDate(r.snoozed_until) || toDate(r.reminder_date)
        : toDate(r.reminder_date);
    return due && due < now;
  });
  const completedInWindow = reminders.filter((r) => {
    const at = toDate(r.completed_at);
    return r.status === "completed" && at && at >= windowStart && at < now;
  });
  const onTime = completedInWindow.filter((r) => {
    const due = toDate(r.snoozed_until) || toDate(r.reminder_date);
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
  const {
    roster,
    rosterStandings,
    profiles,
    talentRecords,
    boards,
    now,
    timeZone,
    pipelineProfileIds,
  } = context;

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const talentRecordById = new Map(
    (talentRecords || []).map((record) => [record.id, record]),
  );
  const boardById = new Map(
    boards.filter((board) => board.kind === "division").map((board) => [board.id, board]),
  );
  const standingsByMembership = new Map();
  (rosterStandings || []).forEach((standing) => {
    if (!standingsByMembership.has(standing.membership_id)) {
      standingsByMembership.set(standing.membership_id, []);
    }
    standingsByMembership.get(standing.membership_id).push(standing);
  });
  const active = roster.filter((r) => r.status === "active");

  // --- twelve months of joins and departures -------------------------------
  const months = [];
  const currentMonthAnchor = new Date(
    `${localMonthKey(now, timeZone)}-15T12:00:00.000Z`,
  );
  for (let i = 11; i >= 0; i -= 1) {
    const anchor = new Date(currentMonthAnchor.getTime());
    anchor.setUTCMonth(anchor.getUTCMonth() - i);
    months.push(anchor.toISOString().slice(0, 7));
  }
  const growth = months.map((month) => ({ month, joined: 0, left: 0, total: 0 }));
  const growthIndex = new Map(growth.map((row) => [row.month, row]));

  roster.forEach((r) => {
    const joined = toDate(r.joined_at);
    if (joined) {
      const row = growthIndex.get(localMonthKey(joined, timeZone));
      if (row) row.joined += 1;
    }
    const left = toDate(r.left_at);
    if (left) {
      const row = growthIndex.get(localMonthKey(left, timeZone));
      if (row) row.left += 1;
    }
  });

  growth.forEach((row) => {
    row.total = roster.filter((r) => {
      const joined = toDate(r.joined_at);
      const left = toDate(r.left_at);
      if (!joined || localMonthKey(joined, timeZone) > row.month) return false;
      return !left || localMonthKey(left, timeZone) > row.month;
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

    const canonicalStandings = (standingsByMembership.get(r.id) || []).filter(
      (standing) =>
        boardById.has(standing.board_id) &&
        !["ended", "passed", "inactive"].includes(standing.standing),
    );
    const boardIds = canonicalStandings.length
      ? canonicalStandings.map((standing) => standing.board_id)
      : r.board_id && boardById.has(r.board_id)
        ? [r.board_id]
        : [];
    if (boardIds.length) {
      [...new Set(boardIds)].forEach((boardId) => {
        const boardName = boardById.get(boardId)?.name;
        if (boardName) boardMix.set(boardName, (boardMix.get(boardName) || 0) + 1);
      });
    } else {
      boardMix.set("Unassigned", (boardMix.get("Unassigned") || 0) + 1);
    }

    const joined = toDate(r.joined_at);
    if (joined) tenureMonths.push((now.getTime() - joined.getTime()) / (30.44 * DAY_MS));

    const profile = r.profile_id
      ? profileById.get(r.profile_id)
      : talentRecordById.get(r.talent_record_id);
    if (!profile) return;

    const market = profile.market;
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
      const touch = firstResponseAt(application, journey, windowEnd);
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
      ({ journey }) => journey.isOpen,
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
 * @param {string|null} [options.boardId] package scope for Pipeline, division scope for Roster
 * @param {string|null} [options.requestedTimeZone] browser IANA fallback
 * @param {boolean} [options.allowMinorSubmissions] permission-resolved minor visibility
 * @param {Date} [options.now] injectable clock for tests
 */
async function buildSeasonAnalytics(knex, options) {
  const {
    agencyId,
    range,
    boardId = null,
    requestedTimeZone = null,
    timeZone: explicitTimeZone = null,
    allowMinorSubmissions = false,
    now = new Date(),
  } = options;

  const rangeDays = resolveRange(range);
  const resolvedExplicitTimeZone = resolveTimeZoneInput(
    explicitTimeZone,
    "timeZone",
  );
  const resolvedRequestedTimeZone = resolveTimeZoneInput(
    requestedTimeZone,
    "timezone",
  );
  const windowStart = new Date(now.getTime() - rangeDays * DAY_MS);
  const previousStart = new Date(now.getTime() - 2 * rangeDays * DAY_MS);
  // Fetch enough history for the fixed twelve-calendar-month cohort grid even
  // when the selected comparison window is only 30 or 90 days. Starting one
  // extra UTC month early safely covers the agency's local month boundary.
  const cohortDataStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1),
  );
  const dataStart = new Date(
    Math.min(previousStart.getTime(), cohortDataStart.getTime()),
  );

  const rows = await loadRows(knex, agencyId, dataStart, {
    allowMinorSubmissions,
    now,
  });
  const timeZone =
    resolvedExplicitTimeZone ||
    rows.configuredTimeZone ||
    resolvedRequestedTimeZone ||
    DEFAULT_TIME_ZONE;

  const boards = rows.boards.map((board) => ({
    ...board,
    kind: resolveBoardType(board),
  }));
  const activeBoard = boardId
    ? boards.find((board) => board.id === boardId)
    : null;
  if (boardId && !activeBoard) {
    throw new AnalyticsInputError("Unknown analytics board");
  }
  const activeBoardId = activeBoard?.id || null;
  const activeScope = activeBoard?.kind || "agency";

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
    if (links.length || !application.board_id) return links;
    return [{
      boardId: application.board_id,
      score:
        application.match_score == null
          ? null
          : Number(application.match_score),
    }];
  };
  const scoreForApplication = (application) => {
    if (activeScope === "package") {
      const selected = boardsForApplication(application).find(
        (link) => link.boardId === activeBoardId,
      );
      if (selected?.score != null) return selected.score;
    }
    if (application.match_score != null) return Number(application.match_score);
    const scores = boardsForApplication(application)
      .map((l) => l.score)
      .filter((s) => s != null);
    return round(mean(scores), 1);
  };

  const reportableApplications = rows.applications.filter((application) => {
    const createdAt = toDate(application.created_at);
    return createdAt && createdAt < now;
  });
  const scopedApplications = activeScope === "package"
    ? reportableApplications.filter((a) =>
        boardsForApplication(a).some((l) => l.boardId === activeBoardId),
      )
    : reportableApplications;

  // --- journeys ------------------------------------------------------------
  const activitiesByApplication = new Map();
  rows.activities.forEach((activity) => {
    if (!activitiesByApplication.has(activity.application_id)) {
      activitiesByApplication.set(activity.application_id, []);
    }
    activitiesByApplication.get(activity.application_id).push(activity);
  });

  const agencyActorIds = new Set(
    rows.memberships
      .filter(
        (membership) =>
          String(membership.status || "").toLowerCase() === "active",
      )
      .map((membership) => membership.user_id)
      .filter(Boolean),
  );
  // Legacy owner-only agencies can predate agency_memberships. Their agency
  // account is the only defensible actor fallback; an empty set must never
  // make talent-originated activity count as desk work.
  if (agencyActorIds.size === 0) agencyActorIds.add(agencyId);

  const allJourneys = scopedApplications.map((application) => ({
    application,
    createdAt: toDate(application.created_at),
    journey: replayJourney(
      application,
      activitiesByApplication.get(application.id) || [],
      agencyActorIds,
    ),
    lastTouchAt: (() => {
      const list = (activitiesByApplication.get(application.id) || []).filter(
        (activity) =>
          activity.user_id && agencyActorIds.has(activity.user_id),
      );
      const lastActivityAt = list?.length
        ? list[list.length - 1].created_at
        : null;
      return latestDateAtOrBefore(
        now,
        lastActivityAt,
        application.viewed_at,
      );
    })(),
  }));

  const windowJourneys = allJourneys.filter(
    ({ createdAt }) => createdAt && createdAt >= windowStart && createdAt < now,
  );

  // Open work is a live queue — it is never bounded by the reporting window,
  // because a submission that has sat untouched for 200 days is exactly the
  // one a booker needs to see.
  const openJourneys = allJourneys.filter(
    ({ journey }) => journey.isOpen,
  );

  const buckets = enumerateBuckets(
    windowStart,
    now,
    resolveGranularity(rangeDays),
    timeZone,
  );

  const scopedActivityIds = new Set(scopedApplications.map((a) => a.id));
  const scopedActivities = activeScope === "package"
    ? rows.activities.filter((a) => scopedActivityIds.has(a.application_id))
    : rows.activities;
  const deskActivities = scopedActivities.filter(
    (activity) =>
      activity.user_id && agencyActorIds.has(activity.user_id),
  );
  const scopedInterviews = activeScope === "package"
    ? rows.interviews.filter((row) => scopedActivityIds.has(row.application_id))
    : rows.interviews;
  const scopedReminders = activeScope === "package"
    ? rows.reminders.filter((row) => scopedActivityIds.has(row.application_id))
    : rows.reminders;

  const pipelineProfileIds = new Set(
    windowJourneys.map(({ application }) => application.profile_id).filter(Boolean),
  );

  const standingMembershipIds = new Set(
    activeScope === "division"
      ? rows.rosterStandings
          .filter((standing) => standing.board_id === activeBoardId)
          .map((standing) => standing.membership_id)
      : [],
  );
  const scopedRoster = activeScope === "division"
    ? rows.roster.filter(
        (row) => row.board_id === activeBoardId || standingMembershipIds.has(row.id),
      )
    : rows.roster;
  const scopedRosterIds = new Set(scopedRoster.map((row) => row.id));
  const scopedRosterStandings = rows.rosterStandings.filter(
    (standing) =>
      scopedRosterIds.has(standing.membership_id) &&
      (activeScope !== "division" || standing.board_id === activeBoardId),
  );

  let allTimeSubmissions = rows.allTimeSubmissionCount;
  if (activeScope === "package") {
    let countQuery = knex("applications as a")
      .leftJoin("board_applications as ba", "a.id", "ba.application_id")
      .where("a.agency_id", agencyId);
    countQuery = compareTimestamp(
      countQuery,
      knex,
      "a.created_at",
      "<",
      now.toISOString(),
    )
      .andWhere((scope) => {
        scope.where("ba.board_id", activeBoardId);
        if (rows.hasApplicationsBoardId) {
          scope.orWhere("a.board_id", activeBoardId);
        }
      })
      .countDistinct({ count: "a.id" })
      .first();
    countQuery = applyAnalyticsMinorFilter(
      countQuery,
      "a",
      allowMinorSubmissions,
      rows.hasMinorColumns,
    );
    const countRow = await countQuery;
    allTimeSubmissions = Number(countRow?.count || 0);
  }

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
      timeZone,
      boardId: activeBoardId,
      boardScope: activeScope,
      boards: boards
        .map((b) => ({
          id: b.id,
          name: b.name,
          clientName: b.client_name || null,
          isActive: b.is_active == null ? true : dbBoolean(b.is_active),
          kind: b.kind,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      stages: FORWARD_STAGES,
      exitStage: EXIT_STAGE,
      rosterIsDerived: rows.rosterIsDerived,
      rosterUsesBoardStandings: rows.hasStandingsTable,
      minorSubmissionsIncluded: Boolean(allowMinorSubmissions),
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
      timeZone,
    ),
    queue: buildQueue(openJourneys, now),
    calibration: buildCalibration(windowJourneys, scoreForApplication),
    boards: buildBoardPerformance(
      boards.filter(
        (board) =>
          board.kind === "package" &&
          (activeScope !== "package" || board.id === activeBoardId),
      ),
      windowJourneys,
      boardsForApplication,
      now,
    ),
    cohorts: buildCohorts(
      allJourneys,
      timeZone,
      now,
    ),
    desk: buildDesk({
      activities: deskActivities,
      windowStart,
      now,
      timeZone,
      journeysById: allJourneys,
      memberships: rows.memberships,
      interviews: scopedInterviews,
      reminders: scopedReminders,
    }),
    roster: buildRoster({
      roster: scopedRoster,
      rosterStandings: scopedRosterStandings,
      profiles: rows.profiles,
      talentRecords: rows.talentRecords,
      boards,
      now,
      timeZone,
      pipelineProfileIds,
    }),
    totals: {
      allTimeSubmissions,
      windowSubmissions: windowJourneys.length,
      activitiesObserved: deskActivities.length,
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
