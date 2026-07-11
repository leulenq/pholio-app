import { describe, test, expect } from 'vitest';
import {
  tierBandToScore,
  chipValueText,
  chipEditKind,
  constraintAnnotations,
  amendBriefValue,
  amendBriefRemove,
} from '../discoverMatch';

describe('discoverMatch — tier bands', () => {
  test('maps coarse bands to representative ring numerals', () => {
    expect(tierBandToScore('high')).toBe(92);
    expect(tierBandToScore('mid')).toBe(80);
    expect(tierBandToScore('low')).toBe(66);
  });
  test('absent band → null (ring omitted)', () => {
    expect(tierBandToScore(undefined)).toBeNull();
    expect(tierBandToScore('nope')).toBeNull();
  });
});

describe('discoverMatch — chip value display', () => {
  test('height min renders imperial with ≥ operator', () => {
    expect(chipValueText({ field: 'height_cm', op: 'min', value: { a: 175, b: null } }))
      .toBe("≥ 5'9\"");
  });
  test('playing-age range', () => {
    expect(chipValueText({ field: 'playing_age', value: { a: 22, b: 30 } })).toBe('22–30');
  });
  test('enum OR-set is capitalised + joined', () => {
    expect(chipValueText({ field: 'hair_color', value: ['blonde', 'red'] })).toBe('Blonde, Red');
  });
  test('visible_tattoos boolean', () => {
    expect(chipValueText({ field: 'visible_tattoos', value: false })).toBe('None visible');
  });
});

describe('discoverMatch — edit kinds', () => {
  test('numeric vs date vs non-editable', () => {
    expect(chipEditKind('height_cm')).toBe('number');
    expect(chipEditKind('measurements.waist_cm')).toBe('number');
    expect(chipEditKind('availability')).toBe('date');
    expect(chipEditKind('gender_presentation')).toBeNull();
  });
});

describe('discoverMatch — constraint-truth annotations', () => {
  test('availability unknown vs fail', () => {
    expect(constraintAnnotations([{ field: 'availability', status: 'unknown' }]))
      .toEqual(['availability unconfirmed']);
    expect(constraintAnnotations([{ field: 'availability', status: 'fail' }]))
      .toEqual(['unavailable in window']);
  });
  test('height fail carries the actual value', () => {
    expect(constraintAnnotations([{ field: 'height_cm', status: 'fail', actual: 178 }]))
      .toEqual(["5'10\" — below ask"]);
  });
  test('dedupes repeated annotations', () => {
    expect(constraintAnnotations([
      { field: 'location', status: 'fail' },
      { field: 'location', status: 'unknown' },
    ])).toEqual(['outside preferred market']);
  });
});

describe('discoverMatch — authoritative brief amendments', () => {
  const brief = 'editorial women, 5\'9" and up, NYC';
  const applied = { field: 'height_cm', op: 'min', value: { a: 175 }, span: [16, 20] };
  // span [16,20] covers 5'9"

  test('value edit splices the new phrase in place of the span', () => {
    const next = amendBriefValue(brief, applied, '178');
    expect(next).toBe('editorial women, 178cm and up, NYC');
    expect(next).not.toContain("5'9");
  });

  test('value edit with null span appends a marked amendment', () => {
    const noSpan = { field: 'height_cm', op: 'min', value: { a: 175 }, span: null };
    const next = amendBriefValue(brief, noSpan, '178');
    expect(next).toContain('(edited: 178cm and up)');
  });

  test('removal cuts the span substring', () => {
    const next = amendBriefRemove(brief, applied);
    expect(next).not.toContain("5'9");
    expect(next).toContain('editorial women');
    expect(next).toContain('NYC');
  });

  test('removal with null span appends an ignore amendment', () => {
    const noSpan = { field: 'availability', span: null };
    const next = amendBriefRemove(brief, noSpan);
    expect(next).toContain('(edited: ignore available)');
  });
});
