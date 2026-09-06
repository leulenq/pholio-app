import { describe, it, expect } from 'vitest';
import { getShoeConversions } from '../measurementConversions';

/**
 * Regression coverage for the shoe converter being wrong by ~2x: the old
 * formula computed EU as `US*2 + 31` (US 9 → EU 49) instead of `US + 31`
 * (US 9 → EU 40). The server (src/domains/pdf/composition/stats-formatter.js
 * — SHOE_EU_OFFSET = { women: 31, men: 33 }) is the oracle for the EU rule;
 * `getShoeConversions` must be track-aware and match it, defaulting to the
 * women's offset when no track is given (same fallback the server uses).
 */
describe('getShoeConversions', () => {
  it('US 9, women — EU 40, UK 7', () => {
    expect(getShoeConversions(9, 'US', 'women')).toBe('≈ UK 7, EU 40');
  });

  it('US 10, men — EU 43, UK 9', () => {
    expect(getShoeConversions(10, 'US', 'men')).toBe('≈ UK 9, EU 43');
  });

  it('defaults to the women\'s offset when no track is given', () => {
    expect(getShoeConversions(9, 'US')).toBe('≈ UK 7, EU 40');
  });

  it('accepts the client stats-track vocabulary as well as the server category names', () => {
    expect(getShoeConversions(9, 'US', 'womenswear')).toBe('≈ UK 7, EU 40');
    expect(getShoeConversions(10, 'US', 'menswear')).toBe('≈ UK 9, EU 43');
  });

  it('is symmetric starting from a UK size', () => {
    expect(getShoeConversions(7, 'UK', 'women')).toBe('≈ US 9, EU 40');
    expect(getShoeConversions(9, 'UK', 'men')).toBe('≈ US 10, EU 43');
  });

  it('is symmetric starting from an EU size', () => {
    expect(getShoeConversions(40, 'EU', 'women')).toBe('≈ US 9, UK 7');
    expect(getShoeConversions(43, 'EU', 'men')).toBe('≈ US 10, UK 9');
  });

  it('is no longer off by ~2x (US 9 must not read as EU 49)', () => {
    expect(getShoeConversions(9, 'US', 'women')).not.toContain('EU 49');
  });

  it('returns an empty string for missing input', () => {
    expect(getShoeConversions('', 'US', 'women')).toBe('');
    expect(getShoeConversions(null, 'US', 'women')).toBe('');
  });

  it('preserves half sizes', () => {
    expect(getShoeConversions(9.5, 'US', 'women')).toBe('≈ UK 7.5, EU 40.5');
  });
});
