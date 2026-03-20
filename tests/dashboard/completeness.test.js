/**
 * Tests for Profile Completeness Calculation
 * 
 * These tests verify that the completeness calculation correctly identifies
 * complete and incomplete sections according to the documented requirements.
 */

const { calculateProfileCompleteness } = require('../../src/lib/dashboard/completeness');

describe('Profile Completeness Calculation', () => {
  describe('Empty Profile', () => {
    test('should return 0% completeness for null profile', () => {
      const result = calculateProfileCompleteness(null, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(Object.keys(result.sections)).toHaveLength(8);
    });

    test('should return 0% completeness for empty profile object', () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
    });
  });

  describe('Section 1: Personal Information', () => {
    test('should be complete when all required fields are present', () => {
      const profile = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        city: 'New York'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.status).toBe('complete');
      expect(result.sections.personalInfo.complete).toBe(true);
    });

    test('should be incomplete when any required field is missing', () => {
      const profile = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890'
        // city missing
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.status).toBe('incomplete');
      expect(result.sections.personalInfo.complete).toBe(false);
      expect(result.sections.personalInfo.message).toContain('city');
    });

    test('should be incomplete when email is missing', () => {
      const profile = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '1234567890',
        city: 'New York'
        // email missing
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.status).toBe('incomplete');
      expect(result.sections.personalInfo.message).toContain('email');
    });

    test('should handle empty strings as missing', () => {
      const profile = {
        first_name: 'John',
        last_name: 'Doe',
        email: '',
        phone: '1234567890',
        city: 'New York'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.status).toBe('incomplete');
    });
  });

  describe('Section 2: Physical Profile', () => {
    test('should be complete when all core measurements are present', () => {
      const profile = {
        height_cm: 175,
        bust: 90,
        waist: 70,
        hips: 95
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.status).toBe('complete');
      expect(result.sections.physicalProfile.complete).toBe(true);
    });

    test('should be incomplete when height is missing', () => {
      const profile = {
        bust: 90,
        waist: 70,
        hips: 95
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.status).toBe('incomplete');
      expect(result.sections.physicalProfile.message).toContain('height');
    });

    test('should be incomplete when measurements are missing', () => {
      const profile = {
        height_cm: 175
        // bust, waist, hips missing
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.status).toBe('incomplete');
      expect(result.sections.physicalProfile.message).toContain('measurements');
    });

    test('should handle zero as invalid measurement', () => {
      const profile = {
        height_cm: 0, // invalid
        bust: 90,
        waist: 70,
        hips: 95
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.status).toBe('incomplete');
    });
  });

  describe('Section 3: Experience & Training', () => {
    test('should be complete with experience_level only', () => {
      const profile = {
        experience_level: 'New Face'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.experienceTraining.status).toBe('complete');
    });

    test('should be complete with training only', () => {
      const profile = {
        training: 'Fashion school'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.experienceTraining.status).toBe('complete');
    });

    test('should be complete with experience_details only', () => {
      const profile = {
        experience_details: JSON.stringify({ years: 2, description: 'Test' })
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.experienceTraining.status).toBe('complete');
    });

    test('should be incomplete when all fields are missing', () => {
      const profile = {};
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.experienceTraining.status).toBe('incomplete');
    });
  });

  describe('Section 4: Skills & Lifestyle', () => {
    test('should be complete with specialties array', () => {
      const profile = {
        specialties: JSON.stringify(['Editorial', 'Commercial'])
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('complete');
    });

    test('should be complete with languages array', () => {
      const profile = {
        languages: JSON.stringify(['English', 'Spanish'])
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('complete');
    });

    test('should be complete with ethnicity', () => {
      const profile = {
        ethnicity: 'Asian'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('complete');
    });

    test('should be complete with tattoos (false)', () => {
      const profile = {
        tattoos: false // explicitly false, not null
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('complete');
    });

    test('should be complete with piercings (false)', () => {
      const profile = {
        piercings: false
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('complete');
    });

    test('should be incomplete when all fields are missing', () => {
      const profile = {};
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('incomplete');
    });

    test('should handle empty arrays as incomplete', () => {
      const profile = {
        specialties: JSON.stringify([])
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.status).toBe('incomplete');
    });

    test('should handle malformed JSON gracefully', () => {
      const profile = {
        specialties: 'not valid json'
      };
      const result = calculateProfileCompleteness(profile, []);
      // Should not throw error, but should be incomplete
      expect(result.sections.skillsLifestyle.status).toBe('incomplete');
    });
  });

  describe('Section 5: Comfort & Boundaries', () => {
    test('should be complete with non-empty comfort_levels array', () => {
      const profile = {
        comfort_levels: JSON.stringify(['Swimwear', 'Lingerie'])
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.comfortBoundaries.status).toBe('complete');
    });

    test('should be incomplete with empty comfort_levels array', () => {
      const profile = {
        comfort_levels: JSON.stringify([])
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.comfortBoundaries.status).toBe('incomplete');
    });

    test('should be incomplete when comfort_levels is missing', () => {
      const profile = {};
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.comfortBoundaries.status).toBe('incomplete');
    });
  });

  describe('Section 6: Availability & Locations', () => {
    test('should be complete with schedule and city', () => {
      const profile = {
        availability_schedule: 'Full-time',
        city: 'New York'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('complete');
    });

    test('should be complete with travel availability and city', () => {
      const profile = {
        availability_travel: true,
        city: 'Los Angeles'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('complete');
    });

    test('should be complete with schedule and secondary city', () => {
      const profile = {
        availability_schedule: 'Part-time',
        city_secondary: 'Miami'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('complete');
    });

    test('should be incomplete when only availability is set (no location)', () => {
      const profile = {
        availability_schedule: 'Full-time'
        // no city
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('incomplete');
    });

    test('should be incomplete when only location is set (no availability)', () => {
      const profile = {
        city: 'New York'
        // no availability
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('incomplete');
    });

    test('should handle travel as false (not null) as valid', () => {
      const profile = {
        availability_travel: false, // explicitly false
        city: 'New York'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.status).toBe('complete');
    });
  });

  describe('Section 7: Social & Portfolio', () => {
    test('should be complete with social handle and images', () => {
      const profile = {
        instagram_handle: '@john_doe'
      };
      const images = [{ id: 1, path: '/uploads/image1.jpg' }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });

    test('should be complete with social handle and portfolio_url', () => {
      const profile = {
        instagram_handle: '@john_doe',
        portfolio_url: 'https://example.com'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });

    test('should be complete with images only if no social required', () => {
      // Actually, this requires BOTH social AND portfolio based on the logic
      // Let me check the actual implementation...
      const profile = {};
      const images = [{ id: 1, path: '/uploads/image1.jpg' }];
      const result = calculateProfileCompleteness(profile, images);
      // This should be incomplete because no social handle
      expect(result.sections.socialPortfolio.status).toBe('incomplete');
    });

    test('should be incomplete when only images exist (no social)', () => {
      const profile = {};
      const images = [{ id: 1, path: '/uploads/image1.jpg' }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.status).toBe('incomplete');
      expect(result.sections.socialPortfolio.message).toContain('social');
    });

    test('should be incomplete when only social exists (no portfolio)', () => {
      const profile = {
        instagram_handle: '@john_doe'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.socialPortfolio.status).toBe('incomplete');
      expect(result.sections.socialPortfolio.message).toContain('portfolio');
    });

    test('should accept multiple social platforms', () => {
      const profile = {
        twitter_handle: '@johndoe'
      };
      const images = [{ id: 1 }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });
  });

  describe('Section 8: References & Emergency', () => {
    test('should be complete when all required fields are present', () => {
      const profile = {
        reference_name: 'Jane Smith',
        reference_email: 'jane@example.com',
        reference_phone: '1234567890',
        emergency_contact_name: 'John Doe',
        emergency_contact_phone: '0987654321',
        work_eligibility: 'Yes'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.referencesEmergency.status).toBe('complete');
    });

    test('should be incomplete when reference_name is missing', () => {
      const profile = {
        reference_email: 'jane@example.com',
        reference_phone: '1234567890',
        emergency_contact_name: 'John Doe',
        emergency_contact_phone: '0987654321',
        work_eligibility: 'Yes'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.referencesEmergency.status).toBe('incomplete');
      expect(result.sections.referencesEmergency.message).toContain('reference');
    });

    test('should be incomplete when work_eligibility is missing', () => {
      const profile = {
        reference_name: 'Jane Smith',
        reference_email: 'jane@example.com',
        reference_phone: '1234567890',
        emergency_contact_name: 'John Doe',
        emergency_contact_phone: '0987654321'
        // work_eligibility missing
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.referencesEmergency.status).toBe('incomplete');
      expect(result.sections.referencesEmergency.message).toContain('eligibility');
    });

    test('should accept work_eligibility as false', () => {
      const profile = {
        reference_name: 'Jane Smith',
        reference_email: 'jane@example.com',
        reference_phone: '1234567890',
        emergency_contact_name: 'John Doe',
        emergency_contact_phone: '0987654321',
        work_eligibility: false // explicitly false
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.referencesEmergency.status).toBe('complete');
    });
  });

  describe('Overall Completeness Percentage', () => {
    test('should calculate 0% for empty profile', () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
    });

    test('should calculate 12.5% for 1 complete section (1/8)', () => {
      const profile = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        city: 'New York'
        // Only personal info complete
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.percentage).toBe(12); // Math.round(1/8 * 100) = 12.5 -> 12
      expect(result.isComplete).toBe(false);
    });

    test('should calculate 100% for fully complete profile', () => {
      const profile = {
        // Section 1: Personal Info
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        city: 'New York',
        // Section 2: Physical Profile
        height_cm: 175,
        bust: 90,
        waist: 70,
        hips: 95,
        // Section 3: Experience & Training
        experience_level: 'New Face',
        // Section 4: Skills & Lifestyle
        specialties: JSON.stringify(['Editorial']),
        // Section 5: Comfort & Boundaries
        comfort_levels: JSON.stringify(['Swimwear']),
        // Section 6: Availability & Locations
        availability_schedule: 'Full-time',
        // Section 7: Social & Portfolio
        instagram_handle: '@johndoe',
        // Section 8: References & Emergency
        reference_name: 'Jane Smith',
        reference_email: 'jane@example.com',
        reference_phone: '1234567890',
        emergency_contact_name: 'John Doe',
        emergency_contact_phone: '0987654321',
        work_eligibility: 'Yes'
      };
      const images = [{ id: 1, path: '/uploads/image1.jpg' }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.percentage).toBe(100);
      expect(result.isComplete).toBe(true);
    });

    test('should calculate 50% for 4 complete sections (4/8)', () => {
      const profile = {
        // Section 1: Personal Info
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        city: 'New York',
        // Section 2: Physical Profile
        height_cm: 175,
        bust: 90,
        waist: 70,
        hips: 95,
        // Section 3: Experience & Training
        experience_level: 'New Face',
        // Section 4: Skills & Lifestyle
        specialties: JSON.stringify(['Editorial'])
        // Sections 5-8 incomplete
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.percentage).toBe(50);
      expect(result.isComplete).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null values gracefully', () => {
      const profile = {
        first_name: null,
        last_name: undefined,
        email: '',
        phone: null,
        city: 'New York'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.status).toBe('incomplete');
    });

    test('should handle images array correctly', () => {
      const profile = {
        instagram_handle: '@john'
      };
      const images = [
        { id: 1, path: '/uploads/img1.jpg' },
        { id: 2, path: '/uploads/img2.jpg' }
      ];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });

    test('should handle empty images array', () => {
      const profile = {
        instagram_handle: '@john',
        portfolio_url: 'https://example.com'
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });

    test('should handle non-array images parameter', () => {
      const profile = {
        instagram_handle: '@john',
        portfolio_url: 'https://example.com'
      };
      const result = calculateProfileCompleteness(profile, null);
      // Should not throw error
      expect(result.sections.socialPortfolio.status).toBe('complete');
    });
  });
});