import { describe, test, expect } from 'vitest';
import { filterEditPhrase, amendBriefValue, amendBriefRemove } from '../discoverMatch';

describe('discoverMatch — edit phrases', () => {
  test('height respects the operator', () => {
    expect(filterEditPhrase({ field: 'height_cm', op: 'min', unit: 'cm' }, '178')).toBe('178cm and up');
    expect(filterEditPhrase({ field: 'height_cm', op: 'max', unit: 'cm' }, '170')).toBe('under 170cm');
    expect(filterEditPhrase({ field: 'height_cm', op: 'approx', unit: 'cm' }, '175')).toBe('around 175cm');
  });

  test('age, shoe and measurements read as plain words', () => {
    expect(filterEditPhrase({ field: 'playing_age' }, '27')).toBe('age 27');
    expect(filterEditPhrase({ field: 'shoe' }, '9')).toBe('size 9 shoe');
    expect(filterEditPhrase({ field: 'measurements.waist_cm', unit: 'cm' }, '61')).toBe('waist 61cm');
  });

  test('availability windows read as dates', () => {
    expect(filterEditPhrase({ field: 'availability' }, { from: '2026-07-09', to: '2026-07-14' }))
      .toBe('available Jul 9 through Jul 14');
    expect(filterEditPhrase({ field: 'availability' }, { from: '2026-07-09', to: '' }))
      .toBe('available from Jul 9');
  });
});

describe('discoverMatch — authoritative brief amendments', () => {
  const brief = 'editorial women, 5\'9" and up, NYC';
  // span [17, 28] covers the full constraint phrase: 5'9" and up
  const filter = {
    id: 'height_cm', field: 'height_cm', op: 'min', value: { a: 175 },
    text: '5\'9" and up', span: [17, 28], editable: 'number', unit: 'cm', edit_value: '175',
  };

  test('value edit splices the new phrase in place of the span', () => {
    const next = amendBriefValue(brief, filter, '178');
    expect(next).toBe('editorial women, 178cm and up, NYC');
    expect(next).not.toContain('5\'9');
  });

  test('value edit with no span appends a marked amendment', () => {
    const next = amendBriefValue(brief, { ...filter, span: null }, '178');
    expect(next).toContain('(edited: 178cm and up)');
  });

  test('removal cuts the span substring', () => {
    const next = amendBriefRemove(brief, filter);
    expect(next).not.toContain('5\'9');
    expect(next).toContain('editorial women');
    expect(next).toContain('NYC');
  });

  test('removal with no span appends an ignore amendment naming the chip', () => {
    const next = amendBriefRemove(brief, { field: 'availability', text: 'Available Jul 9 to 14', span: null });
    expect(next).toContain('(edited: ignore available jul 9 to 14)');
  });

  test('removal with no span and no text falls back to the field word', () => {
    const next = amendBriefRemove(brief, { field: 'union', span: null });
    expect(next).toContain('(edited: ignore union)');
  });
});
