import { describe, it, expect } from 'vitest';
import { STATES, getState } from './statusConfig';

/**
 * Regression coverage for the availability fallback bug: the server
 * (src/domains/talent/routes/availability.js) writes exactly
 * `available | limited | unavailable`. `getState` used to fall back to
 * `STATES.available` for anything it didn't recognise, so a talent who had
 * booked themselves out (`unavailable`) — or any status not yet in this map
 * — read as available in the dossier. It must never default to available.
 */
describe('getState — never defaults to available', () => {
  it('resolves the three real server values', () => {
    expect(getState('available')).toBe(STATES.available);
    expect(getState('limited')).toBe(STATES.limited);
    expect(getState('unavailable')).toBe(STATES.unavailable);
  });

  it('returns an explicit unknown state for missing input, not available', () => {
    expect(getState(undefined)).toBe(STATES.unknown);
    expect(getState(null)).toBe(STATES.unknown);
    expect(getState('')).toBe(STATES.unknown);
    expect(getState(undefined)).not.toBe(STATES.available);
  });

  it('returns the unknown state for an unrecognised status, not available', () => {
    expect(getState('some_future_status')).toBe(STATES.unknown);
    expect(getState('some_future_status')).not.toBe(STATES.available);
  });

  it('unknown state reads as a plain, factual, non-marketing label', () => {
    expect(STATES.unknown.label).toBe('Availability not stated');
  });

  it('limited and unavailable carry distinct copy from available', () => {
    expect(STATES.limited.label).toBe('Limited');
    expect(STATES.unavailable.label).toBe('Unavailable');
    expect(STATES.limited.label).not.toBe(STATES.available.label);
    expect(STATES.unavailable.label).not.toBe(STATES.available.label);
  });

  it('is case/format tolerant like every other status lookup in this module', () => {
    expect(getState('UNAVAILABLE')).toBe(STATES.unavailable);
    expect(getState('Limited')).toBe(STATES.limited);
  });
});
