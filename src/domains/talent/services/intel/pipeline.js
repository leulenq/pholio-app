/**
 * Submissions intelligence (spec zone 4 + signal tiers 1–2).
 *
 * Reads the already-flowing status machine: `applications` +
 * `application_activities` (incl. `profile_viewed` — aggregate only; a named
 * agency appears solely through explicit talent-facing status changes, which
 * the applications ledger already communicates).
 */

const knex = require("../../../../shared/db/knex");
const { whereSince, parseDbDate, dayKey, daysAgo } = require("./db-utils");

// Status vocabulary (see agency inbox allowlist).
const ADVANCING = new Set([
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "development",
]);
const SIGNED = new Set(["accepted", "booked", "represented"]);
const PASSED = new Set(["passed", "declined"]);

const STATUS_LABELS = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  requested_more: "Requested more",
  meeting_requested: "Meeting requested",
  development: "Development",
  accepted: "Accepted",
  booked: "Booked",
  represented: "Represented",
  kept_on_file: "Kept on file",
  passed: "Passed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

async function loadApplications(profileId) {
  return knex("applications")
    .join("agencies", "applications.agency_id", "agencies.id")
    .where("applications.profile_id", profileId)
    .select(
      "applications.id",
      "applications.status",
      "applications.created_at",
      "applications.updated_at",
      "applications.viewed_at",
      "applications.agency_id",
      "agencies.name as agency_name",
    );
}

async function loadActivities(profileId, since = null) {
  let qb = knex("application_activities")
    .join(
      "applications",
      "application_activities.application_id",
      "applications.id",
    )
    .where("applications.profile_id", profileId)
    .whereIn("application_activities.activity_type", [
      "profile_viewed",
      "status_change",
    ]);
  if (since) qb = whereSince(qb, "application_activities.created_at", since);
  return qb.select(
    "application_activities.application_id",
    "application_activities.activity_type",
    "application_activities.metadata",
    "application_activities.created_at",
  );
}

function activityMeta(row) {
  try {
    return typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : row.metadata || {};
  } catch {
    return {};
  }
}

/** Tier-1/2 events inside a window: reviews and advances. */
function tier12Counts(activities) {
  let reviews = 0;
  let advances = 0;
  for (const a of activities) {
    if (a.activity_type === "profile_viewed") reviews += 1;
    if (a.activity_type === "status_change") {
      const next = activityMeta(a).new_status;
      if (ADVANCING.has(next) || SIGNED.has(next)) advances += 1;
    }
  }
  return { reviews, advances };
}

/** Reviews / advances per day, for the Seismograph event layer. */
function pipelineEventsByDay(activities) {
  const out = {};
  for (const a of activities) {
    const k = dayKey(a.created_at);
    if (!k) continue;
    const day = (out[k] = out[k] || { reviews: 0, advances: 0 });
    if (a.activity_type === "profile_viewed") day.reviews += 1;
    if (a.activity_type === "status_change") {
      const next = activityMeta(a).new_status;
      if (ADVANCING.has(next) || SIGNED.has(next)) day.advances += 1;
    }
  }
  return out;
}

function classifyOutcome(status) {
  if (SIGNED.has(status)) return "signed";
  if (status === "kept_on_file") return "keptOnFile";
  if (PASSED.has(status)) return "passed";
  if (status === "withdrawn") return "withdrawn";
  if (ADVANCING.has(status)) return "advancing";
  if (status === "submitted" || status === "pending" || status === "reviewing")
    return "open";
  return "other"; // archived etc.
}

function flowCounts(applications, activitiesByApp) {
  const flow = {
    entered: applications.length,
    reviewed: 0,
    advanced: 0,
    stages: { shortlisted: 0, requestedMore: 0, meeting: 0, development: 0 },
    outcomes: {
      signed: 0,
      keptOnFile: 0,
      passed: 0,
      withdrawn: 0,
      inMotion: 0,
      awaiting: 0,
    },
  };
  for (const app of applications) {
    const acts = activitiesByApp.get(app.id) || [];
    const wasReviewed =
      Boolean(app.viewed_at) ||
      acts.some((a) => a.activity_type === "profile_viewed");
    if (wasReviewed) flow.reviewed += 1;

    // Highest stage the submission has touched, from status history.
    const touched = new Set([app.status]);
    for (const a of acts) {
      if (a.activity_type === "status_change") {
        const meta = activityMeta(a);
        if (meta.new_status) touched.add(meta.new_status);
        if (meta.old_status) touched.add(meta.old_status);
      }
    }
    const everAdvanced =
      [...touched].some((s) => ADVANCING.has(s) || SIGNED.has(s));
    if (everAdvanced) flow.advanced += 1;
    if (touched.has("shortlisted")) flow.stages.shortlisted += 1;
    if (touched.has("requested_more")) flow.stages.requestedMore += 1;
    if (touched.has("meeting_requested")) flow.stages.meeting += 1;
    if (touched.has("development")) flow.stages.development += 1;

    const outcome = classifyOutcome(app.status);
    if (outcome === "signed") flow.outcomes.signed += 1;
    else if (outcome === "keptOnFile") flow.outcomes.keptOnFile += 1;
    else if (outcome === "passed") flow.outcomes.passed += 1;
    else if (outcome === "withdrawn") flow.outcomes.withdrawn += 1;
    else if (outcome === "advancing") flow.outcomes.inMotion += 1;
    else if (outcome === "open") flow.outcomes.awaiting += 1;
  }
  return flow;
}

