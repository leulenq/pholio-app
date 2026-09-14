const {
  computeAge,
  isMinorProfile,
  hasGuardianConsent,
  minorSensitiveFieldsUnlocked,
  minorPublicExposureAllowed,
  canCollectSensitiveProfileFields,
  parseDateOfBirthParts,
} = require('../../src/shared/lib/talent-age');

const REF = new Date('2026-06-24T12:00:00.000Z');

describe('talent-age policy', () => {
  test('parses ISO date and timestamp DOB prefixes', () => {
    expect(parseDateOfBirthParts('1998-01-01')).toEqual({ year: 1998, month: 1, day: 1 });
    expect(parseDateOfBirthParts('2012-03-15T05:00:00.000Z')).toEqual({
      year: 2012,
      month: 3,
      day: 15,
    });
  });

  test('computes age with UTC birthday boundary', () => {
    expect(computeAge('1998-01-01', REF)).toBe(28);
    expect(computeAge('2012-03-15', REF)).toBe(14);
  });

  test('guardian consent does not override the adults-only launch policy', () => {
    const minor = { date_of_birth: '2012-03-15' };
    expect(isMinorProfile(minor, REF)).toBe(true);
    expect(minorSensitiveFieldsUnlocked(minor, REF)).toBe(false);
    expect(minorPublicExposureAllowed(minor, REF)).toBe(false);

    const consented = {
      ...minor,
      guardian_consent_at: '2026-01-01T00:00:00.000Z',
    };
    expect(hasGuardianConsent(consented)).toBe(true);
    expect(minorSensitiveFieldsUnlocked(consented, REF)).toBe(false);
    expect(minorPublicExposureAllowed(consented, REF)).toBe(false);
  });

  test('adult profile is always unlocked', () => {
    const adult = { date_of_birth: '1998-01-01' };
    expect(isMinorProfile(adult, REF)).toBe(false);
    expect(minorSensitiveFieldsUnlocked(adult, REF)).toBe(true);
    expect(minorPublicExposureAllowed(adult, REF)).toBe(true);
  });

  test('missing DOB is not treated as minor', () => {
    expect(isMinorProfile({}, REF)).toBe(false);
    expect(minorSensitiveFieldsUnlocked({}, REF)).toBe(false);
  });

  test('missing DOB fails closed for public exposure and sensitive collection', () => {
    // No DOB => age unknown => must be DENIED (fail closed), even though the
    // profile is not classified as a minor.
    expect(minorPublicExposureAllowed({}, REF)).toBe(false);
    expect(minorPublicExposureAllowed({ date_of_birth: null }, REF)).toBe(false);
    expect(minorPublicExposureAllowed({ date_of_birth: 'not-a-date' }, REF)).toBe(false);
    expect(canCollectSensitiveProfileFields({}, REF)).toBe(false);

    // Adult with a valid DOB is unaffected by the fail-closed change.
    const adult = { date_of_birth: '1998-01-01' };
    expect(minorPublicExposureAllowed(adult, REF)).toBe(true);
    expect(canCollectSensitiveProfileFields(adult, REF)).toBe(true);
  });

  test.each([
    ['impossible calendar date', '2012-02-30'],
    ['invalid Date instance', new Date('invalid')],
    ['future DOB', '2030-01-01'],
    ['implausibly old DOB', '1800-01-01'],
  ])('%s fails closed', (_label, dob) => {
    expect(() => parseDateOfBirthParts(dob)).not.toThrow();
    expect(computeAge(dob, REF)).toBeNull();
    expect(minorSensitiveFieldsUnlocked({ date_of_birth: dob }, REF)).toBe(false);
    expect(minorPublicExposureAllowed({ date_of_birth: dob }, REF)).toBe(false);
    expect(canCollectSensitiveProfileFields({ date_of_birth: dob }, REF)).toBe(false);
  });
});
