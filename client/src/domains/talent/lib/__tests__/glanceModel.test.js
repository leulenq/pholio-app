import { describe, expect, test } from 'vitest';
import { glanceForEntry } from '../glanceModel';
import { briefForSeries, checkedOn } from '../../content/agencyBriefs';
import { CHANNEL_TYPE, formatRegistryDate } from '../specRegistry';

describe('glanceForEntry', () => {
  test('an authored brief wins: its glance rides through verbatim', () => {
    const brief = briefForSeries('elite-models-na:online-general');
    const glance = glanceForEntry({ channelType: CHANNEL_TYPE.OFFICIAL_EMAIL }, brief);

    expect(glance).toEqual({
      applyMethod: 'Online form or email',
      prepSummary: '6 photos · measurements · short bio',
      gates: ['Women only'],
      hasHeadsUp: true,
      checkedOn: formatRegistryDate(checkedOn),
    });
  });

  test('an authored brief with no heads-up reports one honestly', () => {
    const brief = briefForSeries('ford-models:selected-city-online');
    const glance = glanceForEntry({}, brief);

    expect(glance.gates).toEqual([]);
    // Ford's authored entry sets headsUp: true — reflected, not invented.
    expect(glance.hasHeadsUp).toBe(true);
  });

  test('no brief: applyMethod is derived from the channel type', () => {
    expect(glanceForEntry({ channelType: CHANNEL_TYPE.OFFICIAL_WEB_FORM }, null).applyMethod).toBe(
      'Online form',
    );
    expect(glanceForEntry({ channelType: CHANNEL_TYPE.OFFICIAL_EMAIL }, null).applyMethod).toBe('Email');
    expect(
      glanceForEntry({ channelType: CHANNEL_TYPE.AGENCY_BRANDED_THIRD_PARTY_FORM }, null).applyMethod,
    ).toBe('Online form');
  });

  test('no brief and no known channel: applyMethod is null, never a guess', () => {
    expect(glanceForEntry({}, null).applyMethod).toBeNull();
    expect(glanceForEntry(null, null).applyMethod).toBeNull();
  });

  test('no brief: prepSummary only appears when a shot count is actually known', () => {
    expect(glanceForEntry({ shotCount: 4 }, null).prepSummary).toBe('4 photos');
    expect(glanceForEntry({ shotCount: 1 }, null).prepSummary).toBe('1 photo');
    expect(glanceForEntry({}, null).prepSummary).toBeNull();
    expect(glanceForEntry({ shotCount: 0 }, null).prepSummary).toBeNull();
  });

  test('no brief: gates and heads-up are never invented', () => {
    const glance = glanceForEntry({ channelType: CHANNEL_TYPE.OFFICIAL_WEB_FORM }, null);
    expect(glance.gates).toEqual([]);
    expect(glance.hasHeadsUp).toBe(false);
  });

  test('no brief: checkedOn comes from the route DTO, formatted, or null', () => {
    expect(glanceForEntry({ sourceCheckedOn: '2026-08-01' }, null).checkedOn).toBe(
      formatRegistryDate('2026-08-01'),
    );
    expect(glanceForEntry({}, null).checkedOn).toBeNull();
  });
});