/**
 * Automatic diagnosis under the flow (spec zone 4). Codes map to copy in the
 * frontend; `null` when there isn't enough signal to say anything honest.
 */
function diagnose(flow) {
  if (flow.entered < 2) return null;
  if (flow.reviewed === 0) return "targeting"; // never-opened
  if (flow.advanced === 0) return "materials"; // opened, never advanced
  const settledPositive = flow.outcomes.signed + flow.outcomes.keptOnFile;
  if (flow.advanced > 0 && settledPositive === 0 && flow.outcomes.inMotion === 0)
    return "follow_through"; // advancing but stalling out
  return "healthy";
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function reviewLatencyDays(app) {
  const created = parseDbDate(app.created_at);
  const viewed = parseDbDate(app.viewed_at);
  if (!created || !viewed || isNaN(created) || isNaN(viewed)) return null;
  const days = (viewed.getTime() - created.getTime()) / 86_400_000;
  return days >= 0 ? days : null;
}

/**
 * Stage Clock — your review latency against the platform-typical band, so
 * silence reads as "agencies are slow", not rejection.
 */
async function stageClock(profileId, applications) {
  const mine = applications
    .map(reviewLatencyDays)
    .filter((d) => d !== null);

  // Platform-typical band: anonymized latency distribution over recent
  // applications platform-wide (never per-agency, never identifying).
  let band = null;
  let platformSampled = 0;
  try {
    const rows = await knex("applications")
      .whereNotNull("viewed_at")
      .modify((qb) => whereSince(qb, "created_at", daysAgo(180)))
      .select("created_at", "viewed_at")
      .limit(2000);
    const latencies = rows
      .map(reviewLatencyDays)
      .filter((d) => d !== null)
      .sort((a, b) => a - b);
    platformSampled = latencies.length;
    if (latencies.length >= 20) {
      band = {
        p25: Math.round(quantile(latencies, 0.25) * 10) / 10,
        p75: Math.round(quantile(latencies, 0.75) * 10) / 10,
      };
    }
  } catch {
    band = null;
  }

  return {
    medianReviewDays:
      mine.length > 0 ? Math.round(median(mine) * 10) / 10 : null,
    sampled: mine.length,
    typicalBand: band,
    platformSampled,
  };
}

/** Open submissions in advancing states, most urgent first (Pulse ticker). */
function inMotion(applications) {
  const now = Date.now();
  return applications
    .filter((app) => ADVANCING.has(app.status))
    .map((app) => {
      const updated = parseDbDate(app.updated_at);
      const days = updated
        ? Math.max(0, Math.floor((now - updated.getTime()) / 86_400_000))
        : null;
      return {
        applicationId: app.id,
        agencyName: app.agency_name,
        status: app.status,
        statusLabel: STATUS_LABELS[app.status] || app.status,
        daysAgo: days,
        urgent: app.status === "requested_more",
      };
    })
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.daysAgo - b.daysAgo)
    .slice(0, 5);
}

function keptOnFile(applications) {
  const kept = applications.filter((a) => a.status === "kept_on_file");
  return {
    count: kept.length,
    agencies: new Set(kept.map((a) => a.agency_id)).size,
  };
}

function withinWindow(dateValue, since) {
  const d = parseDbDate(dateValue);
  return d && !isNaN(d.getTime()) && d.getTime() >= since.getTime();
}

module.exports = {
  ADVANCING,
  SIGNED,
  PASSED,
  STATUS_LABELS,
  loadApplications,
  loadActivities,
  activityMeta,
  tier12Counts,
  pipelineEventsByDay,
  flowCounts,
  diagnose,
  stageClock,
  inMotion,
  keptOnFile,
  withinWindow,
};
