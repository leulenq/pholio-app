import { describe, test, expect } from 'vitest';
import {
  nullClear,
  normalizeProfileForForm,
  normalizeProfileForSave
} from '../formNormalization';

describe('Form Normalization Utilities', () => {
  describe('nullClear', () => {
    test('should convert empty strings to null recursively', () => {
      const input = {
        name: 'John',
        middle_name: '',
        details: {
          bio: '  ', // whitespace only should also become null
          gender: '',
          age: 25,
        },
        tags: ['', 'Valid'],
      };

      const expected = {
        name: 'John',
        middle_name: null,
        details: {
          bio: null,
          gender: null,
          age: 25,
        },
        tags: [null, 'Valid'],
      };

      expect(nullClear(input)).toEqual(expected);
    });

    test('should exclude specified keys from null clearing', () => {
      const input = {
        first_name: '',
        last_name: '   ',
        email: '',
        city: '',
      };

      const expected = {
        first_name: '',
        last_name: '   ',
        email: '',
        city: null,
      };

      expect(nullClear(input, ['first_name', 'last_name', 'email'])).toEqual(expected);
    });
  });

  describe('normalizeProfileForForm', () => {
    test('should populate uncontrolled inputs fallback to empty strings', () => {
      const profile = {
        first_name: 'Jane',
        last_name: null,
        city: null,
        bust_cm: 85,
        waist_cm: null,
        languages: 'English,Spanish',
        experience_details: JSON.stringify(['Credit 1', 'Credit 2']),
      };

      const result = normalizeProfileForForm(profile);

      expect(result.first_name).toBe('Jane');
      expect(result.last_name).toBe('');
      expect(result.city).toBe('');
      expect(result.waist_cm).toBe('');
      expect(result.bust_cm).toBe(85);
      expect(result.languages).toEqual(['English', 'Spanish']);
      expect(result.experience_details).toEqual(['Credit 1', 'Credit 2']);
    });

    test('should handle booleans and tristates correctly', () => {
      const profile = {
        seeking_representation: 1,
        tattoos: 'false',
        work_eligibility: 'yes',
        passport_ready: null,
      };

      const result = normalizeProfileForForm(profile);

      expect(result.seeking_representation).toBe(true);
      expect(result.tattoos).toBe(false);
      expect(result.work_eligibility).toBe(true);
      expect(result.passport_ready).toBe(false); // default form boolean is false
    });

    test('normalizes PostgreSQL decimal strings before hydrating measurement controls', () => {
      const result = normalizeProfileForForm({
        height_cm: '178',
        weight_kg: '57.00',
        bust_cm: '81.0',
        chest_cm: null,
        waist_cm: '61.0',
        hips_cm: '88.0',
        inseam_cm: null,
        playing_age_min: null,
        playing_age_max: '28',
      });

      expect(result.height_cm).toBe(178);
      expect(result.weight_kg).toBe(57);
      expect(result.bust_cm).toBe(81);
      expect(result.chest_cm).toBe('');
      expect(result.waist_cm).toBe(61);
      expect(result.hips_cm).toBe(88);
      expect(result.inseam_cm).toBe('');
      expect(result.playing_age_min).toBe('');
      expect(result.playing_age_max).toBe(28);
    });
  });

  describe('normalizeProfileForSave', () => {
    test('should split strings into lists and nullClear empty fields', () => {
      const formData = {
        first_name: 'Nova',
        last_name: '',
        languages: 'French, German, ',
        specialties: 'Runway, Editorial',
        bio: '   ',
        hair_color: '',
        seeking_representation: 'true',
        representation_status: 'seeking',
        representations: [],
      };

      const { finalPayload } = normalizeProfileForSave(formData);

      expect(finalPayload.first_name).toBe('Nova');
      expect(finalPayload.last_name).toBe(''); // excluded from nullClear
      expect(finalPayload.languages).toEqual(['French', 'German']);
      expect(finalPayload.specialties).toEqual(['Runway', 'Editorial']);
      expect(finalPayload.bio).toBeNull();
      expect(finalPayload.hair_color).toBeNull();
      expect(finalPayload.seeking_representation).toBe(true);
    });

    test('should remove sensitive fields if measurements are locked', () => {
      const formData = {
        first_name: 'Min',
        bust_cm: 80,
        waist_cm: 60,
        hips_cm: 90,
        height_cm: 165,
        hair_color: 'black',
      };

      const { finalPayload } = normalizeProfileForSave(formData, true);

      expect(finalPayload.hair_color).toBe('black');
      expect(finalPayload.bust_cm).toBeUndefined();
      expect(finalPayload.waist_cm).toBeUndefined();
      expect(finalPayload.hips_cm).toBeUndefined();
      expect(finalPayload.height_cm).toBeUndefined();
    });
  });
});
