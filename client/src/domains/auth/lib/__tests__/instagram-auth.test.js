import { beforeEach, describe, expect, test, vi } from 'vitest';

async function loadInstagramAuth() {
  vi.resetModules();
  return import('../instagram-auth');
}

describe('Instagram authentication availability', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test('caches a confirmed configuration', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { isInstagramAuthConfigured } = await loadInstagramAuth();

    await expect(isInstagramAuthConfigured()).resolves.toBe(true);
    await expect(isInstagramAuthConfigured()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('rechecks a false result instead of caching it for the page lifetime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: true }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { isInstagramAuthConfigured } = await loadInstagramAuth();

    await expect(isInstagramAuthConfigured()).resolves.toBe(false);
    await expect(isInstagramAuthConfigured()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('reports an unavailable API separately from missing configuration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const { isInstagramAuthConfigured } = await loadInstagramAuth();

    await expect(isInstagramAuthConfigured()).rejects.toThrow(
      'Instagram sign-in status is temporarily unavailable.',
    );
  });
});
