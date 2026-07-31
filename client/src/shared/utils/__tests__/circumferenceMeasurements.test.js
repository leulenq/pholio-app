import { describe, expect, test } from 'vitest';
import {
  CIRCUMFERENCE_RANGE_CM,
  circumferenceTapeConfig,
  circumferenceToCentimeters,
  circumferenceToDisplay,
} from '../circumferenceMeasurements';

describe('circumference measurement conversion', () => {
  test('uses broad technical bounds rather than adult fashion sample ranges', () => {
    expect(CIRCUMFERENCE_RANGE_CM).toEqual({ min: 20, max: 254 });
    expect(circumferenceTapeConfig('metric')).toMatchObject({ min: 20, max: 254, step: 1 });
    expect(circumferenceTapeConfig('imperial')).toMatchObject({ min: 8, max: 100, step: 0.5 });
  });

  test('shows imperial circumference to the nearest half inch', () => {
    expect(circumferenceToDisplay(70, 'imperial')).toBe(27.5);
    expect(circumferenceToDisplay(85, 'imperial')).toBe(33.5);
  });

  test('round-trips a half-inch edit through canonical integer centimeters', () => {
    const centimeters = circumferenceToCentimeters(33.5, 'imperial');

    expect(centimeters).toBe(85);
    expect(circumferenceToDisplay(centimeters, 'imperial')).toBe(33.5);
  });

  test('clamps only at the shared technical sanity bounds', () => {
    expect(circumferenceToCentimeters(2, 'imperial')).toBe(20);
    expect(circumferenceToCentimeters(120, 'imperial')).toBe(254);
    expect(circumferenceToCentimeters(12, 'metric')).toBe(20);
    expect(circumferenceToCentimeters(300, 'metric')).toBe(254);
  });

  test('leaves an empty measurement unset', () => {
    expect(circumferenceToDisplay(null, 'imperial')).toBeNull();
    expect(circumferenceToCentimeters(undefined, 'metric')).toBeNull();
  });
});
