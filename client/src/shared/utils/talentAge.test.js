import {
  canCollectSensitiveProfileFields,
  computeAge,
  minorPublicExposureAllowed,
  minorSensitiveFieldsUnlocked,
  parseDateOfBirthParts,
} from './talentAge';

const REF = new Date('2026-06-24T12:00:00.000Z');

describe('talentAge adults-only client policy', () => {
  test('only a valid DOB proving age 18+ unlocks sensitive fields and exposure', () => {
    const adult = { date_of_birth: '1998-01-01' };
    const minorWithGuardian = {
      date_of_birth: '2012-03-15',
      guardian_consent_at: '2026-01-01T00:00:00.000Z',
    };

    expect(minorSensitiveFieldsUnlocked(adult, REF)).toBe(true);
    expect(minorPublicExposureAllowed(adult, REF)).toBe(true);
    expect(canCollectSensitiveProfileFields(adult, REF)).toBe(true);
    expect(minorSensitiveFieldsUnlocked(minorWithGuardian, REF)).toBe(false);
    expect(minorPublicExposureAllowed(minorWithGuardian, REF)).toBe(false);
  });

  test.each([
    ['missing', null],
    ['malformed', 'not-a-date'],
    ['impossible', '2012-02-30'],
    ['invalid Date', new Date('invalid')],
    ['future', '2030-01-01'],
  ])('%s DOB fails closed without throwing', (_label, dob) => {
    expect(() => parseDateOfBirthParts(dob)).not.toThrow();
    expect(computeAge(dob, REF)).toBeNull();
    expect(minorSensitiveFieldsUnlocked({ date_of_birth: dob }, REF)).toBe(false);
    expect(minorPublicExposureAllowed({ date_of_birth: dob }, REF)).toBe(false);
  });
});
