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
const { marketLabel } = require("./market-resolve");

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

/** 7×24 grid (UTC dow × hour) of attention arrivals. */
function rhythmGrid(legacyEvents, intelEvents) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let total = 0;
  const add = (ts) => {
    const d = parseDbDate(ts);
    if (!d || isNaN(d.getTime())) return;
    grid[d.getUTCDay()][d.getUTCHours()] += 1;
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
  let peak = null;
  let max = 0;
  grid.forEach((row, dow) =>
    row.forEach((count, hour) => {
      if (count > max) {
        max = count;
        peak = { dow, hour };
      }
    }),
  );
  return { grid, total, peak };
}

/** Attention composition by tier for the Signal Spectrum (tiers 3–5 here). */
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

  // Qualified visit: real dwell (activity beyond arrival) or an external
  // referrer — a person, not passing traffic.
  const qualified = publicSessions.filter((s) => {
    const started = parseDbDate(s.started_at);
    const last = parseDbDate(s.last_activity_at);
    const dwell = started && last ? last.getTime() - started.getTime() : 0;
    return dwell >= 10_000 || Boolean(s.referrer);
  }).length;

  const totalViews = legacyEvents.filter((e) => e.event_type === "view").length;
  const agencyViews = intelEvents.filter(
    (e) => e.action === "view" && e.viewer_class === "agency",
  ).length;
  const reach = Math.max(0, totalViews - agencyViews - qualified);

  return { cardPulls: pulls, linkOpens, qualified, reach };
}

/** Qualified visits per day (base layer of the Seismograph). */
function qualifiedByDay(sessions, intelEvents) {
  const agencySessionIds = new Set(
    intelEvents
      .filter((e) => e.viewer_class === "agency" && e.session_id)
      .map((e) => e.session_id),
  );
  const out = {};
  for (const s of sessions) {
    if (agencySessionIds.has(s.id)) continue;
    const started = parseDbDate(s.started_at);
    const last = parseDbDate(s.last_activity_at);
    const dwell = started && last ? last.getTime() - started.getTime() : 0;
    if (dwell >= 10_000 || Boolean(s.referrer)) {
      const k = dayKey(s.started_at);
      if (k) out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}

/**
 * Market Board rows from capture-v2 events. Calibrating until enough located
 * attention has accrued to be honest.
 */
function marketRows(intelEvents, priorIntelEvents, { minLocated = 10 } = {}) {
  const located = intelEvents.filter((e) => e.market);
  const priorLocated = priorIntelEvents.filter((e) => e.market);
  const total = located.length;

  const byMarket = new Map();
  for (const e of located) {
    const entry =
      byMarket.get(e.market) ||
      { count: 0, mix: { agency: 0, client: 0, public: 0 }, days: {} };
    entry.count += 1;
    if (entry.mix[e.viewer_class] !== undefined) entry.mix[e.viewer_class] += 1;
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
      days: entry.days,
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
      score: a.opens * 3 + a.dwellMs / 4000 + a.impressions * 0.5,
    };
  });

  const calibrating = imageEvents.length < minEvents;
  if (!calibrating) {
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    ranked.forEach((img, i) => {
      img.rank = i + 1;
    });
    const maxDwell = Math.max(...scored.map((s) => s.dwellMs), 1);
    for (const img of scored) {
      img.dwellShare = img.dwellMs / maxDwell;
      img.flags = [];
      if (img.rank === 1 && img.opens > 0) img.flags.push("most_opened");
      if (
        img.impressions >= 5 &&
        img.opens === 0 &&
        img.dwellMs < 1500 * Math.max(1, img.impressions / 5)
      ) {
        img.flags.push("most_skipped");
      }
    }
  } else {
    for (const img of scored) {
      img.rank = null;
      img.dwellShare = 0;
      img.flags = [];
    }
  }

  return { calibrating, totalEvents: imageEvents.length, images: scored };
}

module.exports = {
  loadIntelEvents,
  loadLegacyEvents,
  loadVisitorSessions,
  strikesByDay,
  countByDay,
  rhythmGrid,
  tier345Counts,
  qualifiedByDay,
  marketRows,
  sourceRows,
  bookAttention,
};
