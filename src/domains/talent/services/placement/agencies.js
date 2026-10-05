"use strict";

/**
 * Placement — where to go (tasks/intel-placement.md §3).
 *
 * Every agency Pholio knows about, for this talent, in the order a mother agent
 * would work through them. Three sources, each a fact Pholio already holds:
 *
 *   - published requirements: the spec registry, evaluated against this
 *     talent by the same preflight the apply flow uses. A conflict is quoted in
 *     the agency's own words, with its source and review date.
 *   - the agency itself: Pholio agencies' open boards and location, and
 *     whether a submission can be delivered through Pholio.
 *   - the talent's own history with that agency: open submissions, passes and
 *     their reasons, and when trying again makes sense.
 *
 * Nothing is scored. Agencies are grouped, never ranked by a number.
 */

const knex = require("../../../../shared/db/knex");
const {
  preflightRegistry,
  listRegistryRoutes,
} = require("../../../spec-registry/preflight-service");
const { closingDates } = require("../../../../shared/lib/application-auto-close");
const {
  AWAITING_AGENCY_APPLICATION_STATUSES,
  AUTO_CLOSED_APPLICATION_STATUS,
} = require("../../../../shared/constants/application-status");
const { getBlockedAgencyIds } = require("../../../../shared/lib/blocked-agencies");
const { registryTaxonomyLabels } = require("../../../spec-registry/taxonomy-labels");

/**
 * A shot's name in the registry's own vocabulary, so "CLOSE-UP" and
 * "Close up photo" from two agencies read as one shot. Falls back to the
 * agency's wording when the slot is not mapped to the taxonomy.
 */
function shotLabel(finding) {
  const labels = registryTaxonomyLabels();
  const one = (field, value) => labels?.[field]?.values?.[value]?.label || null;
  if (finding.field && finding.matchValue) {
    const label = one(finding.field, finding.matchValue);
    if (label) return label;
  }
  if (Array.isArray(finding.matchValues) && finding.matchValues.length) {
    const parts = finding.matchValues
      .map((m) => (m && typeof m === "object" ? one(m.field, m.value) : null))
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return finding.sourceLabel;
}

const DAY = 86_400_000;
const AWAITING = new Set(AWAITING_AGENCY_APPLICATION_STATUSES);
const IN_MOTION = new Set(["requested_more", "meeting_requested", "development", "accepted"]);
const PASSED = new Set(["passed", "declined", "archived"]);

/**
 * When trying an agency again is reasonable, by what they said.
 *
 * Pholio's guide, not the agency's rule: most agencies ask talent to wait
 * before resubmitting, and a pass for a reason about the agency ("board is
 * full") reopens sooner than one about fit. `materials` reopens on new
 * digitals rather than a date, and `market` doesn't reopen at all.
 */
const AGAIN = {
  board_full: { days: 120, says: "Their board was full." },
  not_a_fit: { days: 180, says: "They said the board they are building needs something different." },
  materials: { days: null, onNewDigitals: true, says: "They could not assess your submission from the materials." },
  market: { days: null, never: true, says: "They said an agency in another market is likelier to suit you." },
  experience: { days: 365, says: "They are looking for more experience." },
  unstated: { days: 180, says: "They passed without giving a reason." },
  kept_on_file: { days: 180, says: "They kept you on file." },
  [AUTO_CLOSED_APPLICATION_STATUS]: { days: 180, says: "It closed with no reply." },
};

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  if (/^\d{11,}$/.test(s)) return new Date(Number(s));
  return new Date(s.includes("T") || s.length <= 10 ? s : `${s.replace(" ", "T")}Z`);
}

