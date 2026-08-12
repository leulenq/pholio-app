import { describe, expect, it } from 'vitest';
import { bucketCounts, statusConfig } from '../applicationStatus';
import { deriveRepresentationStatus } from '../representationStatus';

describe('application representation status', () => {
  it('keeps an accepted offer distinct from completed representation', () => {
    expect(statusConfig('accepted')).toMatchObject({
      label: 'Offer / Moving Forward',
      group: 'advancing',
    });
    expect(statusConfig('represented')).toMatchObject({
      label: 'Represented',
      group: 'represented',
    });
  });

  it('counts only represented applications as represented', () => {
    expect(bucketCounts([
      { status: 'accepted' },
      { status: 'represented' },
      { status: 'booked' },
    ])).toEqual({
      inReview: 1,
      advancing: 1,
      represented: 1,
      closed: 0,
    });
  });

  it('does not describe an offer as current representation', () => {
    expect(deriveRepresentationStatus([
      { status: 'accepted', agency_name: 'North Star Models' },
    ])).toMatchObject({ state: 'in_conversation', label: 'In conversation' });

    expect(deriveRepresentationStatus([
      { status: 'represented', agency_name: 'North Star Models' },
    ])).toMatchObject({
      state: 'represented',
      label: 'Represented by',
      agency: 'North Star Models',
    });
  });
});
