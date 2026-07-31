import { describe, expect, it } from 'vitest';
import { identityFormFromProfile } from './identityForm';

describe('identityFormFromProfile', () => {
  it('hydrates first/last name from profile fields', () => {
    expect(
      identityFormFromProfile({
        first_name: 'Ava',
        last_name: 'Martinez',
        phone: '+1 555 010 0199',
        languages: '["English","Spanish"]',
        timezone: 'America/Los_Angeles',
      }),
    ).toEqual({
      first_name: 'Ava',
      last_name: 'Martinez',
      phone: '+1 (555) 010-0199',
      language: 'English',
      timezone: 'America/Los_Angeles',
    });
  });

  it('falls back to splitting a full name when first/last are blank', () => {
    expect(
      identityFormFromProfile({
        name: 'Leo Chen',
        first_name: '',
        last_name: null,
      }),
    ).toMatchObject({
      first_name: 'Leo',
      last_name: 'Chen',
    });
  });

  it('returns empty name fields for a missing profile without throwing', () => {
    expect(identityFormFromProfile(undefined)).toEqual({
      first_name: '',
      last_name: '',
      phone: '',
      language: 'English',
      timezone: 'America/New_York',
    });
  });
});
