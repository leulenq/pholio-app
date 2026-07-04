/**
 * Composed intel payload (spec §6 backend shape): one read for the whole page
 * — pulse, seismograph, rhythm, markets, sources, pipeline, book, lens,
 * trajectory — plus the per-day scrub detail.
 *
 * Non-negotiables enforced here (spec §4):
 *  - agency attention only in aggregate (no per-agency view logs anywhere)
 *  - minors: no geo/viewer detail at all — materials + submission states only
 *  - small-n honesty: deltas only when the prior period has ≥ 10 events;
 *    percentage suppression flagged below ~20 views / 2 submissions
 */

const knex = require("../../../../shared/db/knex");
const { daysAgo, dayRange, dayKey, parseDbDate } = require("./db-utils");
const { isMinorProfile } = require("../../../../shared/lib/talent-age");
const { marketLabel } = require("./market-resolve");
const attention = require("./attention");
const pipeline = require("./pipeline");
const materials = require("./materials");

const MOMENTUM_WEIGHTS = { t1: 8, t2: 5, t3: 3, t4: 1 };
const DELTA_MIN_PRIOR_EVENTS = 10;
const SMALL_N_VIEWS = 20;
const SMALL_N_SUBMISSIONS = 2;

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

async function buildIntel(profile, { days }) {
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

  // ---- Pipeline (zone 4) + tiers 1–2 — available for every profile
  const { reviews, advances } = pipeline.tier12Counts(periodActivities);
  const periodFlow = pipeline.flowCounts(periodApplications, activitiesByApp);
  const lifetimeFlow = pipeline.flowCounts(applications, activitiesByApp);
  const clock = await pipeline.stageClock(profile.id, applications);
  const inMotionRows = pipeline.inMotion(applications);

  // ---- Lens (zone 6) — available for every profile
  const lens = await materials.buildLens(profile, images);
  const verdict = materials.materialsVerdict(lens.rings);

  const pipelinePayload = {
    period: periodFlow,
    lifetime: lifetimeFlow,
    diagnosis: pipeline.diagnose(periodFlow.entered >= 2 ? periodFlow : lifetimeFlow),
    stageClock: clock,
    keptOnFile: pipeline.keptOnFile(applications),
  };

  const meta = {
    days,
    minor,
    generatedAt: now.toISOString(),
    weights: MOMENTUM_WEIGHTS,
  };

  // ---- Minors: materials readiness + submission states ONLY (spec §4).
  if (minor) {
    return {
      meta: { ...meta, smallSample: true, deltasSuppressed: true },
      pulse: {
        headline: null,
        spectrum: null,
        inMotion: inMotionRows,
        materials: verdict,
      },
      seismograph: null,
      rhythm: null,
      markets: null,
      sources: null,
      pipeline: pipelinePayload,
      book: null,
      lens: {
        ...lens,
        nextMoves: materials.nextMoves({
          rings: lens.rings,
          range: lens.range,
          inMotionRows,
          flow: lifetimeFlow,
          periodDays: days,
        }),
      },
      trajectory: null,
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
  const periodViews = legacyEvents.filter((e) => e.event_type === "view").length;
  const smallSample =
    periodViews < SMALL_N_VIEWS && periodFlow.entered < SMALL_N_SUBMISSIONS;
  const priorEventTotal = priorLegacyEvents.length + priorIntelEvents.length;
  const deltasSuppressed = priorEventTotal < DELTA_MIN_PRIOR_EVENTS;

  // ---- Zone 1 — Pulse
  const markets = attention.marketRows(intelEvents, priorIntelEvents);
  const topMarket = markets.rows[0] || null;
  const spectrum = [
    { tier: 1, key: "reviews", count: reviews },
    { tier: 2, key: "advances", count: advances },
    { tier: 3, key: "pulls", count: t345.cardPulls + t345.linkOpens },
    { tier: 4, key: "qualified", count: t345.qualified },
    { tier: 5, key: "reach", count: t345.reach },
  ];

  // ---- Zone 2 — Seismograph + Rhythm Field
  const strikes = attention.strikesByDay(legacyEvents, intelEvents);
  const qualifiedDays = attention.qualifiedByDay(sessions, intelEvents);
  const eventDays = pipeline.pipelineEventsByDay(periodActivities);
  const annotations = selfAnnotations({ images, applications, since });
  const seismographDays = dayRange(since, days).map((date) => ({
    date,
    qualified: qualifiedDays[date] || 0,
    pulls: strikes.pulls[date] || 0,
    opens: strikes.opens[date] || 0,
    reviews: eventDays[date]?.reviews || 0,
    advances: eventDays[date]?.advances || 0,
    annotations: annotations[date] || [],
  }));
  const priorQualifiedDays = attention.qualifiedByDay(
    priorSessions,
    priorIntelEvents,
  );
  const prior = deltasSuppressed
    ? null
    : dayRange(priorSince, days).map((date) => ({
        date,
        qualified: priorQualifiedDays[date] || 0,
      }));

  // ---- Zone 7 — Trajectory (momentum composite over 90 days, inspectable)
  const trajectory = await buildTrajectory(profile.id, {
    applications,
    activitiesByApp,
    now,
  });

  return {
    meta: { ...meta, smallSample, deltasSuppressed },
    pulse: {
      headline: {
        reviews,
        advances,
        cardPulls: t345.cardPulls,
        linkOpens: t345.linkOpens,
        topMarket: topMarket
          ? {
              market: topMarket.market,
              label: topMarket.label || marketLabel(topMarket.market),
              share: topMarket.share,
            }
          : null,
      },
      spectrum,
      inMotion: inMotionRows,
      materials: verdict,
    },
    seismograph: {
      days: seismographDays,
      prior,
      hasStrikes: Object.keys(strikes.pulls).length + Object.keys(strikes.opens).length > 0,
    },
    rhythm: attention.rhythmGrid(legacyEvents, intelEvents),
    markets,
    sources: { rows: attention.sourceRows(intelEvents, sessions) },
    pipeline: pipelinePayload,
    book: attention.bookAttention(intelEvents, images),
    lens: {
      ...lens,
      nextMoves: materials.nextMoves({
        rings: lens.rings,
        range: lens.range,
        inMotionRows,
        flow: periodFlow.entered > 0 ? periodFlow : lifetimeFlow,
        periodDays: days,
      }),
    },
    trajectory,
  };
}

/**
 * Momentum line over 90 days: weekly composite of Tier 1–4 events with the
 * composition always inspectable — never a hidden formula. The benchmark band
 * ships only when population size makes it honest; until then it renders as
 * "calibrating" (spec zone 7). Never faked.
 */
async function buildTrajectory(profileId, { applications, activitiesByApp, now }) {
  const since = daysAgo(90, now);
  const [intelEvents, legacyEvents, sessions] = await Promise.all([
    attention.loadIntelEvents(profileId, since),
    attention.loadLegacyEvents(profileId, since),
    attention.loadVisitorSessions(profileId, since),
  ]);
  const allActivities = [...activitiesByApp.values()].flat();

  const weeks = [];
  for (let w = 0; w < 13; w += 1) {
    const start = daysAgo(90 - w * 7, now);
    const end = daysAgo(Math.max(0, 90 - (w + 1) * 7), now);
    const inWeek = (ts) => {
      const d = parseDbDate(ts);
      return d && d >= start && d < end;
    };

    const weekActivities = allActivities.filter((a) => inWeek(a.created_at));
    const { reviews, advances } = pipeline.tier12Counts(weekActivities);
    const weekLegacy = legacyEvents.filter((e) => inWeek(e.created_at));
    const weekIntel = intelEvents.filter((e) => inWeek(e.occurred_at));
    const weekSessions = sessions.filter((s) => inWeek(s.started_at));
    const t345 = attention.tier345Counts({
      legacyEvents: weekLegacy,
      intelEvents: weekIntel,
      sessions: weekSessions,
    });

    const components = {
      t1: reviews,
      t2: advances,
      t3: t345.cardPulls + t345.linkOpens,
      t4: t345.qualified,
    };
    weeks.push({
      weekStart: start.toISOString().slice(0, 10),
      value:
        components.t1 * MOMENTUM_WEIGHTS.t1 +
        components.t2 * MOMENTUM_WEIGHTS.t2 +
        components.t3 * MOMENTUM_WEIGHTS.t3 +
        components.t4 * MOMENTUM_WEIGHTS.t4,
      components,
    });
  }

  return {
    weeks,
    weights: MOMENTUM_WEIGHTS,
    // Cohort percentile bands are deferred until the population supports
    // honest anonymized comparison (spec §8 build order, step 4).
    band: null,
    bandState: "calibrating",
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

  const viewerClasses = { agency: 0, client: 0, public: 0 };
  const actions = {};
  const marketsCount = new Map();
  for (const e of intelEvents) {
    if (viewerClasses[e.viewer_class] !== undefined)
      viewerClasses[e.viewer_class] += 1;
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

module.exports = { buildIntel, buildIntelDay, MOMENTUM_WEIGHTS };
