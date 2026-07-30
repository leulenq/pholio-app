import { beforeEach, describe, expect, it, vi } from 'vitest';

// consumeArrivedFromOnboarding caches its result for the lifetime of the module,
// so each case needs a freshly evaluated copy.
async function loadModule() {
  vi.resetModules();
  return import('../entry-transition.js');
}

describe('onboarding arrival flag', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('suppresses the entry splash once after onboarding hands off', async () => {
    const first = await loadModule();
    first.markArrivedFromOnboarding();

    expect(first.consumeArrivedFromOnboarding()).toBe(true);
    expect(sessionStorage.getItem('pholio:arrived-from-onboarding')).toBeNull();

    const second = await loadModule();
    expect(second.consumeArrivedFromOnboarding()).toBe(false);
  });

  it('returns the same answer however many times it is called', async () => {
    const mod = await loadModule();
    mod.markArrivedFromOnboarding();

    expect(mod.consumeArrivedFromOnboarding()).toBe(true);
    expect(mod.consumeArrivedFromOnboarding()).toBe(true);
  });

  it('reports no arrival when onboarding was not the entry path', async () => {
    const mod = await loadModule();
    expect(mod.consumeArrivedFromOnboarding()).toBe(false);
  });
});