function iso(date) {
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function parseBoards(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

async function hasColumn(table, column) {
  try {
    return await knex.schema.hasColumn(table, column);
  } catch {
    return false;
  }
}

async function loadPholioAgencies(userId) {
  const [orgKind, windowCol] = await Promise.all([
    hasColumn("agencies", "org_kind"),
    hasColumn("agencies", "application_review_window_days"),
  ]);
  const blocked = await getBlockedAgencyIds(knex, userId).catch(() => new Set());
  const rows = await knex("agencies")
    .where({ status: "ACTIVE" })
    .modify((qb) => {
      if (orgKind) qb.where("org_kind", "agency");
    })
    .select(
      "id",
      "name",
      "location",
      "open_boards",
      "website",
      ...(windowCol ? ["application_review_window_days"] : []),
    );
  const blockedSet = blocked instanceof Set ? blocked : new Set(blocked || []);
  return rows.filter((r) => !blockedSet.has(r.id));
}

async function loadApplications(profileId) {
  const [eventCols, reasonCol, windowCol] = await Promise.all([
    hasColumn("applications", "call_purpose"),
    hasColumn("applications", "decline_reason"),
    hasColumn("agencies", "application_review_window_days"),
  ]);
  const qb = knex("applications")
    .join("agencies", "applications.agency_id", "agencies.id")
    .where("applications.profile_id", profileId)
    .select(
      "applications.id",
      "applications.agency_id",
      "applications.status",
      "applications.created_at",
      "applications.updated_at",
      ...(reasonCol ? ["applications.decline_reason"] : []),
      ...(windowCol ? ["agencies.application_review_window_days"] : []),
    );
  if (eventCols) {
    qb.leftJoin("agency_open_call_links as call_link", "call_link.id", "applications.open_call_link_id").select(
      "applications.call_purpose",
      "applications.status_changed_at",
      "call_link.review_window_days as call_review_window_days",
      "call_link.offer_response_window_hours",
    );
  }
  const rows = await qb;
  // Event castings are bookings for one show, not representation; they say
  // nothing about where the talent should be placed.
  return rows.filter((r) => r.call_purpose !== "event_casting");
}

/** The talent's standing with one agency, from their most recent submission. */
function history(app, { now, digitalsCapturedOn }) {
  if (!app) return null;
  const decidedAt = parseDate(app.status_changed_at) || parseDate(app.updated_at) || parseDate(app.created_at);
  const base = {
    applicationId: app.id,
    status: app.status,
    submittedAt: iso(parseDate(app.created_at)),
    decidedAt: iso(decidedAt),
  };

  if (app.status === "represented") return { ...base, standing: "represented" };
  if (AWAITING.has(app.status)) {
    const { reviewClosesAt } = closingDates(app);
    return { ...base, standing: "waiting", closesAt: iso(reviewClosesAt) };
  }
  if (IN_MOTION.has(app.status)) {
    return { ...base, standing: app.status === "requested_more" ? "your_move" : "moving" };
  }
  if (app.status === "withdrawn") return null;

  const key =
    app.status === "kept_on_file" || app.status === AUTO_CLOSED_APPLICATION_STATUS
      ? app.status
      : PASSED.has(app.status)
        ? app.decline_reason && AGAIN[app.decline_reason]
          ? app.decline_reason
          : "unstated"
        : null;
  if (!key) return null;
  const rule = AGAIN[key];
  const out = { ...base, standing: "closed", reason: key, says: rule.says };
  if (rule.never) return { ...out, again: "never" };
  if (rule.onNewDigitals) {
    const fresh = digitalsCapturedOn && decidedAt && parseDate(digitalsCapturedOn) > decidedAt;
    return { ...out, again: fresh ? "now" : "on_new_digitals" };
  }
  const againOn = decidedAt ? new Date(decidedAt.getTime() + rule.days * DAY) : null;
  return { ...out, again: againOn && againOn > now ? "later" : "now", againOn: iso(againOn) };
}

/** The agency's published eligibility against this talent, in its own words. */
function eligibilityOf(result) {
  const findings = (result?.findings || []).filter((f) => f.categoryKey === "eligibility");
  const conflicts = findings.filter(
    (f) => f.outcome === "violates" && ["required", "prohibited"].includes(f.modality),
  );
  const preferences = findings.filter(
    (f) => f.outcome === "violates" && !["required", "prohibited"].includes(f.modality),
  );
  const quote = (f) => ({ id: f.id, said: f.sourceLabel, field: f.field });
  return {
    conflicts: conflicts.map(quote),
    preferences: preferences.map(quote),
  };
}

function sameMarket(location, talentCity) {
  const a = String(location || "").toLowerCase();
  const b = String(talentCity || "").toLowerCase();
  if (!a || !b) return null;
  const city = b.split(",")[0].trim();
  return city.length > 1 && a.includes(city);
}

/**
 * @returns {{ agencies: object[], shots: object[], registryAvailable: boolean }}
 */
async function buildAgencies(profile, { userId, now = new Date(), digitalsCapturedOn = null } = {}) {
  const [pholio, apps, routesList, preflight] = await Promise.all([
    loadPholioAgencies(userId),
    loadApplications(profile.id),
    listRegistryRoutes(knex).catch(() => ({ available: false, routes: [] })),
    // imageIds: null reads the whole eligible book. The default ([]) means
    // "nothing selected", which would report every shot as missing.
    preflightRegistry(knex, { profileId: profile.id, imageIds: null }).catch(() => ({ available: false, results: [] })),
  ]);

  const resultsBySeries = new Map((preflight.results || []).map((r) => [r.seriesId, r]));
  const latestApp = new Map();
  for (const app of apps) {
    const prev = latestApp.get(app.agency_id);
    if (!prev || parseDate(app.created_at) > parseDate(prev.created_at)) latestApp.set(app.agency_id, app);
  }

  // One entry per organisation. A registry route mapped to a live Pholio
  // agency merges into that agency.
  const entries = new Map();
  const ensure = (key, seed) => {
    if (!entries.has(key)) entries.set(key, { key, routes: [], callWindows: [], ...seed });
    return entries.get(key);
  };

  for (const a of pholio) {
    const boards = parseBoards(a.open_boards);
    ensure(`agency:${a.id}`, {
      name: a.name,
      location: a.location || null,
      boards,
      newFaces: boards.some((b) => /new faces|development/i.test(b)),
      pholioAgencyId: a.id,
      website: a.website || null,
    });
  }

  for (const route of routesList.routes || []) {
    const key = route.pholioAgencyId ? `agency:${route.pholioAgencyId}` : `org:${route.organization.id}`;
    const entry = ensure(key, {
      name: route.organization.name,
      location: null,
      boards: [],
      newFaces: false,
      pholioAgencyId: route.pholioAgencyId || null,
      website: null,
    });
    const result = resultsBySeries.get(route.seriesId);
    entry.routes.push({
      seriesId: route.seriesId,
      market: route.marketLabel,
      channelUrl: route.sourceUrl,
      checkedOn: route.sourceCheckedOn,
      eligibility: eligibilityOf(result),
      shots: (result?.findings || [])
        .filter((f) => f.categoryKey === "shots")
        .map((f) => ({
          key: f.matchKey || f.slotKey,
          label: shotLabel(f),
          have: f.outcome === "satisfied",
          // A likely frame exists but its shot type isn't confirmed.
          maybe:
            f.outcome === "unknown" &&
            ((f.candidateImageIds || []).length > 0 || (f.unknownCandidateImageIds || []).length > 0),
          asked: f.modality,
        })),
    });
    for (const w of route.callWindows || []) {
      if (!entry.callWindows.some((x) => x.id === w.id)) entry.callWindows.push(w);
    }
  }

  const agencies = [...entries.values()].map((e) => {
    // The route with the fewest conflicts is the one to use.
    const best = [...e.routes].sort(
      (x, y) => x.eligibility.conflicts.length - y.eligibility.conflicts.length,
    )[0] || null;
    const hist = e.pholioAgencyId
      ? history(latestApp.get(e.pholioAgencyId), { now, digitalsCapturedOn })
      : null;
    const conflicts = best ? best.eligibility.conflicts : [];

    let group;
    if (hist?.standing === "represented") group = "represented";
    else if (hist && ["waiting", "your_move", "moving"].includes(hist.standing)) group = "waiting";
    else if (hist?.again === "never" || conflicts.length) group = "not_now";
    else if (hist && hist.again !== "now") group = "later";
    else group = "go";

    return {
      key: e.key,
      name: e.name,
      location: e.location,
      sameMarket: sameMarket(e.location, profile.city),
      boards: e.boards,
      newFaces: e.newFaces,
      // How to reach them. Pholio first when it can deliver; otherwise the
      // agency's own published route, then a walk-in open call.
      approach: e.pholioAgencyId
        ? { kind: "pholio", href: `/dashboard/talent/applications/apply?agency=${encodeURIComponent(e.pholioAgencyId)}` }
        : best?.channelUrl
          ? { kind: "site", href: best.channelUrl }
          : e.website
            ? { kind: "site", href: e.website }
            : null,
      callWindows: e.callWindows,
      market: best?.market || null,
      checkedOn: best?.checkedOn || null,
      conflicts,
      preferences: best ? best.eligibility.preferences : [],
      history: hist,
      group,
    };
  });

  const order = { represented: 0, waiting: 1, go: 2, later: 3, not_now: 4 };
  agencies.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      Number(b.newFaces) - Number(a.newFaces) ||
      Number(b.sameMarket === true) - Number(a.sameMarket === true) ||
      Number(b.approach?.kind === "pholio") - Number(a.approach?.kind === "pholio") ||
      a.name.localeCompare(b.name),
  );

  // The shots agencies publish, counted across organisations, against the
  // talent's current photos. Comparable only where the registry gives two
  // agencies' wording the same taxonomy key.
  const shotMap = new Map();
  for (const e of entries.values()) {
    const seen = new Set();
    for (const route of e.routes) {
      for (const s of route.shots) {
        if (!s.key || seen.has(s.key)) continue;
        seen.add(s.key);
        const row = shotMap.get(s.key) || { key: s.key, labels: {}, agencies: 0, required: 0, have: false, maybe: false };
        row.agencies += 1;
        if (s.asked === "required") row.required += 1;
        row.labels[s.label] = (row.labels[s.label] || 0) + 1;
        row.have = row.have || s.have;
        row.maybe = row.maybe || s.maybe;
        shotMap.set(s.key, row);
      }
    }
  }
  const shots = [...shotMap.values()]
    .map((r) => ({
      key: r.key,
      label: Object.entries(r.labels).sort((a, b) => b[1] - a[1])[0][0],
      agencies: r.agencies,
      required: r.required,
      // in_book: a confirmed frame; unconfirmed: a likely frame whose shot
      // type the talent hasn't confirmed; missing: nothing that could be it.
      state: r.have ? "in_book" : r.maybe ? "unconfirmed" : "missing",
    }))
    .filter((r) => r.agencies >= 2)
    .sort((a, b) => b.agencies - a.agencies);

  return {
    agencies,
    shots,
    registryAgencies: new Set((routesList.routes || []).map((r) => r.organization.id)).size,
    registryAvailable: Boolean(routesList.available),
  };
}

module.exports = { buildAgencies, history, eligibilityOf, AGAIN };
