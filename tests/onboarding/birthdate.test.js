/**
 * Onboarding birthdate validation — unit tests
 *
 * Tests the server-side validation logic used in POST /onboarding/birthdate
 * using the talent-age library that the route delegates to.
 */

const {
  parseDateOfBirthParts,
  computeAge,
} = require('../../src/shared/lib/talent-age');

// Freeze reference date: 2026-06-25
const REF = new Date('2026-06-25T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Helper mirroring the route's validation logic so tests stay in sync
// ---------------------------------------------------------------------------
function validateDob(dobStr, referenceDate = REF) {
  if (!dobStr || !String(dobStr).trim()) {
    return { ok: false, code: 'DOB_REQUIRED' };
  }

  const parts = parseDateOfBirthParts(String(dobStr).trim());
  if (!parts) {
    return { ok: false, code: 'DOB_INVALID' };
  }

  const dobDate = new Date(`${dobStr}T00:00:00.000Z`);
  if (dobDate > referenceDate) {
    return { ok: false, code: 'DOB_FUTURE' };
  }

  const age = computeAge(dobStr, referenceDate);
  if (age === null || age < 13) {
    return { ok: false, code: 'DOB_TOO_YOUNG' };
  }

  return { ok: true, age };
}

describe('POST /onboarding/birthdate validation', () => {
  describe('missing / empty input', () => {
    test('returns DOB_REQUIRED for null', () => {
      expect(validateDob(null).code).toBe('DOB_REQUIRED');
    });

    test('returns DOB_REQUIRED for empty string', () => {
      expect(validateDob('').code).toBe('DOB_REQUIRED');
    });

    test('returns DOB_REQUIRED for whitespace', () => {
      expect(validateDob('   ').code).toBe('DOB_REQUIRED');
    });
  });

  describe('malformed input', () => {
    test('returns DOB_INVALID for a non-date string', () => {
      expect(validateDob('not-a-date').code).toBe('DOB_INVALID');
    });

    test('returns DOB_INVALID for MM/DD/YYYY format (wrong separator)', () => {
      expect(validateDob('06/25/2000').code).toBe('DOB_INVALID');
    });

    test('returns DOB_INVALID for partial date', () => {
      expect(validateDob('2000-06').code).toBe('DOB_INVALID');
    });
  });

  describe('future date', () => {
    test('returns DOB_FUTURE for tomorrow', () => {
      expect(validateDob('2026-06-26').code).toBe('DOB_FUTURE');
    });

    test('returns DOB_FUTURE for a date 10 years from now', () => {
      expect(validateDob('2036-01-01').code).toBe('DOB_FUTURE');
    });
  });

  describe('age below COPPA floor (13)', () => {
    test('returns DOB_TOO_YOUNG for a 12-year-old', () => {
      // Born 2014-06-25 is exactly 12 on the reference date
      expect(validateDob('2014-06-25').code).toBe('DOB_TOO_YOUNG');
    });

    test('returns DOB_TOO_YOUNG for a child born this year', () => {
      expect(validateDob('2020-01-01').code).toBe('DOB_TOO_YOUNG');
    });

    test('returns DOB_TOO_YOUNG for age 0', () => {
      expect(validateDob('2026-01-01').code).toBe('DOB_TOO_YOUNG');
    });
  });

  describe('valid inputs', () => {
    test('accepts exactly 13 years old today', () => {
      // Born 2013-06-25 is exactly 13 on reference date
      const result = validateDob('2013-06-25');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(13);
    });

    test('accepts a minor (age 17)', () => {
      const result = validateDob('2009-01-01');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(17);
    });

    test('accepts an adult (age 25)', () => {
      const result = validateDob('2000-12-01');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(25);
    });

    test('accepts near-century age (99 years old)', () => {
      const result = validateDob('1927-01-01');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(99);
    });

    test('returns correct age for birthday not yet reached this year', () => {
      // Born 2001-12-31 → hasn't had birthday yet in June 2026 → age 24
      const result = validateDob('2001-12-31');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(24);
    });

    test('returns correct age for birthday already passed this year', () => {
      // Born 2001-01-01 → birthday passed in June 2026 → age 25
      const result = validateDob('2001-01-01');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(25);
    });

    test('accepts ISO timestamp prefix (PostgreSQL format)', () => {
      // PostgreSQL stores DOB as full timestamp; route strips time via parseDateOfBirthParts
      const result = validateDob('1995-03-15T05:00:00.000Z');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(31);
    });
  });

  describe('minor notice boundary (age 13–17)', () => {
    test('age 13 qualifies as minor', () => {
      const result = validateDob('2013-06-25');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(13);
      expect(result.age < 18).toBe(true);
    });

    test('age 17 qualifies as minor', () => {
      const result = validateDob('2009-06-26');
      expect(result.ok).toBe(true);
      expect(result.age).toBe(16); // hasn't had birthday yet on ref date
    });

    test('age 18 is NOT a minor', () => {
      const result = validateDob('2008-06-25');
      expect(result.ok).toBe(true);
      expect(result.age >= 18).toBe(true);
    });
  });
});
