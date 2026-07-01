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
      expect(result.waist).toBe('');
      expect(result.bust).toBe(85);
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
        bust: 80,
        waist: 60,
        hips: 90,
        height_cm: 165,
        hair_color: 'black',
      };

      const { finalPayload } = normalizeProfileForSave(formData, true);

      expect(finalPayload.hair_color).toBe('black');
      expect(finalPayload.bust).toBeUndefined();
      expect(finalPayload.waist).toBeUndefined();
      expect(finalPayload.hips).toBeUndefined();
      expect(finalPayload.height_cm).toBeUndefined();
    });
  });
});
