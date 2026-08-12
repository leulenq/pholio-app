/**
 * Composed intel payload: one read for the whole page.
 *
 * The page asks a small number of decidable questions, and this file assembles
 * exactly the evidence each one needs:
 *
 *   decisions   — what to do next, ranked, each carrying its trigger number
 *   submissions — where submissions die (conversion) and which are past a read
 *   materials   — whether the package can be sent today
 *   attention   — recorded traffic and actions, and where they came from
 *   book        — which frames were shown and opened
 *   momentum    — weekly activity counts, without a composite score
 *
 * Non-negotiables (spec §4), unchanged:
 *  - agency attention only in aggregate (no per-agency view logs anywhere)
 *  - minors: no geo/viewer detail at all — materials + submission states only
 *  - small-n honesty: deltas only when the prior period has >= 10 events;
 *    percentage suppression flagged below ~20 views / 2 submissions
 *
 * Removed deliberately: the momentum composite index (an invented weighted
 * number nobody could act on) and its "cohort band", which the frontend drew as
 * a fixed dashed rectangle with no data behind it.
 */

const knex = require("../../../../shared/db/knex");
const { daysAgo, dayRange, dayKey, parseDbDate } = require("./db-utils");
const { isMinorProfile } = require("../../../../shared/lib/talent-age");
const { marketLabel } = require("../market-resolve");
const attention = require("./attention");
const pipeline = require("./pipeline");
const materials = require("./materials");
const conversion = require("./conversion");
const { buildDecisions } = require("./decisions");

const DELTA_MIN_PRIOR_EVENTS = 10;
const SMALL_N_VIEWS = 20;
const SMALL_N_SUBMISSIONS = 2;
const MOMENTUM_WEEKS = 12;

async function loadImages(profileId) {
  return knex("images")
    .where({ profile_id: profileId })
    .orderBy("sort", "asc")
    .select(
      "id",
      "path",
      "public_url",
      "label",
      "image_type",
      "shot_type",
      "status",
      "is_primary",
      "captured_at",
      "created_at",
    );
}

/** Self events (annotations) — trend changes must have visible causes. */
function selfAnnotations({ images, applications, since }) {
  const byDay = {};
  const push = (ts, kind, label) => {
    const k = dayKey(ts);
    if (!k) return;
    const d = parseDbDate(ts);
    if (!d || d.getTime() < since.getTime()) return;
    (byDay[k] = byDay[k] || []).push({ kind, label });
  };
  const digitalDays = new Set();
  for (const img of images) {
    const isDigital = String(img.image_type || "").toLowerCase() === "digital";
    const k = dayKey(img.captured_at || img.created_at);
    if (isDigital && k && !digitalDays.has(k)) {
      digitalDays.add(k);
      push(img.captured_at || img.created_at, "digitals", "New digitals");
    }
  }
  for (const app of applications) {
    push(app.created_at, "submission", "Submitted");
  }
  return byDay;
}

