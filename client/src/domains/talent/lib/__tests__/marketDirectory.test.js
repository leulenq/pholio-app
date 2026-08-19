import { describe, expect, test } from 'vitest';
import {
  DELIVERY,
  SCOPE,
  buildHouses,
  buildMarketDirectory,
  filterHouses,
  groupHousesByMarket,
  readReach,
  sortMarketDirectory,
} from '../marketDirectory';

const agency = (id, name, extra = {}) => ({
  id,
  name,
  agency_location: 'New York, NY',
  agency_description: 'Open to new talent.',
  ...extra,
});

const route = (seriesId, agencyName, extra = {}) => ({
  seriesId,
  agencyName,
  office: 'London',
  marketLabel: 'London',
  market: { kind: 'city', city: 'London', countryCodes: ['GB'] },
  channelType: 'official_web_form',
  sourceUrl: 'https://example.com/apply',
  callWindows: [],
  verification: null,
  acceptsPholioSubmissions: false,
  pholioAgencyId: null,
  ...extra,
});

describe('buildMarketDirectory', () => {
  test('a Pholio agency with no researched route is one Pholio destination', () => {
    const [entry] = buildMarketDirectory({ agencies: [agency('a-1', 'Nomad')], routes: [] });

    expect(entry.delivery).toBe(DELIVERY.PHOLIO);
    expect(entry.agencyId).toBe('a-1');
    expect(entry.seriesId).toBeNull();
    expect(entry.name).toBe('Nomad');
  });

  test('a researched route with no Pholio agency is one off-Pholio destination', () => {
    const [entry] = buildMarketDirectory({ agencies: [], routes: [route('elite', 'Elite')] });

    expect(entry.delivery).toBe(DELIVERY.OFF_PHOLIO);
    expect(entry.seriesId).toBe('elite');
    expect(entry.agencyId).toBeNull();
    // Office and reach are separate facts, not one flattened location line.
    expect(entry.office).toBe('London');
    expect(entry.reach).toEqual({ kind: 'city', label: 'London', codes: ['GB'] });
    // Never a generated mark.
    expect(entry.logo).toBeNull();
  });

  test('an agency Pholio delivers to draws once, not twice, and keeps its own words', () => {
    const entries = buildMarketDirectory({
      agencies: [agency('a-1', 'Nomad')],
      routes: [
        route('nomad-nyc', 'Nomad Management LLC', {
          acceptsPholioSubmissions: true,
          pholioAgencyId: 'a-1',
        }),
      ],
    });

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.delivery).toBe(DELIVERY.PHOLIO);
    // The agency wrote its own name and location; the registry's organization
    // name is a research artifact and never overwrites it.
    expect(entry.name).toBe('Nomad');
    expect(entry.office).toBe('New York, NY');
    // But the requirements Pholio holds for it ride along.
    expect(entry.seriesId).toBe('nomad-nyc');
  });

  test('a route claiming a Pholio agency the talent cannot see stays a destination', () => {
    // Blocked, inactive, or filtered upstream: the talent can still prepare a
    // package and send it on the agency's own channel.
    const entries = buildMarketDirectory({
      agencies: [],
      routes: [
        route('ford', 'Ford', { acceptsPholioSubmissions: true, pholioAgencyId: 'a-9' }),
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].delivery).toBe(DELIVERY.OFF_PHOLIO);
    expect(entries[0].seriesId).toBe('ford');
  });

  test('a route that maps to an agency but cannot be delivered to is not merged', () => {
    // `pholioAgencyId` is only meaningful alongside `acceptsPholioSubmissions`;
    // a stale mapping must not collapse an off-Pholio route onto a live agency.
    const entries = buildMarketDirectory({
      agencies: [agency('a-1', 'Nomad')],
      routes: [
        route('nomad-old', 'Nomad', {
          acceptsPholioSubmissions: false,
          pholioAgencyId: 'a-1',
        }),
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.delivery)).toEqual([
      DELIVERY.PHOLIO,
      DELIVERY.OFF_PHOLIO,
    ]);
  });

  test('rows without an identity are skipped rather than drawn empty', () => {
    const entries = buildMarketDirectory({
      agencies: [{ name: 'No id' }],
      routes: [{ agencyName: 'No series' }],
    });

    expect(entries).toEqual([]);
  });
});

describe('buildMarketDirectory — glance', () => {
  test('a researched route with no authored brief gets a glance derived from its own DTO', () => {
    const [entry] = buildMarketDirectory({
      agencies: [],
      routes: [route('some-agency', 'Some Agency')],
    });

    expect(entry.glance).toEqual({
      applyMethod: 'Online form',
      prepSummary: null,
      gates: [],
      hasHeadsUp: false,
      checkedOn: null,
    });
  });

  test('a route matching an authored brief gets the authored glance', () => {
    const [entry] = buildMarketDirectory({
      agencies: [],
      routes: [route('elite-models-na:online-general', 'Elite Model Management')],
    });

    expect(entry.glance.applyMethod).toBe('Online form or email');
    expect(entry.glance.gates).toEqual(['Women only']);
    expect(entry.glance.hasHeadsUp).toBe(true);
  });

  test('an agency Pholio delivers to also carries the glance for its requirements', () => {
    const entries = buildMarketDirectory({
      agencies: [agency('a-1', 'Nomad')],
      routes: [
        route('nomad-nyc', 'Nomad Management LLC', {
          acceptsPholioSubmissions: true,
          pholioAgencyId: 'a-1',
          channelType: 'official_email',
        }),
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].glance.applyMethod).toBe('Email');
  });
});

describe('sortMarketDirectory', () => {
  test('work in progress first, then Pholio houses, then the researched market', () => {
    const entries = buildMarketDirectory({
      agencies: [agency('a-1', 'Zed'), agency('a-2', 'Able')],
      routes: [route('elite', 'Elite'), route('muse', 'Muse')],
    });

    const sorted = sortMarketDirectory(entries, {
      hasDraft: (entry) => entry.agencyId === 'a-1',
    });

    expect(sorted.map((entry) => entry.name)).toEqual(['Zed', 'Able', 'Elite', 'Muse']);
  });

  test('does not mutate what it is handed', () => {
    const entries = buildMarketDirectory({
      agencies: [agency('a-1', 'Zed'), agency('a-2', 'Able')],
      routes: [],
    });
    sortMarketDirectory(entries);

    expect(entries.map((entry) => entry.name)).toEqual(['Zed', 'Able']);
  });
});

describe('readReach', () => {
  test('types a market instead of flattening it into a location string', () => {
    expect(readReach({ kind: 'global', countryCodes: [] })).toEqual({
      kind: 'global',
      label: 'Global',
      codes: [],
    });
    expect(readReach({ kind: 'city', city: 'Tokyo', countryCodes: ['JP'] })).toEqual({
      kind: 'city',
      label: 'Tokyo',
      codes: ['JP'],
    });
    expect(readReach({ kind: 'country', countryCodes: ['GB'] })).toEqual({
      kind: 'country',
      label: 'United Kingdom',
      codes: ['GB'],
    });
  });

  test('a hand-picked set of markets names the countries, since no single label exists', () => {
    // Ford publishes one route covering US, FR and ES. The server's marketLabel
    // is null for exactly this case — that is not "Global".
    expect(readReach({ kind: 'selected_market', countryCodes: ['US', 'FR', 'ES'] }, null)).toEqual(
      { kind: 'selected', label: 'US · FR · ES', codes: ['US', 'FR', 'ES'] },
    );
  });

  test('nothing published is null, never an invented reach', () => {
    expect(readReach(null)).toBeNull();
    expect(readReach({ kind: 'selected_market', countryCodes: [] }, null)).toBeNull();
  });
});


describe('buildHouses', () => {
  test('a house that publishes four routes is one house, not four rows', () => {
    // This is what made the market read as a database dump: Elite printed four
    // times, four identical lines, none of them the agency.
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [
          route('elite-tokyo', 'Elite Model Management', {
            organizationId: 'elite',
            office: 'Tokyo',
            market: { kind: 'city', city: 'Tokyo', countryCodes: ['JP'] },
          }),
          route('elite-global', 'Elite Model Management', {
            organizationId: 'elite',
            office: null,
            market: { kind: 'global', countryCodes: [] },
          }),
          route('elite-na', 'Elite Model Management', {
            organizationId: 'elite',
            office: null,
            marketLabel: 'North America',
            market: { kind: 'region', countryCodes: ['US', 'CA'] },
          }),
        ],
      }),
    );

    expect(houses).toHaveLength(1);
    const [elite] = houses;
    expect(elite.routes).toHaveLength(3);
    expect(elite.cities).toEqual(['Tokyo']);
    expect(elite.reaches.map((r) => r.label)).toEqual(['Tokyo', 'Global', 'North America']);
    expect(elite.researched).toHaveLength(3);
  });

  test('a house joins its Pholio row to its researched routes, and keeps its own name', () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [agency('a-1', 'Muse Model Management', { agency_location: 'New York, NY' })],
        routes: [
          route('muse-email', 'Muse Model Management', {
            organizationId: 'muse-model-management',
            office: 'New York',
          }),
        ],
      }),
    );

    expect(houses).toHaveLength(1);
    const [muse] = houses;
    expect(muse.pholio).not.toBeNull();
    expect(muse.delivery).toBe(DELIVERY.PHOLIO);
    expect(muse.researched).toHaveLength(1);
    // Both ways in survive: Pholio can carry one, the talent carries the other.
    expect(muse.routes).toHaveLength(2);
  });

  test('duplicate rows for the same name collapse instead of printing twice', () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [agency('a-1', 'DNA Model Management'), agency('a-2', 'DNA Model Management')],
        routes: [],
      }),
    );

    expect(houses).toHaveLength(1);
    expect(houses[0].routes).toHaveLength(2);
  });

  test('one city, however it is written', () => {
    // "Los Angeles, CA" and "Los Angeles" are one market, not two.
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [agency('a-1', 'One', { agency_location: 'Los Angeles, CA' })],
        routes: [route('two', 'Two', { office: 'Los Angeles' })],
      }),
    );
    expect(groupHousesByMarket(houses).map((g) => g.market)).toEqual(['Los Angeles']);
  });

  test('a reach never becomes a market heading', () => {
    // "US · FR · ES" is a scope; as a section title it reads like a database key.
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [
          route('ford', 'Ford', {
            office: null,
            marketLabel: null,
            market: { kind: 'selected_market', countryCodes: ['US', 'FR', 'ES'] },
          }),
        ],
      }),
    );
    expect(houses[0].market).toBe('Selected markets');
  });

  test('a house is grouped by its city, and falls back honestly when it has none', () => {
    const [city] = buildHouses(
      buildMarketDirectory({ agencies: [], routes: [route('a', 'A', { office: 'Paris' })] }),
    );
    expect(city.market).toBe('Paris');

    const [global] = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [
          route('b', 'B', { office: null, marketLabel: null, market: { kind: 'global', countryCodes: [] } }),
        ],
      }),
    );
    expect(global.market).toBe('Global');

    const [unknown] = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [route('c', 'C', { office: null, marketLabel: null, market: null })],
      }),
    );
    expect(unknown.market).toBe('Unlisted');
  });
});

