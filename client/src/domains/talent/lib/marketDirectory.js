/**
 * One market, two delivery paths.
 *
 * A talent applying to Elite and a talent applying to a Pholio agency are doing
 * the same thing — building a package for a house that publishes what it wants.
 * The only difference is who carries it the last inch. So the two sources are
 * merged here rather than in two grids: `/api/talent/agencies` (houses whose
 * open call Pholio delivers) and `/api/talent/spec-registry/routes` (every
 * researched submission route, whether or not Pholio can deliver to it).
 *
 * The join key is deliberately NOT `origin`. A route's origin says who wrote
 * the spec — Pholio's researchers or the agency itself — and an agency can be
 * on Pholio while Pholio still researched their requirements. What decides the
 * delivery path is `acceptsPholioSubmissions` / `pholioAgencyId`, which the
 * server computes on every route (`listRegistryRoutes`, preflight-service.js).
 *
 * Server source of truth: `src/domains/spec-registry/preflight-service.js`
 * (`routeDto`) and `src/domains/talent/routes/agencies.js`.
 */

import { cityName } from './marketFormat';

export const DELIVERY = Object.freeze({
  /** Pholio receives the submission and the agency answers inside Pholio. */
  PHOLIO: 'pholio',
  /** The talent sends it themselves, on the agency's own channel. */
  OFF_PHOLIO: 'offPholio',
});

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const REGION_NAMES = Object.freeze({
  US: 'United States',
  GB: 'United Kingdom',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  CA: 'Canada',
  DE: 'Germany',
  AU: 'Australia',
  BR: 'Brazil',
});

/**
 * Reach — how far this destination's representation actually extends.
 *
 * Deliberately NOT the same field as the office. An office is a place that
 * receives applications ("New York"); reach is the scope the agency represents
 * across, and the registry types it: a city, a country, a region, the whole
 * market, or a hand-picked set of countries. Ford publishes one route covering
 * US, FR and ES — that is not a location and printing it as one is the flatten
 * this model exists to prevent.
 *
 * Returns `null` when nothing is published. Never invents "Global".
 */
export function readReach(market, fallbackLabel = null) {
  const kind = market?.kind || null;
  const codes = (market?.countryCodes || []).filter(Boolean);

  if (kind === 'global') return { kind: 'global', label: 'Global', codes: [] };
  if (kind === 'city' && market.city) {
    return { kind: 'city', label: market.city, codes };
  }
  if (kind === 'country' && codes.length === 1) {
    return { kind: 'country', label: REGION_NAMES[codes[0]] || codes[0], codes };
  }
  if (kind === 'region') {
    return {
      kind: 'region',
      label: fallbackLabel || codes.map((c) => REGION_NAMES[c] || c).join(' · '),
      codes,
    };
  }
  if (kind === 'selected_market' && codes.length) {
    // No single name exists for this, and the registry says so by publishing
    // no label. The countries themselves are the honest answer.
    return { kind: 'selected', label: codes.join(' · '), codes };
  }
  if (fallbackLabel) return { kind: kind || 'other', label: fallbackLabel, codes };
  return null;
}