async function buildIntel(profile, { days, tz = "UTC" }) {
  const now = new Date();
  const since = daysAgo(days, now);
  const priorSince = daysAgo(days * 2, now);
  const minor = isMinorProfile(profile);

  const [applications, activities, images] = await Promise.all([
    pipeline.loadApplications(profile.id),
    pipeline.loadActivities(profile.id),
    loadImages(profile.id),
  ]);

  const activitiesByApp = new Map();
  for (const a of activities) {
    const list = activitiesByApp.get(a.application_id) || [];
    list.push(a);
    activitiesByApp.set(a.application_id, list);
  }

  const periodActivities = activities.filter((a) =>
    pipeline.withinWindow(a.created_at, since),
  );
  const periodApplications = applications.filter((app) =>
    pipeline.withinWindow(app.created_at, since),
  );

  // ---- Submissions — available for every profile
  const periodFlow = pipeline.flowCounts(periodApplications, activitiesByApp);
  const lifetimeFlow = pipeline.flowCounts(applications, activitiesByApp);
  const clock = await pipeline.stageClock(profile.id, applications);
  const openRows = conversion.openSubmissions(applications, clock.typicalBand, now);
  const openStates = conversion.countStates(openRows);

  // The ladder reads off whichever window carries enough submissions to say
  // something; lifetime is the honest fallback, never a padded period.
  const periodSteps = conversion.ladder(periodFlow);
  const lifetimeSteps = conversion.ladder(lifetimeFlow);
  const basis = periodFlow.entered >= 3 ? "period" : "lifetime";
  const weakest = conversion.weakestStep(
    basis === "period" ? periodSteps : lifetimeSteps,
  );

  const submissions = {
    basis,
    period: { days, steps: periodSteps, outcomes: periodFlow.outcomes },
    lifetime: { steps: lifetimeSteps, outcomes: lifetimeFlow.outcomes },
    weakest,
    diagnosis: pipeline.diagnose(basis === "period" ? periodFlow : lifetimeFlow),
    readClock: {
      band: clock.typicalBand,
      platformSampled: clock.platformSampled,
      yourMedianDays: clock.medianReviewDays,
      yourSampled: clock.sampled,
      open: openRows,
      states: openStates,
    },
    keptOnFile: pipeline.keptOnFile(applications),
  };

  // ---- Materials — available for every profile
  const lens = await materials.buildLens(profile, images);
  const verdict = materials.materialsVerdict(lens.rings, lens.range);
  const materialsPayload = {
    items: lens.rings,
    range: lens.range,
    ...verdict,
  };

  const decisions = buildDecisions({
    materials: lens.rings,
    range: lens.range,
    open: openRows,
    states: openStates,
    steps: basis === "period" ? periodSteps : lifetimeSteps,
    weakest,
    band: clock.typicalBand,
    periodDays: days,
  });

  const meta = {
    days,
    minor,
    tz,
    generatedAt: now.toISOString(),
  };

  // ---- Minors: materials readiness + submission states ONLY (spec §4).
  if (minor) {
    return {
      meta: { ...meta, smallSample: true, deltasSuppressed: true },
      decisions,
      submissions,
      materials: materialsPayload,
      attention: null,
      book: null,
      momentum: null,
      // Search-demand nudges are aggregate market data (like markets/sources),
      // withheld for minors along with the rest of the attention streams.
      demand: null,
    };
  }

  // ---- Attention streams (adults only past this point)
  const [
    intelEvents,
    priorIntelEvents,
    legacyEvents,
    priorLegacyEvents,
    sessions,
    priorSessions,
  ] = await Promise.all([
    attention.loadIntelEvents(profile.id, since),
    attention.loadIntelEvents(profile.id, priorSince, since),
    attention.loadLegacyEvents(profile.id, since),
    attention.loadLegacyEvents(profile.id, priorSince, since),
    attention.loadVisitorSessions(profile.id, since),
    attention.loadVisitorSessions(profile.id, priorSince, since),
  ]);

  const t345 = attention.tier345Counts({ legacyEvents, intelEvents, sessions });
  const priorT345 = attention.tier345Counts({
    legacyEvents: priorLegacyEvents,
    intelEvents: priorIntelEvents,
    sessions: priorSessions,
  });
  const { reviews, advances } = pipeline.tier12Counts(periodActivities);

  const periodViews = legacyEvents.filter((e) => e.event_type === "view").length;
  const smallSample =
    periodViews < SMALL_N_VIEWS && periodFlow.entered < SMALL_N_SUBMISSIONS;
  const priorEventTotal = priorLegacyEvents.length + priorIntelEvents.length;
  const deltasSuppressed = priorEventTotal < DELTA_MIN_PRIOR_EVENTS;

  const dayKeys = dayRange(since, days);
  const priorDayKeys = dayRange(priorSince, days);

  const activityNow = attention.activityByDay({ legacyEvents, intelEvents, sessions });
  const activityPrior = attention.activityByDay({
    legacyEvents: priorLegacyEvents,
    intelEvents: priorIntelEvents,
    sessions: priorSessions,
  });
  const activityTotal = t345.cardPulls + t345.linkOpens + t345.visits;
  const priorActivityTotal =
    priorT345.cardPulls + priorT345.linkOpens + priorT345.visits;

  const eventDays = pipeline.pipelineEventsByDay(periodActivities);
  const annotations = selfAnnotations({ images, applications, since });

  const attentionPayload = {
    activity: {
      total: activityTotal,
      priorTotal: deltasSuppressed ? null : priorActivityTotal,
      changePct:
        deltasSuppressed || priorActivityTotal === 0
          ? null
          : (activityTotal - priorActivityTotal) / priorActivityTotal,
      series: attention.activitySeries({
        dayKeys,
        priorDayKeys,
        current: activityNow,
        prior: activityPrior,
        comparable: !deltasSuppressed,
      }),
      // Days that carry a cause the talent created, so a step in the line is
      // explainable rather than mysterious.
      annotations: dayKeys
        .map((date) => ({ date, events: annotations[date] || [] }))
        .filter((d) => d.events.length > 0),
      // Agency-side events on the same axis: the top of the signal hierarchy.
      agencyDays: dayKeys
        .map((date) => ({
          date,
          reviews: eventDays[date]?.reviews || 0,
          advances: eventDays[date]?.advances || 0,
        }))
        .filter((d) => d.reviews > 0 || d.advances > 0),
    },
    // Separate, observable event types. Their order does not imply quality.
    composition: [
      { key: "visits", label: "Profile visits", count: t345.visits, tier: 4 },
      { key: "pulls", label: "Card pulls", count: t345.cardPulls, tier: 3 },
      { key: "opens", label: "Link opens", count: t345.linkOpens, tier: 3 },
      { key: "reviews", label: "Agency reviews", count: reviews, tier: 1 },
      { key: "advances", label: "Advances", count: advances, tier: 1 },
    ],
    markets: attention.marketRows(intelEvents, priorIntelEvents, { dayKeys }),
    sources: attention.sourceRows(intelEvents, sessions),
    rhythm: attention.rhythmWindow(legacyEvents, intelEvents, tz),
  };

  const momentum = await buildMomentum(profile.id, {
    applications,
    activitiesByApp,
    now,
  });

  return {
    meta: { ...meta, smallSample, deltasSuppressed },
    decisions,
    submissions,
    materials: materialsPayload,
    attention: attentionPayload,
    book: attention.bookAttention(intelEvents, images),
    momentum,
    demand: null,
  };
}