describe('filterHouses + groupHousesByMarket', () => {
  const houses = buildHouses(
    buildMarketDirectory({
      agencies: [agency('a-1', 'Nomad', { agency_location: 'Paris', open_boards: '["Curve"]' })],
      routes: [
        route('storm', 'Storm Management', { office: 'London' }),
        route('models1', 'Models1', { office: 'London' }),
        route('muse', 'Muse', {
          office: 'New York',
          marketLabel: 'New York',
          market: { kind: 'city', city: 'New York', countryCodes: ['US'] },
          callWindows: [{ id: 'w', weekday: 4, startMinute: 900, endMinute: 960 }],
        }),
      ],
    }),
  );

  test('scope reads the house, not each of its routes', () => {
    expect(filterHouses(houses, { scope: SCOPE.PHOLIO }).map((h) => h.name)).toEqual(['Nomad']);
    expect(filterHouses(houses, { scope: SCOPE.OPEN_CALLS }).map((h) => h.name)).toEqual(['Muse']);
  });

  test('search reaches a house by city and by board', () => {
    expect(filterHouses(houses, { query: 'london' }).map((h) => h.name)).toEqual([
      'Storm Management',
      'Models1',
    ]);
    expect(filterHouses(houses, { query: 'curve' }).map((h) => h.name)).toEqual(['Nomad']);
  });

  test('the busiest market leads, and the unplaceable sit last', () => {
    const withUnlisted = [
      ...houses,
      ...buildHouses(
        buildMarketDirectory({
          agencies: [],
          routes: [route('x', 'X', { office: null, marketLabel: null, market: null })],
        }),
      ),
    ];
    expect(groupHousesByMarket(withUnlisted).map((g) => g.market)).toEqual([
      'London',
      'New York',
      'Paris',
      'Unlisted',
    ]);
  });
});