function asBoards(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** A Pholio agency row, as the directory reads it. */
function fromAgency(agency) {
  return {
    key: `agency:${agency.id}`,
    delivery: DELIVERY.PHOLIO,
    agencyId: agency.id,
    seriesId: null,
    name: trimmed(agency.name) || 'Unnamed Agency',
    // The office: a place, and only ever a place.
    office: trimmed(agency.agency_location) || null,
    // Reach is not published for Pholio agencies today; the directory prints
    // nothing rather than assuming their own location is their whole market.
    reach: null,
    // What they represent. Real agency-managed data, absent on most rows.
    representation: asBoards(agency.open_boards),
    description: trimmed(agency.agency_description),
    logo: agency.profile_image || null,
    channelType: null,
    sourceUrl: null,
    callWindows: [],
    verification: null,
    // The untouched row, for the callers that still need agency-only fields
    // (drafts are keyed by agency id, and the apply flow wants the whole thing).
    agency,
  };
}

/** A researched route with no Pholio delivery behind it. */
function fromRoute(route) {
  return {
    key: `series:${route.seriesId}`,
    delivery: DELIVERY.OFF_PHOLIO,
    agencyId: null,
    seriesId: route.seriesId,
    name: trimmed(route.agencyName) || 'Agency route',
    office: trimmed(route.office) || null,
    reach: readReach(route.market, trimmed(route.marketLabel) || null),
    representation: [],
    description: '',
    // Only a real asset, never a generated one. The registry carries no
    // branding at all, so every researched row is logo-less by definition.
    logo: null,
    channelType: route.channelType || null,
    sourceUrl: route.sourceUrl || null,
    callWindows: Array.isArray(route.callWindows) ? route.callWindows : [],
    verification: route.verification || null,
    agency: null,
  };
}

/**
 * Merge the two sources into one list of destinations.
 *
 * A route that maps to a Pholio agency does not become a second card — it
 * enriches that agency's card with the requirements Pholio holds for it, and
 * the delivery path stays Pholio. Display fields keep coming from the agency
 * row in that case: the agency wrote them about itself, and the registry's
 * organization name is a research artifact.
 *
 * @param {object}   input
 * @param {object[]} input.agencies  rows from `talentApi.getAgencies()`
 * @param {object[]} input.routes    routes read through `readRoutes()`
 */
export function buildMarketDirectory({ agencies = [], routes = [] } = {}) {
  const entries = [];
  const byAgencyId = new Map();

  for (const agency of agencies) {
    if (!agency?.id) continue;
    const entry = fromAgency(agency);
    byAgencyId.set(agency.id, entry);
    entries.push(entry);
  }

  for (const route of routes) {
    if (!route?.seriesId) continue;
    const pholioAgencyId = route.acceptsPholioSubmissions
      ? route.pholioAgencyId || null
      : null;
    const existing = pholioAgencyId ? byAgencyId.get(pholioAgencyId) : null;

    if (existing) {
      // Requirements Pholio holds for a house it also delivers to. The card
      // stays one card; the apply workspace resolves the spec by agency id.
      existing.seriesId = existing.seriesId || route.seriesId;
      existing.sourceUrl = existing.sourceUrl || route.sourceUrl || null;
      existing.channelType = existing.channelType || route.channelType || null;
      existing.office = existing.office || trimmed(route.office) || null;
      existing.reach =
        existing.reach || readReach(route.market, trimmed(route.marketLabel) || null);
      if (!existing.callWindows.length && Array.isArray(route.callWindows)) {
        existing.callWindows = route.callWindows;
      }
      existing.verification = existing.verification || route.verification || null;
      continue;
    }

    // A route whose agency is on Pholio but was not in the list the talent can
    // see (blocked, inactive, or filtered upstream) is still a destination —
    // they can prepare a package and send it on the agency's own channel.
    entries.push(fromRoute(route));
  }

  return entries;
}

/**
 * Grid order: what the talent already started, then the houses Pholio delivers
 * to, then the rest of the researched market. Alphabetical inside each band so
 * the list does not reshuffle between loads.
 */
export function sortMarketDirectory(entries, { hasDraft = () => false } = {}) {
  const band = (entry) => {
    if (entry.delivery === DELIVERY.PHOLIO && hasDraft(entry)) return 0;
    if (entry.delivery === DELIVERY.PHOLIO) return 1;
    return 2;
  };
  return [...entries].sort(
    (left, right) => band(left) - band(right) || left.name.localeCompare(right.name),
  );
}

/* ══════════════════════════════════════════════════════════════════
   Finding one agency among hundreds.

   The directory is loaded whole — the spec pack is tens of routes, not
   a paginated corpus — so the work here is narrowing, not fetching. If
   the pack ever passes a few hundred rows, window the rendered list;
   nothing in this module has to change for that.
   ══════════════════════════════════════════════════════════════════ */

export const SCOPE = Object.freeze({
  ALL: 'all',
  PHOLIO: 'pholio',
  RESEARCHED: 'researched',
  OPEN_CALLS: 'openCalls',
});

export const SCOPE_FILTERS = Object.freeze([
  { id: SCOPE.ALL, label: 'All' },
  { id: SCOPE.PHOLIO, label: 'On Pholio' },
  { id: SCOPE.RESEARCHED, label: 'Researched' },
  { id: SCOPE.OPEN_CALLS, label: 'Open calls' },
]);

/**
 * Whether a saved dossier can actually be reopened.
 *
 * A draft outlives the conditions it was written under: the agency can be
 * blocked by the talent, go inactive, or stop accepting. Offering "Continue" on
 * one of those is offering a door that opens onto nothing, so the directory
 * asks this before it labels the action.
 */
export function canResumeDraft(draft) {
  if (!draft || draft.lifecycleState !== 'active') return false;
  if (draft.canResume === false || draft.agency?.isBlocked) return false;
  if (!draft.agency) return false;
  if (!draft.agency.status) return true;
  return ['active', 'available', 'open', 'accepting'].includes(
    String(draft.agency.status).trim().toLowerCase(),
  );
}

/* ══════════════════════════════════════════════════════════════════
   Houses, not routes.

   Elite publishes four routes — Paris, Tokyo, Global, North America —
   and a talent reading a market wants Elite once, with four ways in.
   Listing routes is what makes a directory read as a database dump:
   the same name four times, each row identical, none of them the
   agency. So the entity here is the house, and its routes become the
   substance of its entry.

   A house's entry therefore varies in weight with what Pholio actually
   knows about it — offices, reach, boards, a registry claim, an open
   call — which is what lets one house look different from another
   without inventing a single mark.
   ══════════════════════════════════════════════════════════════════ */

/** Loose identity: the registry's own organization id, else the name. */
function houseKey(entry) {
  const slug = String(entry.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return entry.organizationId || slug || entry.key;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * The city, as a city.
 *
 * Agencies write their location every way there is — "Los Angeles, CA",
 * "los angeles, ca", "New York, NY" — and grouping on the raw string splits one
 * market into several. The city is the part before the first comma, title-cased
 * at the source so casing can never fork a market either; the state or country
 * after the comma is an address detail, not a market.
 */
export function cityOf(location) {
  return cityName(location) || null;
}

/**
 * Where a house sits, for the purpose of grouping the market.
 *
 * Cities, because that is how the industry reads a market — "who is in Paris"
 * is a real question a model asks when planning a season, and "who begins with
 * E" is not.
 *
 * A reach is deliberately NOT allowed to become a market heading. "US · FR · ES"
 * is a scope, and as a section title it reads like a database key; houses with
 * no city are gathered by the kind of reach they have instead, which is both
 * true and legible.
 */
export function primaryMarket(house) {
  if (house.cities.length) return cityOf(house.cities[0]);
  if (house.reaches.some((reach) => reach.kind === 'global')) return 'Global';
  if (house.reaches.length) return 'Selected markets';
  return 'Unlisted';
}

/*
  Words that name what an agency *is*, not which agency it is. Stripping them
  leaves the brand: "Elite Model Management", "Elite Models" and "Elite Model
  Japan" all reduce to a root beginning "elite".
*/
const GENERIC_TOKENS = new Set([
  'the', 'model', 'models', 'management', 'mgmt', 'agency', 'agencies',
  'group', 'international', 'inc', 'llc', 'ltd',
]);

function brandRoot(name) {
  const tokens = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !GENERIC_TOKENS.has(token));
  // Never reduce a name to nothing: "Models 1" is all generic but is a brand.
  return tokens.length ? tokens : [String(name || '').toLowerCase().trim()];
}

/**
 * Fold the offices of one brand into one house.
 *
 * The registry models Elite's Paris, Tokyo and North American routes as three
 * separate organizations, so they arrive as three houses and the market printed
 * Elite three times. To a talent that is one house with three ways in.
 *
 * The rule is deliberately conservative: two brands merge only when one's root
 * is a token-wise prefix of the other's. "Elite" absorbs "Elite Japan"; "New
 * York Models" and "New Faces" share a first token and stay apart.
 *
 * This is a presentation-time repair, not a fix. The researched dataset is due
 * a rebuild, and organization identity is one of the things it has to settle.
 */
function foldBrands(houses) {
  const roots = houses.map((house) => brandRoot(house.name));
  const parentOf = new Map();

  for (let i = 0; i < houses.length; i += 1) {
    for (let j = 0; j < houses.length; j += 1) {
      if (i === j) continue;
      const a = roots[i];
      const b = roots[j];
      if (a.length > b.length) continue;
      const isPrefix = a.every((token, index) => token === b[index]);
      if (!isPrefix) continue;
      // The shorter root is the parent; ties break on the earlier house so the
      // fold is stable whatever order the sources arrived in.
      if (a.length === b.length && i > j) continue;
      parentOf.set(houses[j].key, houses[i].key);
    }
  }

  if (parentOf.size === 0) return houses;

  /*
    Parents chain: with three Elite routes, "Elite Japan" can be assigned to
    "Elite Models" while "Elite Models" is itself assigned to "Elite Model
    Management". Folding into a parent that has already been absorbed drops the
    child, so every link is resolved to its root first.
  */
  const rootOf = (key, seen = new Set()) => {
    const parent = parentOf.get(key);
    if (!parent || seen.has(parent)) return key;
    seen.add(parent);
    return rootOf(parent, seen);
  };

  const byKey = new Map(houses.map((house) => [house.key, house]));
  const folded = [];

  for (const house of houses) {
    const parentKey = parentOf.has(house.key) ? rootOf(house.key) : null;
    if (!parentKey || parentKey === house.key || !byKey.has(parentKey)) {
      folded.push(house);
      continue;
    }
    const parent = byKey.get(parentKey);
    parent.routes.push(...house.routes);
    parent.researched.push(...house.researched);
    parent.cities = uniq([...parent.cities, ...house.cities]);
    parent.boards = uniq([...parent.boards, ...house.boards]);
    parent.callWindows.push(...house.callWindows);
    parent.reaches = [...parent.reaches, ...house.reaches].filter(
      (reach, index, all) => all.findIndex((r) => r.label === reach.label) === index,
    );
    if (!parent.pholio && house.pholio) parent.pholio = house.pholio;
    if (!parent.verification && house.verification) parent.verification = house.verification;
  }

  return folded.map((house) => ({
    ...house,
    delivery: house.pholio ? DELIVERY.PHOLIO : DELIVERY.OFF_PHOLIO,
    market: primaryMarket(house),
  }));
}

export function buildHouses(entries) {
  const houses = new Map();

  for (const entry of entries) {
    const key = houseKey(entry);
    if (!houses.has(key)) {
      houses.set(key, {
        key,
        name: entry.name,
        routes: [],
        cities: [],
        reaches: [],
        boards: [],
        callWindows: [],
        verification: null,
        pholio: null,
        researched: [],
      });
    }
    const house = houses.get(key);
    house.routes.push(entry);

    // The name a house calls itself on Pholio wins over a researched one.
    if (entry.delivery === DELIVERY.PHOLIO) {
      house.name = entry.name;
      if (!house.pholio) house.pholio = entry;
    } else {
      house.researched.push(entry);
    }

    if (entry.office) house.cities.push(cityOf(entry.office));
    if (entry.reach) house.reaches.push(entry.reach);
    house.boards.push(...entry.representation);
    house.callWindows.push(...entry.callWindows);
    if (!house.verification && entry.verification) house.verification = entry.verification;
  }

  const built = [...houses.values()].map((house) => {
    const cities = uniq(house.cities);
    const reaches = house.reaches.filter(
      (reach, index, all) => all.findIndex((r) => r.label === reach.label) === index,
    );
    const next = {
      ...house,
      cities,
      reaches,
      boards: uniq(house.boards),
      // A house is "on Pholio" if any of its routes is — that is the only
      // question the action has to answer.
      delivery: house.pholio ? DELIVERY.PHOLIO : DELIVERY.OFF_PHOLIO,
    };
    return { ...next, market: primaryMarket(next) };
  });

  return foldBrands(built);
}

/** Search a house across everything it is known by. */
export function houseMatchesQuery(house, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [
    house.name,
    ...house.cities,
    ...house.reaches.map((r) => r.label),
    ...house.reaches.flatMap((r) => r.codes),
    ...house.boards,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function houseMatchesScope(house, scope) {
  if (scope === SCOPE.PHOLIO) return Boolean(house.pholio);
  if (scope === SCOPE.RESEARCHED) return house.researched.length > 0;
  if (scope === SCOPE.OPEN_CALLS) return house.callWindows.length > 0;
  return true;
}

export function filterHouses(houses, { query = '', scope = SCOPE.ALL } = {}) {
  return houses.filter(
    (house) => houseMatchesScope(house, scope) && houseMatchesQuery(house, query),
  );
}

/**
 * The market, by market. Cities carrying the most houses lead, because that is
 * where a talent's campaign actually starts; everything Pholio cannot place
 * sits last rather than being filed under an invented city.
 */
export function groupHousesByMarket(houses) {
  const groups = new Map();
  for (const house of houses) {
    if (!groups.has(house.market)) groups.set(house.market, []);
    groups.get(house.market).push(house);
  }
  return [...groups.entries()]
    .map(([market, rows]) => ({
      market,
      houses: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      // Cities first and busiest-first, because that is where a campaign
      // starts. The three non-city groups always trail, in decreasing
      // usefulness to someone deciding where to send a book.
      const rank = (m) =>
        ({ Global: 1, 'Selected markets': 2, Unlisted: 3 })[m] ?? 0;
      return (
        rank(a.market) - rank(b.market) ||
        b.houses.length - a.houses.length ||
        a.market.localeCompare(b.market)
      );
    });
}
