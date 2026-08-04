import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  markAllMessagesAsRead,
  updateAgencySettings,
} from '../../../domains/agency/api/agency';
import { saveSetupProfile } from '../../../domains/agency/api/setup';
import { sendReplyMessage } from '../../../domains/messaging/api/reply';
import { talentApi } from '../../../domains/talent/api/talent';
import { syncFirebaseSession } from '../pholio-auth/session-api';
import {
  SAME_ORIGIN_REQUEST_HEADER,
  SAME_ORIGIN_REQUEST_VALUE,
} from '../same-origin-request';

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: vi.fn((name) => (
        String(name).toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null
      )),
    },
    json: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
}

describe('protected API clients', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(successfulResponse())));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    ['talent', () => talentApi.updateAvailability('AVAILABLE')],
    ['agency', () => updateAgencySettings({ notifications: true })],
    ['agency messages', () => markAllMessagesAsRead()],
    ['agency setup', () => saveSetupProfile({ name: 'Marilyn Agency' })],
    ['magic-link reply', () => sendReplyMessage('token', 'Following up.')],
    ['Firebase session sync', () => syncFirebaseSession('firebase-id-token')],
  ])('%s writes send the same-origin request header', async (_label, mutate) => {
    await mutate();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    expect(options.headers[SAME_ORIGIN_REQUEST_HEADER]).toBe(SAME_ORIGIN_REQUEST_VALUE);
  });
});
