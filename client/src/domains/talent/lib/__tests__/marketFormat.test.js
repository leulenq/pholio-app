import { describe, expect, test } from 'vitest';
import {
  boardList,
  channelName,
  cityName,
  countOf,
  countryName,
  freshnessNote,
  longDate,
  reachDetail,
  reachName,
  registryName,
  titleCase,
} from '../marketFormat';

describe('titleCase', () => {
  test('lifts agency free text without mangling acronyms', () => {
    expect(titleCase('editorial')).toBe('Editorial');
    expect(titleCase('los angeles')).toBe('Los Angeles');
    expect(titleCase('IMG')).toBe('IMG');
    expect(titleCase('DNA model management')).toBe('DNA Model Management');
  });

  test('keeps small words down, except when they lead', () => {
    expect(titleCase('the society management')).toBe('The Society Management');
    expect(titleCase('house of models')).toBe('House of Models');
  });
});

describe('cityName', () => {
  test('a city, however the agency wrote its address', () => {
    expect(cityName('Los Angeles, CA')).toBe('Los Angeles');
    expect(cityName('los angeles, ca')).toBe('Los Angeles');
    expect(cityName('  paris,  france ')).toBe('Paris');
    expect(cityName('')).toBe('');
  });
});

describe('channelName', () => {
  test('never prints the enum', () => {
    expect(channelName('official_web_form')).toBe('Their own site');
    expect(channelName('official_email')).toBe('By email');
    expect(channelName('agency_branded_third_party_form')).toBe('Their application form');
  });

  test('an unknown channel degrades to something readable, not a slug', () => {
    expect(channelName('carrier_pigeon')).toBe('Carrier Pigeon');
    expect(channelName(null)).toBe('Their own channel');
  });
});

describe('registryName', () => {
  test('names the registry the way it names itself', () => {
    expect(registryName('ny_dol')).toBe('New York State DOL');
    expect(registryName('ca_dir')).toBe('Ca Dir');
  });
});

describe('reachName', () => {
  test('a scope, said for a reader', () => {
    expect(reachName({ kind: 'global' })).toBe('Global');
    expect(reachName({ kind: 'country', codes: ['GB'] })).toBe('United Kingdom');
    expect(reachName({ kind: 'city', label: 'tokyo' })).toBe('Tokyo');
  });

  test('a hand-picked set counts rather than running on', () => {
    expect(reachName({ kind: 'selected', codes: ['US', 'GB'] })).toBe(
      'United States and United Kingdom',
    );
    expect(reachName({ kind: 'selected', codes: ['US', 'FR', 'ES'] })).toBe('3 markets');
    // …and the dossier, where there is room, spells them out.
    expect(reachDetail({ kind: 'selected', codes: ['US', 'FR', 'ES'] })).toBe(
      'United States · France · Spain',
    );
  });

  test('nothing published prints nothing', () => {
    expect(reachName(null)).toBe('');
  });
});

describe('boardList', () => {
  test('boards are lifted and capped', () => {
    expect(boardList(['editorial', 'commercial'])).toEqual(['Editorial', 'Commercial']);
    expect(boardList(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['A', 'B', 'C', '+2']);
  });
});

describe('freshnessNote', () => {
  test('only the states that should change behaviour speak', () => {
    expect(freshnessNote({ state: 'current' })).toBe('');
    expect(freshnessNote({ state: 'review_due' })).toMatch(/confirm on their site/i);
    expect(freshnessNote(null)).toBe('');
  });
});

describe('longDate + countOf', () => {
  test('dates read, and never say Invalid Date', () => {
    expect(longDate('2026-08-18')).toBe('18 August 2026');
    expect(longDate('not a date')).toBe('');
    expect(longDate(null)).toBe('');
  });

  test('nouns agree with their number', () => {
    expect(countOf(1, 'house')).toBe('1 house');
    expect(countOf(3, 'house')).toBe('3 houses');
    expect(countOf(0, 'shot')).toBe('0 shots');
  });

  test('country codes resolve, and unknown ones stay uppercase rather than blank', () => {
    expect(countryName('fr')).toBe('France');
    expect(countryName('zz')).toBe('ZZ');
  });
});
