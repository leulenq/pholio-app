import { beforeEach, describe, expect, it } from 'vitest';
import {
  stashOnboardingAuthHandoff,
  takeOnboardingAuthHandoff,
} from '../onboarding-handoff.js';

describe('onboarding auth handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stashes and consumes a google handoff once', () => {
    stashOnboardingAuthHandoff({
      method: 'google',
      name: 'Ava Martinez',
      email: 'ava@example.com',
      picture: 'https://example.com/a.jpg',
    });

    expect(takeOnboardingAuthHandoff()).toEqual({
      method: 'google',
      name: 'Ava Martinez',
      email: 'ava@example.com',
      picture: 'https://example.com/a.jpg',
    });
    expect(takeOnboardingAuthHandoff()).toBeNull();
  });

  it('expires stale handoffs', () => {
    sessionStorage.setItem(
      'pholio.onboardingAuthHandoff',
      JSON.stringify({
        method: 'google',
        name: 'Ava',
        email: null,
        picture: null,
        at: Date.now() - 11 * 60 * 1000,
      }),
    );

    expect(takeOnboardingAuthHandoff()).toBeNull();
    expect(sessionStorage.getItem('pholio.onboardingAuthHandoff')).toBeNull();
  });
});
