import { describe, expect, test } from 'vitest';
import { allBriefs, briefForSeries, checkedOn } from '../agencyBriefs';

const REQUIRED_TOP_LEVEL_FIELDS = [
  'id',
  'name',
  'market',
  'kind',
  'officialApplyUrl',
  'glance',
  'brief',
  'apply',
];

const REQUIRED_BRIEF_FIELDS = [
  'howYouApply',
  'yourDetails',
  'whoTheyWant',
  'under18',
  'afterYouSubmit',
  'headsUps',
  'finePrint',
];

describe('agencyBriefs pack', () => {
  test('the pack carries a checked-on date and eleven authored entries', () => {
    expect(checkedOn).toBe('2026-08-19');
    expect(allBriefs()).toHaveLength(11);
  });

  test('every entry has the required top-level and brief fields', () => {
    for (const entry of allBriefs()) {
      for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
        expect(entry, `entry "${entry.id}" missing "${field}"`).toHaveProperty(field);
      }
      for (const field of REQUIRED_BRIEF_FIELDS) {
        expect(entry.brief, `entry "${entry.id}".brief missing "${field}"`).toHaveProperty(field);
      }
      expect(['agency', 'event']).toContain(entry.kind);
      expect(Array.isArray(entry.seriesIds)).toBe(true);
      // Under 18 is always present — the redesign spec makes this a hard rule,
      // agency or event alike.
      expect(typeof entry.brief.under18).toBe('string');
      expect(entry.brief.under18.length).toBeGreaterThan(0);
    }
  });

  test('registration is a real claim or an honest null, never invented', () => {
    for (const entry of allBriefs()) {
      if (entry.kind === 'event') {
        expect(entry.registration).toBeNull();
      } else {
        expect(entry.registration).toEqual(
          expect.objectContaining({ authority: expect.any(String), cert: expect.any(String) }),
        );
      }
    }
  });

  test('every entry without a live series id gets a prospective one instead', () => {
    for (const entry of allBriefs()) {
      if (entry.seriesIds.length === 0) {
        expect(entry.prospectiveSeriesId).toBe(
          entry.id === 'fashion-week-brooklyn' ? 'fashion-week-brooklyn:event' : `${entry.id}:online`,
        );
      } else {
        expect(entry.prospectiveSeriesId).toBeUndefined();
      }
    }
  });

  test('seriesIds are unique across the whole pack', () => {
    const allSeriesIds = allBriefs().flatMap((entry) => entry.seriesIds);
    expect(new Set(allSeriesIds).size).toBe(allSeriesIds.length);
  });

  test('the four wired entries carry exactly the series ids the spec assigns', () => {
    expect(briefForSeries('elite-models-na:online-general')?.id).toBe('elite-na');
    expect(briefForSeries('ford-models:selected-city-online')?.id).toBe('ford');
    expect(briefForSeries('muse-model-management-nyc:email')?.id).toBe('muse-nyc');
    expect(briefForSeries('wilhelmina:selected-market-online')?.id).toBe('wilhelmina');
  });

  test('briefForSeries is an exact match, never a fuzzy match by name', () => {
    // "elite-na" is the entry's own id, not a series id it answers for.
    expect(briefForSeries('elite-na')).toBeNull();
    // A prospective series id is not a live match until a real route claims it.
    expect(briefForSeries('state:online')).toBeNull();
    expect(briefForSeries('')).toBeNull();
    expect(briefForSeries(null)).toBeNull();
    expect(briefForSeries(undefined)).toBeNull();
  });
});