/**
 * Weekly counts of the things that actually move a career, plus a recent-half
 * vs prior-half comparison.
 *
 * These are counts, not an index: "3 agency reviews" is checkable against the
 * submissions ledger, where "momentum 47" was not checkable against anything.
 */
async function buildMomentum(profileId, { applications, activitiesByApp, now }) {
  const spanDays = MOMENTUM_WEEKS * 7;
  const since = daysAgo(spanDays, now);
  const [intelEvents, legacyEvents, sessions] = await Promise.all([
    attention.loadIntelEvents(profileId, since),
    attention.loadLegacyEvents(profileId, since),
    attention.loadVisitorSessions(profileId, since),
  ]);
  const allActivities = [...activitiesByApp.values()].flat();

  const weeks = [];
  for (let w = 0; w < MOMENTUM_WEEKS; w += 1) {
    const start = daysAgo(spanDays - w * 7, now);
    const end = daysAgo(Math.max(0, spanDays - (w + 1) * 7), now);
    const inWeek = (ts) => {
      const d = parseDbDate(ts);
      return d && d >= start && d < end;
    };

    const weekActivities = allActivities.filter((a) => inWeek(a.created_at));
    const { reviews, advances } = pipeline.tier12Counts(weekActivities);
    const t345 = attention.tier345Counts({
      legacyEvents: legacyEvents.filter((e) => inWeek(e.created_at)),
      intelEvents: intelEvents.filter((e) => inWeek(e.occurred_at)),
      sessions: sessions.filter((s) => inWeek(s.started_at)),
    });

    weeks.push({
      weekStart: start.toISOString().slice(0, 10),
      sent: applications.filter((a) => inWeek(a.created_at)).length,
      reviews,
      advances,
      activity: t345.cardPulls + t345.linkOpens + t345.visits,
    });
  }

  const half = MOMENTUM_WEEKS / 2;
  const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
  const older = weeks.slice(0, half);
  const recent = weeks.slice(half);
  const totals = (rows) => ({
    sent: sum(rows, "sent"),
    reviews: sum(rows, "reviews"),
    advances: sum(rows, "advances"),
    activity: sum(rows, "activity"),
  });

  return {
    weeks,
    halfWeeks: half,
    recent: totals(recent),
    prior: totals(older),
  };
}

/** Scrub detail for one day — aggregate micro-ledger, never identities. */
async function buildIntelDay(profile, date) {
  if (isMinorProfile(profile)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const [intelEvents, legacyEvents, sessions] = await Promise.all([
    attention.loadIntelEvents(profile.id, start, end),
    attention.loadLegacyEvents(profile.id, start, end),
    attention.loadVisitorSessions(profile.id, start, end),
  ]);

  const viewerClasses = { agency: 0, shared: 0, public: 0 };
  const actions = {};
  const marketsCount = new Map();
  for (const e of intelEvents) {
    const viewerClass = e.viewer_class === "client" ? "shared" : e.viewer_class;
    if (viewerClasses[viewerClass] !== undefined)
      viewerClasses[viewerClass] += 1;
    actions[e.action] = (actions[e.action] || 0) + 1;
    if (e.market)
      marketsCount.set(e.market, (marketsCount.get(e.market) || 0) + 1);
  }
  const legacy = {};
  for (const e of legacyEvents) {
    legacy[e.event_type] = (legacy[e.event_type] || 0) + 1;
  }

  return {
    date,
    viewerClasses,
    actions,
    legacy,
    visits: sessions.length,
    markets: [...marketsCount.entries()]
      .map(([market, count]) => ({ market, label: marketLabel(market), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

module.exports = { buildIntel, buildIntelDay };
