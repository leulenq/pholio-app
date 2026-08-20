import { describe, expect, test } from 'vitest';
import { marginaliaAddsInformation } from '../specRegistry';

/*
 * The rule the digitals panel leans on: an agency's wording appears with the
 * instruction only when it changes the instruction. These cases are the real
 * ones from the launch research — each falsely-material case here was a
 * duplicate requirement on screen before this rule existed.
 */
describe('marginaliaAddsInformation', () => {
  test('restatements of the canonical name add nothing', () => {
    // Muse — the owner's example: same instruction, plural + ellipsis apart.
    expect(marginaliaAddsInformation('Close ups … hair down', 'Close-up, hair down')).toBe(false);
    // IMG — the button's verb doesn't change what to shoot.
    expect(marginaliaAddsInformation('upload profile', 'Profile shot')).toBe(false);
    // Elite — "pic" and "photo" name the same thing.
    expect(marginaliaAddsInformation('Personality pic', 'Personality photo')).toBe(false);
    // Storm — required-marker asterisks are not information.
    expect(marginaliaAddsInformation('Mid length *', 'Mid-length')).toBe(false);
    // A subset of the canonical name is not an addition.
    expect(marginaliaAddsInformation('full length', 'Full length, head to toe')).toBe(false);
  });

  test('wording that changes what to shoot is material', () => {
    expect(marginaliaAddsInformation('Close up in natural daylight', 'Close-up')).toBe(true);
    expect(marginaliaAddsInformation('Full length in swimwear', 'Full length')).toBe(true);
    expect(marginaliaAddsInformation('Headshot, no glasses', 'Headshot')).toBe(true);
  });

  test('empty or stopword-only wording is never material', () => {
    expect(marginaliaAddsInformation('', 'Headshot')).toBe(false);
    expect(marginaliaAddsInformation(null, 'Headshot')).toBe(false);
    expect(marginaliaAddsInformation('Please upload a photo', 'Headshot')).toBe(false);
  });
});
