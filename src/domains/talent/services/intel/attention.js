/**
 * Attention loading + aggregation for the intel page (spec §2, §3 zones 1–3, 5).
 *
 * Reads BOTH streams:
 *  - `profile_events` (Capture v2: viewer_class, market, image, share, source)
 *  - legacy `analytics` + `visitor_sessions` (already flowing since day one)
 *
 * Counting integrity (spec §4): agency-classified events never count toward
 * public reach; self events are never written in the first place.
 */

const knex = require("../../../../shared/db/knex");
const { whereSince, whereBefore, parseDbDate, dayKey } = require("./db-utils");
const { marketLabel } = require("../market-resolve");

async function tableExists(name) {
  try {
    return await knex.schema.hasTable(name);
  } catch {
    return false;
  }
}

async function loadIntelEvents(profileId, since, before = null) {
  if (!(await tableExists("profile_events"))) return [];
  let qb = knex("profile_events").where({ profile_id: profileId });
  qb = whereSince(qb, "occurred_at", since);
  if (before) qb = whereBefore(qb, "occurred_at", before);
  return qb.select(
    "action",
    "viewer_class",
    "session_id",
    "market",
    "image_id",
    "dwell_ms",
    "share_token_id",
    "source",
    "occurred_at",
  );
}

async function loadLegacyEvents(profileId, since, before = null) {
  let qb = knex("analytics").where({ profile_id: profileId });
  qb = whereSince(qb, "created_at", since);
  if (before) qb = whereBefore(qb, "created_at", before);
  return qb.select("event_type", "created_at");
}

async function loadVisitorSessions(profileId, since, before = null) {
  let qb = knex("visitor_sessions").where({ profile_id: profileId });
  qb = whereSince(qb, "started_at", since);
  if (before) qb = whereBefore(qb, "started_at", before);
  return qb.select("id", "started_at", "last_activity_at", "referrer");
}

const CARD_PULL_LEGACY = new Set(["download"]);
const LINK_OPEN_LEGACY = new Set(["compcard_link_open"]);

/**
 * Tier-3 strikes per day: card pulls and link opens, merged across streams.
 * Capture-v2 card_pull rows have a legacy 'download' twin (dual write), so v2
 * pull rows are used only for viewer-class/market breakdowns, not day counts.
 */
function strikesByDay(legacyEvents, intelEvents) {
  const pulls = {};
  const opens = {};
  for (const e of legacyEvents) {
    const k = dayKey(e.created_at);
    if (!k) continue;
    if (CARD_PULL_LEGACY.has(e.event_type)) pulls[k] = (pulls[k] || 0) + 1;
    if (LINK_OPEN_LEGACY.has(e.event_type)) opens[k] = (opens[k] || 0) + 1;
  }
  for (const e of intelEvents) {
    // Share-token opens exist only in the v2 stream.
    if (e.action === "link_open" && e.share_token_id) {
      const k = dayKey(e.occurred_at);
      if (k) opens[k] = (opens[k] || 0) + 1;
    }
  }
  return { pulls, opens };
}

