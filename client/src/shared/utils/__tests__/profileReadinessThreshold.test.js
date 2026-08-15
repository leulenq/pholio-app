import { describe, expect, test } from 'vitest';
import {
  READINESS_THRESHOLDS,
  calculateProfileStrength,
  getReadinessThreshold,
} from '../profileScoring';

describe('getReadinessThreshold', () => {
  test('below 60 reads as in progress with an ink numeral', () => {
    expect(getReadinessThreshold(0)).toMatchObject({ label: 'In progress', tone: 'ink' });
    expect(getReadinessThreshold(59)).toMatchObject({ label: 'In progress', tone: 'ink' });
  });

  test('60 opens the core-complete band, still ink', () => {
    expect(getReadinessThreshold(READINESS_THRESHOLDS.core)).toMatchObject({
      key: 'core_complete',
      label: 'Core complete',
      tone: 'ink',
    });
    expect(getReadinessThreshold(84).label).toBe('Core complete');
  });

  test('85 opens the submission-ready band and turns the numeral gold', () => {
    expect(getReadinessThreshold(READINESS_THRESHOLDS.submissionReady)).toMatchObject({
      key: 'submission_ready',
      label: 'Submission-ready',
      tone: 'gold',
    });
    expect(getReadinessThreshold(99).tone).toBe('gold');
  });

  test('only a complete 100 earns the bright-gold celebration tone', () => {
    expect(getReadinessThreshold(100)).toMatchObject({
      label: 'Submission-ready',
      tone: 'celebration',
      value: 100,
    });
  });

  test('clamps, rounds, and survives junk input', () => {
    expect(getReadinessThreshold(140).value).toBe(100);
    expect(getReadinessThreshold(-20).value).toBe(0);
    expect(getReadinessThreshold(84.6).value).toBe(85);
    expect(getReadinessThreshold(undefined)).toMatchObject({ value: 0, tone: 'ink' });
    expect(getReadinessThreshold(Number.NaN).value).toBe(0);
  });
});

describe('calculateProfileStrength score', () => {
  test('still returns a 0-100 score for the readiness surfaces to read', () => {
    const empty = calculateProfileStrength(null);
    expect(empty.score).toBe(0);

    const partial = calculateProfileStrength({
      first_name: 'Nova',
      last_name: 'Lane',
      city: 'Paris',
      date_of_birth: '1998-04-02',
      gender: 'female',
      height_cm: 178,
      images: [],
    });

    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThanOrEqual(100);
    expect(getReadinessThreshold(partial.score).value).toBe(partial.score);
  });
});