describe('city normalisation at the source', () => {
  test('casing never forks a market', () => {
    // Both of these are Los Angeles. Grouping on the raw string made two.
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [
          agency('a-1', 'One', { agency_location: 'Los Angeles, CA' }),
          agency('a-2', 'Two', { agency_location: 'los angeles, ca' }),
        ],
        routes: [],
      }),
    );
    expect(groupHousesByMarket(houses).map((g) => g.market)).toEqual(['Los Angeles']);
  });

  test('a house that lists one city twice, differently, lists it once', () => {
    const [house] = buildHouses(
      buildMarketDirectory({
        agencies: [agency('a-1', 'Same', { agency_location: 'new york, ny' })],
        routes: [route('same', 'Same', { organizationId: null, office: 'New York' })],
      }),
    );
    expect(house.cities).toEqual(['New York']);
  });
});

describe('folding a brand into one house', () => {
  const elite = (id, name, extra = {}) =>
    route(id, name, { organizationId: id, office: null, marketLabel: null, market: null, ...extra });

  test('Elite is one house with several ways in, not three houses', () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [
          elite('elite-model-management', 'Elite Model Management', { office: 'Paris' }),
          elite('elite-models-na', 'Elite Models', {
            marketLabel: 'North America',
            market: { kind: 'region', countryCodes: ['US', 'CA'] },
          }),
          elite('elite-japan-tokyo', 'Elite Model Japan', { office: 'Tokyo' }),
        ],
      }),
    );

    expect(houses).toHaveLength(1);
    expect(houses[0].routes).toHaveLength(3);
    expect(houses[0].cities).toEqual(['Paris', 'Tokyo']);
  });

  test('brands that merely share a first word stay apart', () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [
          elite('new-york-models', 'New York Models'),
          elite('new-faces', 'New Faces Agency'),
        ],
      }),
    );

    expect(houses.map((h) => h.name).sort()).toEqual(['New Faces Agency', 'New York Models']);
  });

  test('a name made entirely of generic words is still a brand', () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [],
        routes: [elite('models1', 'Models 1'), elite('storm', 'Storm Management')],
      }),
    );

    expect(houses).toHaveLength(2);
  });

  test("a house Pholio delivers to keeps that route when it absorbs an office", () => {
    const houses = buildHouses(
      buildMarketDirectory({
        agencies: [agency('a-1', 'Elite Model Management', { agency_location: 'Paris' })],
        routes: [elite('elite-japan-tokyo', 'Elite Model Japan', { office: 'Tokyo' })],
      }),
    );

    expect(houses).toHaveLength(1);
    expect(houses[0].pholio).not.toBeNull();
    expect(houses[0].researched).toHaveLength(1);
  });
});