function countByDay(rows, dateField) {
  const out = {};
  for (const r of rows) {
    const k = dayKey(r[dateField]);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const DOW_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Day-of-week + hour in the talent's own zone.
 *
 * The old grid bucketed on getUTCDay()/getUTCHours() and then labelled the
 * result as clock time, so "attention arrives Tuesday evenings" was wrong by
 * the reader's UTC offset — advice that actively misfires. Intl does the zone
 * and DST properly; the formatter is built once per call site.
 */
function makeLocalParts(tz) {
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
  } catch {
    fmt = null; // unknown zone → fall back to UTC below
  }
  return (date) => {
    if (!fmt) return { dow: date.getUTCDay(), hour: date.getUTCHours() };
    const parts = fmt.formatToParts(date);
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    return {
      dow: DOW_INDEX[weekday] ?? date.getUTCDay(),
      // hour12:false can emit 24 for midnight in some ICU versions.
      hour: Number.isFinite(hour) ? hour % 24 : date.getUTCHours(),
    };
  };
}

// Three-hour blocks: 56 buckets instead of 168, so a real pattern can clear
// the noise floor at the sample sizes talent profiles actually produce.
const BLOCK_HOURS = 3;
const BLOCKS_PER_DAY = 24 / BLOCK_HOURS;
const MIN_RHYTHM_EVENTS = 24;
const RHYTHM_LIFT = 1.6; // peak must beat a flat distribution by this much

/**
 * When attention arrives, as one claimable window — or nothing.
 *
 * Returns null rather than a grid: a 168-cell heat map over 30 sparse events is
 * noise wearing the costume of a finding. A window is only claimed when there
 * is enough volume AND the peak block genuinely stands above uniform.
 */
function rhythmWindow(legacyEvents, intelEvents, tz) {
  const localParts = makeLocalParts(tz);
  const blocks = Array.from({ length: 7 }, () => Array(BLOCKS_PER_DAY).fill(0));
  let total = 0;

  const add = (ts) => {
    const d = parseDbDate(ts);
    if (!d || isNaN(d.getTime())) return;
    const { dow, hour } = localParts(d);
    blocks[dow][Math.floor(hour / BLOCK_HOURS)] += 1;
    total += 1;
  };

  for (const e of legacyEvents) {
    if (e.event_type === "view" || CARD_PULL_LEGACY.has(e.event_type)) {
      add(e.created_at);
    }
  }
  for (const e of intelEvents) {
    if (e.action === "link_open" && e.share_token_id) add(e.occurred_at);
  }

  if (total < MIN_RHYTHM_EVENTS) return { total, window: null, tz: tz || "UTC" };

  let peak = null;
  blocks.forEach((row, dow) =>
    row.forEach((count, block) => {
      if (!peak || count > peak.count) peak = { dow, block, count };
    }),
  );

  const uniform = total / (7 * BLOCKS_PER_DAY);
  if (!peak || peak.count < uniform * RHYTHM_LIFT) {
    return { total, window: null, tz: tz || "UTC" };
  }

  return {
    total,
    tz: tz || "UTC",
    window: {
      dow: peak.dow,
      startHour: peak.block * BLOCK_HOURS,
      endHour: peak.block * BLOCK_HOURS + BLOCK_HOURS,
      count: peak.count,
      share: peak.count / total,
    },
  };
}

/** Factual traffic and action counts. No dwell/referrer threshold implies intent. */
function tier345Counts({ legacyEvents, intelEvents, sessions }) {
  const pulls = legacyEvents.filter((e) =>
    CARD_PULL_LEGACY.has(e.event_type),
  ).length;
  const linkOpens =
    legacyEvents.filter((e) => LINK_OPEN_LEGACY.has(e.event_type)).length +
    intelEvents.filter((e) => e.action === "link_open" && e.share_token_id)
      .length;

  // Agency-authenticated attention must not inflate public reach (§4).
  const agencySessionIds = new Set(
    intelEvents
      .filter((e) => e.viewer_class === "agency" && e.session_id)
      .map((e) => e.session_id),
  );
  const publicSessions = sessions.filter((s) => !agencySessionIds.has(s.id));

  return { cardPulls: pulls, linkOpens, visits: publicSessions.length };
}

/**
 * Recorded profile activity per day: visits, card pulls, and shared-link opens.
 * These are observable actions, not evidence of a viewer's intent.
 */
function activityByDay({ legacyEvents, intelEvents, sessions }) {
  const strikes = strikesByDay(legacyEvents, intelEvents);
  const visits = visitsByDay(sessions, intelEvents);
  const out = {};
  for (const map of [strikes.pulls, strikes.opens, visits]) {
    for (const [day, n] of Object.entries(map)) out[day] = (out[day] || 0) + n;
  }
  return out;
}

/**
 * The current window against the one before it, aligned by position so the two
 * lines can share one axis. `prior` is null when the earlier window is too thin
 * to compare against honestly — a comparison drawn from three events is a
 * decoration, not a benchmark.
 */
function activitySeries({ dayKeys, priorDayKeys, current, prior, comparable }) {
  return dayKeys.map((date, i) => ({
    date,
    activity: current[date] || 0,
    prior: comparable ? prior[priorDayKeys[i]] || 0 : null,
  }));
}

/** Public visitor sessions per day, excluding sessions classified as agency. */
function visitsByDay(sessions, intelEvents) {
  const agencySessionIds = new Set(
    intelEvents
      .filter((e) => e.viewer_class === "agency" && e.session_id)
      .map((e) => e.session_id),
  );
  const out = {};
  for (const s of sessions) {
    if (agencySessionIds.has(s.id)) continue;
    const k = dayKey(s.started_at);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * Market Board rows from capture-v2 events. Calibrating until enough located
 * attention has accrued to be honest.
 */
function marketRows(
  intelEvents,
  priorIntelEvents,
  { minLocated = 10, dayKeys = [] } = {},
) {
  const located = intelEvents.filter((e) => e.market);
  const priorLocated = priorIntelEvents.filter((e) => e.market);
  const total = located.length;

  const byMarket = new Map();
  for (const e of located) {
    const entry =
      byMarket.get(e.market) ||
      { count: 0, mix: { agency: 0, shared: 0, public: 0 }, days: {} };
    entry.count += 1;
    const viewerClass = e.viewer_class === "client" ? "shared" : e.viewer_class;
    if (entry.mix[viewerClass] !== undefined) entry.mix[viewerClass] += 1;
    const k = dayKey(e.occurred_at);
    if (k) entry.days[k] = (entry.days[k] || 0) + 1;
    byMarket.set(e.market, entry);
  }
  const priorByMarket = new Map();
  for (const e of priorLocated) {
    priorByMarket.set(e.market, (priorByMarket.get(e.market) || 0) + 1);
  }

  const rows = [...byMarket.entries()]
    .map(([market, entry]) => ({
      market,
      label: marketLabel(market),
      count: entry.count,
      share: total > 0 ? entry.count / total : 0,
      // Delta only when the prior period is big enough to be honest (§3).
      delta:
        priorLocated.length >= minLocated
          ? entry.count - (priorByMarket.get(market) || 0)
          : null,
      mix: entry.mix,
      // Aligned to the window's day keys. This used to ship as a date-keyed
      // object, which the frontend sparkline rejected with Array.isArray — the
      // chart silently rendered its empty placeholder for every market.
      series: dayKeys.map((k) => entry.days[k] || 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { calibrating: total < minLocated, totalLocated: total, rows };
}

/** Source narrative rows (never a donut chart — a ranked list). */
function sourceRows(intelEvents, sessions) {
  const counts = new Map();
  const bump = (source) => {
    if (!source) return;
    counts.set(source, (counts.get(source) || 0) + 1);
  };
  const viewEvents = intelEvents.filter((e) => e.action === "view");
  for (const e of viewEvents) bump(e.source);
  if (viewEvents.length === 0) {
    // Fall back to legacy session referrers until capture v2 accrues.
    for (const s of sessions) {
      if (!s.referrer) {
        bump("direct");
        continue;
      }
      try {
        const host = new URL(s.referrer).hostname.replace(/^www\./, "");
        if (/instagram\.com$/.test(host)) bump("instagram");
        else if (/tiktok\.com$/.test(host)) bump("tiktok");
        else if (/(twitter|x)\.com$/.test(host)) bump("twitter");
        else if (/(google|bing|duckduckgo)\./.test(host)) bump("search");
        else bump(host.slice(0, 60));
      } catch {
        bump("direct");
      }
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([source, count]) => ({
      source,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/** Image-level attention for The Book, Ranked (zone 5). */
function bookAttention(intelEvents, images, { minEvents = 25 } = {}) {
  const imageEvents = intelEvents.filter(
    (e) => e.image_id && e.action.startsWith("image_"),
  );
  const byImage = new Map();
  for (const e of imageEvents) {
    const entry =
      byImage.get(e.image_id) || { impressions: 0, opens: 0, dwellMs: 0 };
    if (e.action === "image_impression") entry.impressions += 1;
    if (e.action === "image_open") entry.opens += 1;
    if (e.action === "image_dwell" && Number.isFinite(Number(e.dwell_ms))) {
      entry.dwellMs += Number(e.dwell_ms);
    }
    byImage.set(e.image_id, entry);
  }

  const scored = images.map((img) => {
    const a = byImage.get(img.id) || { impressions: 0, opens: 0, dwellMs: 0 };
    return {
      id: img.id,
      url: img.public_url || img.path,
      label: img.label || null,
      shotType: img.shot_type || null,
      imageType: img.image_type || null,
      isPrimary: Boolean(img.is_primary),
      impressions: a.impressions,
      opens: a.opens,
      dwellMs: a.dwellMs,
      // Open rate is the honest, comparable metric: of the people who saw this
      // frame in the grid, how many opened it. The previous ranking multiplied
      // opens, dwell and impressions into a unitless "score" that could not be
      // checked against anything or compared between two frames.
      openRate: a.impressions > 0 ? a.opens / a.impressions : null,
      avgDwellMs: a.opens > 0 ? Math.round(a.dwellMs / a.opens) : null,
    };
  });

  const calibrating = imageEvents.length < minEvents;
  // Only frames that were actually shown can be ranked; an unseen frame is
  // unranked, not last.
  const SEEN = 5;
  const rankable = scored.filter((s) => s.impressions >= SEEN);

  if (!calibrating && rankable.length >= 2) {
    [...rankable]
      .sort((a, b) => b.openRate - a.openRate || b.avgDwellMs - a.avgDwellMs)
      .forEach((img, i) => {
        img.rank = i + 1;
      });
    for (const img of scored) {
      if (img.rank == null) img.rank = null;
      img.flags = [];
      if (img.rank === 1) img.flags.push("most_opened");
      if (img.rank === rankable.length && rankable.length >= 3) {
        img.flags.push("most_skipped");
      }
      if (img.impressions < SEEN) img.flags.push("unseen");
    }
  } else {
    for (const img of scored) {
      img.rank = null;
      img.flags = [];
    }
  }

  const front = scored.find((s) => s.isPrimary);
  return {
    calibrating: calibrating || rankable.length < 2,
    totalEvents: imageEvents.length,
    ranked: rankable.length,
    // The decision the ranking exists to support: is the frame you lead with
    // the frame that earns attention?
    cardFront:
      front && front.rank != null
        ? { id: front.id, rank: front.rank, of: rankable.length }
        : null,
    best: rankable.length >= 2
      ? (() => {
          const top = rankable.find((r) => r.rank === 1);
          return top ? { id: top.id, openRate: top.openRate } : null;
        })()
      : null,
    images: scored,
  };
}

module.exports = {
  loadIntelEvents,
  loadLegacyEvents,
  loadVisitorSessions,
  strikesByDay,
  countByDay,
  rhythmWindow,
  tier345Counts,
  visitsByDay,
  activityByDay,
  activitySeries,
  marketRows,
  sourceRows,
  bookAttention,
};
