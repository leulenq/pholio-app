import { describe, expect, it } from 'vitest';
import {
  RIGHTS_DENIED_STATUSES,
  imageHasDistributionRights,
  validateImagesForDistribution,
} from '../imageRights';

describe('imageHasDistributionRights', () => {
  it('passes an image with no rights metadata at all', () => {
    expect(imageHasDistributionRights({ id: 'img-1' }, null)).toBe(true);
    expect(imageHasDistributionRights({ id: 'img-1' }, {})).toBe(true);
    expect(
      imageHasDistributionRights({ id: 'img-1', metadata: null }, undefined),
    ).toBe(true);
  });

  it('passes statuses that are not an explicit denial', () => {
    expect(
      imageHasDistributionRights({ id: 'img-1' }, { rights_status: 'pending' }),
    ).toBe(true);
    expect(
      imageHasDistributionRights({ id: 'img-1', usage_rights: 'granted' }, null),
    ).toBe(true);
  });

  it('fails every denied token across all three rights carriers', () => {
    for (const token of RIGHTS_DENIED_STATUSES) {
      // carrier 1: the rights row
      expect(
        imageHasDistributionRights({ id: 'img-1' }, { rights_status: token }),
      ).toBe(false);
      // carrier 2: an image column
      expect(
        imageHasDistributionRights({ id: 'img-1', usage_rights: token }, null),
      ).toBe(false);
      // carrier 3: JSON-string image metadata
      expect(
        imageHasDistributionRights(
          { id: 'img-1', metadata: JSON.stringify({ license_status: token }) },
          null,
        ),
      ).toBe(false);
    }
  });
});

describe('validateImagesForDistribution', () => {
  it('accepts a list with no rights metadata', () => {
    const result = validateImagesForDistribution([{ id: 'a' }, { id: 'b' }], new Map());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports only the denied image', () => {
    const rightsMap = new Map([['b', { image_id: 'b', rights_status: 'blocked' }]]);
    const result = validateImagesForDistribution([{ id: 'a' }, { id: 'b' }], rightsMap);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].imageId).toBe('b');
    expect(result.errors[0].code).toBe('distribution_rights_denied');
  });
});
