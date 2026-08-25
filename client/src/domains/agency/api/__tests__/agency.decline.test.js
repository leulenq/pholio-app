import { describe, test, expect, vi, beforeEach } from 'vitest';
import { declineApplication, bulkDeclineApplications } from '../agency';

/**
 * The client used to send a `reason` field the decline routes never read
 * (they read `decline_reason`), so no client surface could actually reach the
 * templated vocabulary. These pin the wire shape so that regresses loudly.
 */
describe('declineApplication', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { success: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  test('sends the chosen reason as decline_reason', async () => {
    await declineApplication('app-1', { declineReason: 'board_full' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, config] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/agency/applications/app-1/decline');
    expect(JSON.parse(config.body)).toEqual({ decline_reason: 'board_full' });
  });

  test('declining without a reason still sends a valid request (decline_reason: null)', async () => {
    await declineApplication('app-1');

    const [, config] = fetchMock.mock.calls[0];
    expect(JSON.parse(config.body)).toEqual({ decline_reason: null });
  });
});

describe('bulkDeclineApplications', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { success: true, count: 2 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  test('applies one reason to the whole batch in a single request', async () => {
    await bulkDeclineApplications(['app-1', 'app-2'], 'materials');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, config] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/agency/applications/bulk-decline');
    expect(JSON.parse(config.body)).toEqual({
      applicationIds: ['app-1', 'app-2'],
      decline_reason: 'materials',
    });
  });

  test('bulk declining without a reason still works', async () => {
    await bulkDeclineApplications(['app-1', 'app-2']);

    const [, config] = fetchMock.mock.calls[0];
    expect(JSON.parse(config.body)).toEqual({
      applicationIds: ['app-1', 'app-2'],
      decline_reason: null,
    });
  });
});
