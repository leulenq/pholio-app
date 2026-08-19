#!/usr/bin/env node
/**
 * Seed Mia Voss intel data, mirroring production's dual-write capture:
 *   - visitor_sessions        (legacy session stream; id shared with v2 events)
 *   - analytics               (legacy event stream: view / download / bio_read /
 *                              compcard_link_open + texture events)
 *   - profile_events          (Capture v2: viewer_class, market, image, dwell, source)
 *   - share_tokens            (per-recipient links; client sessions arrive through them)
 *   - application_activities  (agency review/advance events — Tier 1 & 2)
 *   - activities              (user activity log entries)
 *
 * The intel backend (src/domains/talent/services/intel/) counts tiers 3–5 from
 * the LEGACY streams and uses v2 events for viewer-class/market/image detail,
 * so both streams must exist and agree — exactly like the live write path
 * (src/routes/portfolio.js + services/intel/capture.js).
 *
 * Safe to re-run: clears old data first then reseeds.
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const knex = require('../src/shared/db/knex');

const MIA_PROFILE_ID = '280c43f9-3da2-4a43-9a7e-bbe93ae02983';
const MIA_USER_ID    = '8f7343b4-cbaf-4e89-9681-e9bf9f2e23ae';

const now = Date.now();
const daysAgo = (n, jitter = 0) =>
  new Date(now - (n - jitter * Math.random()) * 86_400_000).toISOString();

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedRandom(items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
  return items[items.length - 1][0];
}

// ─── CONFIG ─────────────────────────────────────────────────────────────────

// Real market vocabulary from src/domains/talent/services/intel/market-resolve.js
// (industry market slugs, plus a couple of bare country codes the resolver
// falls back to when the city isn't a recognised market).
const MARKETS = [
  ['new-york', 8], ['los-angeles', 6], ['paris', 5], ['london', 4],
  ['berlin', 3], ['milan', 4], ['tokyo', 2], ['sydney', 2],
  ['dubai', 2], ['toronto', 1], ['fr', 1], ['br', 1],
];

// Public-arrival sources use the deriveSource() vocabulary from capture.js.
const PUBLIC_SOURCES = [
  ['instagram', 9], ['direct', 6], ['search', 4], ['tiktok', 2], ['twitter', 1],
];
const SOURCE_REFERRERS = {
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/',
  twitter: 'https://x.com/',
  search: 'https://www.google.com/',
  direct: null,
};

const VIEWER_CLASSES = [
  ['public', 10], ['agency', 4], ['client', 2],
];

// ─── 1. Attention: sessions + dual-stream events + share tokens ─────────────

async function seedAttention(images) {
  console.log('[intel] Clearing old attention data for Mia...');
  await knex('profile_events').where({ profile_id: MIA_PROFILE_ID }).del();
  await knex('analytics').where({ profile_id: MIA_PROFILE_ID }).del();
  await knex('visitor_sessions').where({ profile_id: MIA_PROFILE_ID }).del();
  await knex('share_tokens').where({ profile_id: MIA_PROFILE_ID }).del();

  // Per-recipient share links — client-class sessions arrive through these.
  const shareTokens = [
    { label: 'IMG New York — comp card', kind: 'card' },
    { label: 'Elite London — portfolio', kind: 'portfolio' },
    { label: 'Storm casting brief', kind: 'portfolio' },
  ].map((t) => ({
    id: uuidv4(),
    profile_id: MIA_PROFILE_ID,
    token: crypto.randomBytes(24).toString('base64url'),
    label: t.label,
    kind: t.kind,
    open_count: 0,
    first_opened_at: null,
    last_opened_at: null,
    created_at: daysAgo(75),
    revoked_at: null,
  }));

  const imageIds = images.map((i) => i.id);
  const events = [];        // profile_events (v2)
  const legacy = [];        // analytics (legacy twins + texture)
  const sessions = [];      // visitor_sessions

  const pushLegacy = (eventType, ts, referrer) => {
    legacy.push({
      id: uuidv4(),
      profile_id: MIA_PROFILE_ID,
      event_type: eventType,
      event_source: 'web',
      metadata: JSON.stringify({ referrer: referrer || null }),
      ip_address: null,
      user_agent: null,
      created_at: ts,
    });
  };

  for (let day = 90; day >= 0; day--) {
    // More recent days get more activity; weekends dip a little (bookers rest).
    const recency = 1 + ((90 - day) / 90) * 1.3;
    const dow = new Date(now - day * 86_400_000).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    // One editorial spike ~12 days out (a card went around).
    const spike = day === 12 ? 2.6 : 1;
    const base = isWeekend ? 2.5 : 4;
    const sessionCount = Math.max(
      1,
      Math.round((base + Math.random() * 2.5) * recency * spike),
    );

    for (let s = 0; s < sessionCount; s++) {
      const viewerClass = weightedRandom(VIEWER_CLASSES);
      const market = weightedRandom(MARKETS);
      const shareToken = viewerClass === 'client' ? randomFrom(shareTokens) : null;
      const source =
        viewerClass === 'agency' ? 'agency'
        : shareToken ? (shareToken.kind === 'card' ? 'card_link' : 'share_link')
        : weightedRandom(PUBLIC_SOURCES);
      const referrer = viewerClass === 'public' ? SOURCE_REFERRERS[source] : null;

      const sessionId = uuidv4();
      // Arrival within business hours 8am–10pm UTC.
      const startMs =
        now - day * 86_400_000
        + (8 + Math.floor(Math.random() * 14)) * 3_600_000
        + Math.floor(Math.random() * 3_600_000);
      // ~78% of sessions dwell past the 10s "qualified" line.
      const bounce = Math.random() < 0.22;
      const sessionDwellMs = bounce
        ? Math.floor(1_000 + Math.random() * 8_000)
        : Math.floor(15_000 + Math.random() * 220_000);

      sessions.push({
        id: sessionId,
        profile_id: MIA_PROFILE_ID,
        visitor_id: uuidv4(),
        started_at: new Date(startMs).toISOString(),
        last_activity_at: new Date(startMs + sessionDwellMs).toISOString(),
        ip_address: null,
        user_agent: null,
        referrer,
        is_returning: Math.random() < 0.3,
      });

      let cursorMs = startMs;
      const at = (advanceMs = 0) => {
        cursorMs = Math.min(cursorMs + advanceMs, startMs + sessionDwellMs);
        return new Date(cursorMs).toISOString();
      };
      const pushEvent = (action, extra = {}) => {
        events.push({
          id: uuidv4(),
          profile_id: MIA_PROFILE_ID,
          action,
          viewer_class: viewerClass,
          session_id: sessionId,
          market,
          image_id: null,
          dwell_ms: null,
          share_token_id: shareToken ? shareToken.id : null,
          source,
          referrer,
          metadata: null,
          occurred_at: at(extra.advanceMs || 0),
          ...('imageId' in extra ? { image_id: extra.imageId } : {}),
          ...('dwellMs' in extra ? { dwell_ms: extra.dwellMs } : {}),
        });
      };

      // Every session opens with a portfolio view — dual-written like production.
      pushEvent('view');
      pushLegacy('view', new Date(cursorMs).toISOString(), referrer);
      if (shareToken) {
        // Share-link arrival: the v2 stream is the only place opens live.
        pushEvent('link_open');
        pushLegacy('compcard_link_open', new Date(cursorMs).toISOString(), referrer);
        shareToken.open_count += 1;
        const iso = new Date(cursorMs).toISOString();
        if (!shareToken.first_opened_at) shareToken.first_opened_at = iso;
        shareToken.last_opened_at = iso;
      }
      if (bounce) continue;

      // Browsing depth: impressions, opens, dwell on real frames.
      const frames = Math.min(imageIds.length, 2 + Math.floor(Math.random() * 5));
      for (let f = 0; f < frames && imageIds.length > 0; f++) {
        const imageId = randomFrom(imageIds);
        pushEvent('image_impression', { imageId, advanceMs: 2_000 + Math.random() * 8_000 });
        if (Math.random() < 0.45) {
          pushEvent('image_open', { imageId, advanceMs: 1_000 + Math.random() * 3_000 });
          pushEvent('image_dwell', {
            imageId,
            dwellMs: Math.floor(1_500 + Math.random() * 12_000),
            advanceMs: 2_000 + Math.random() * 10_000,
          });
        }
      }
      if (Math.random() < 0.35) {
        pushEvent('bio_read', { advanceMs: 4_000 + Math.random() * 10_000 });
        pushLegacy('bio_read', new Date(cursorMs).toISOString(), referrer);
      }
      if (Math.random() < 0.3) {
        pushLegacy('scroll_depth', new Date(cursorMs).toISOString(), referrer);
      }
      // Card pulls skew toward agency/client attention.
      const pullChance =
        viewerClass === 'agency' ? 0.35 : viewerClass === 'client' ? 0.3 : 0.08;
      if (Math.random() < pullChance) {
        pushEvent('card_pull', { advanceMs: 5_000 + Math.random() * 15_000 });
        pushLegacy('download', new Date(cursorMs).toISOString(), referrer);
      }
    }
  }

  await knex('share_tokens').insert(shareTokens);
  const CHUNK = 200;
  for (let i = 0; i < sessions.length; i += CHUNK) {
    await knex('visitor_sessions').insert(sessions.slice(i, i + CHUNK));
  }
  for (let i = 0; i < events.length; i += CHUNK) {
    await knex('profile_events').insert(events.slice(i, i + CHUNK));
  }
  for (let i = 0; i < legacy.length; i += CHUNK) {
    await knex('analytics').insert(legacy.slice(i, i + CHUNK));
  }
  console.log(
    `[intel] Inserted ${sessions.length} sessions, ${events.length} profile_events, ` +
    `${legacy.length} analytics rows, ${shareTokens.length} share tokens.`,
  );
}

// ─── 2. application_activities (Tier 1 & 2 signals) ─────────────────────────

async function seedApplicationActivities(applications) {
  console.log('[intel] Clearing old application_activities for Mia...');
  const appIds = applications.map(a => a.id);
  await knex('application_activities').whereIn('application_id', appIds).del();

  const hasTbl = await knex.schema.hasTable('application_activities');
  if (!hasTbl) {
    console.warn('[intel] application_activities table does not exist — skipping');
    return;
  }

  const rows = [];
  // Map of status → activity types that make sense
  const statusActivities = {
    shortlisted: [
      { type: 'profile_viewed', desc: 'Agency viewed profile', days: 3 },
      { type: 'reviewed', desc: 'Profile reviewed by booker', days: 2 },
    ],
    submitted: [
      { type: 'profile_viewed', desc: 'Agency opened submission', days: 5 },
    ],
    accepted: [
      { type: 'profile_viewed', desc: 'Agency viewed profile', days: 14 },
      { type: 'reviewed', desc: 'Profile reviewed by booker', days: 13 },
      { type: 'advanced', desc: 'Moved to second review', days: 10 },
      { type: 'meeting_requested', desc: 'Meeting requested', days: 8 },
      { type: 'offer_extended', desc: 'Offer extended', days: 5 },
    ],
    represented: [
      { type: 'profile_viewed', desc: 'Agency viewed profile', days: 28 },
      { type: 'reviewed', desc: 'Profile reviewed by booker', days: 26 },
      { type: 'advanced', desc: 'Moved to final review', days: 24 },
      { type: 'signed', desc: 'Representation agreement signed', days: 20 },
    ],
    declined: [
      { type: 'profile_viewed', desc: 'Agency viewed profile', days: 45 },
      { type: 'reviewed', desc: 'Profile reviewed', days: 44 },
      { type: 'declined', desc: 'Not a fit at this time', days: 43 },
    ],
  };

  for (const app of applications) {
    const acts = statusActivities[app.status] || [{ type: 'profile_viewed', desc: 'Agency viewed profile', days: 7 }];
    for (const act of acts) {
      const jitter = Math.random() * 0.5;
      rows.push({
        id: uuidv4(),
        application_id: app.id,
        agency_id: app.agency_id,
        user_id: null,
        activity_type: act.type,
        description: act.desc,
        metadata: null,
        created_at: daysAgo(act.days, jitter),
      });
    }
  }

  await knex('application_activities').insert(rows);
  console.log(`[intel] Inserted ${rows.length} application_activities.`);
}

// ─── 3. activities (user activity log, 25 entries over 30 days) ─────────────

async function seedActivities() {
  console.log('[intel] Clearing old activities for Mia...');
  await knex('activities').where({ user_id: MIA_USER_ID }).del();

  const THEMES = ['editorial', 'minimal', 'bold'];
  const templates = [
    { type: 'image_uploaded',           meta: () => ({ imageCount: 1 + Math.floor(Math.random() * 3) }) },
    { type: 'profile_updated',          meta: () => ({ fields: [randomFrom(['bio', 'measurements', 'city', 'training'])] }) },
    { type: 'pdf_downloaded',           meta: () => ({ theme: randomFrom(THEMES) }) },
    { type: 'portfolio_viewed',         meta: () => ({ source: randomFrom(['direct', 'instagram', 'google']) }) },
    { type: 'submission_package_created', meta: () => ({ imageCount: 4 + Math.floor(Math.random() * 3) }) },
    { type: 'application_submitted',    meta: () => ({ agencyName: randomFrom(['Lumen Model Management', 'Meridian Talent Collective', 'Harbor Model Management']) }) },
  ];

  const rows = [];
  // 25 entries, biased toward the last 14 days
  for (let i = 0; i < 25; i++) {
    const bias = Math.random() < 0.7
      ? Math.floor(Math.random() * 14)
      : 14 + Math.floor(Math.random() * 16);
    const t = new Date(now - bias * 86_400_000);
    t.setHours(9 + Math.floor(Math.random() * 10));
    t.setMinutes(Math.floor(Math.random() * 60));
    const tmpl = randomFrom(templates);
    rows.push({
      id: uuidv4(),
      user_id: MIA_USER_ID,
      activity_type: tmpl.type,
      metadata: JSON.stringify(tmpl.meta()),
      created_at: t.toISOString(),
    });
  }

  // Sort oldest-first
  rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  await knex('activities').insert(rows);
  console.log(`[intel] Inserted ${rows.length} activities.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log('[intel] Starting intel seed for Mia Voss...\n');

    // Load Mia's images and applications
    const [images, applications] = await Promise.all([
      knex('images')
        .where({ profile_id: MIA_PROFILE_ID })
        .select('id', 'label', 'image_type'),
      knex('applications')
        .where({ profile_id: MIA_PROFILE_ID })
        .select('id', 'status', 'agency_id'),
    ]);

    console.log(`[intel] Found ${images.length} images, ${applications.length} applications`);

    await seedAttention(images);
    await seedApplicationActivities(applications);
    await seedActivities();

    // Verify counts
    const [pe, an, vs, aa, ac] = await Promise.all([
      knex('profile_events').where({ profile_id: MIA_PROFILE_ID }).count('* as c').first(),
      knex('analytics').where({ profile_id: MIA_PROFILE_ID }).count('* as c').first(),
      knex('visitor_sessions').where({ profile_id: MIA_PROFILE_ID }).count('* as c').first(),
      knex('application_activities')
        .whereIn('application_id', applications.map(a => a.id))
        .count('* as c').first(),
      knex('activities').where({ user_id: MIA_USER_ID }).count('* as c').first(),
    ]);

    console.log('\n[intel] Final counts:');
    console.log(JSON.stringify({
      profile_events: pe.c,
      analytics: an.c,
      visitor_sessions: vs.c,
      application_activities: aa.c,
      activities: ac.c,
    }, null, 2));
    console.log('\n[intel] Done ✓');
  } catch (err) {
    console.error('[intel] Failed:', err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

main();
