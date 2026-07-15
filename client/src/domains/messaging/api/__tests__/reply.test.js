import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  bootstrapReplySession,
  issueReplySessionToken,
} from '../reply';
import {
  SAME_ORIGIN_REQUEST_HEADER,
  SAME_ORIGIN_REQUEST_VALUE,
} from '../../../../shared/lib/same-origin-request';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('reply dashboard session exchange', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('uses the emailed token only to issue a separate bootstrap token', async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse(
          { success: true, data: { token: 'short-lived-token' } },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { redirectTo: '/dashboard/talent/applications' },
        }),
      );

    const issued = await issueReplySessionToken('emailed-reply-token');
    const session = await bootstrapReplySession(issued.token);

    expect(fetch.mock.calls[0][0]).toBe(
      '/api/reply/emailed-reply-token/session-token',
    );
    expect(fetch.mock.calls[1][0]).toBe(
      '/api/reply/short-lived-token/session',
    );
    for (const [, options] of fetch.mock.calls) {
      expect(options.method).toBe('POST');
      expect(options.headers[SAME_ORIGIN_REQUEST_HEADER]).toBe(
        SAME_ORIGIN_REQUEST_VALUE,
      );
    }
    expect(session.redirectTo).toBe('/dashboard/talent/applications');
  });

  test('surfaces the structured replay-denial message', async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'REPLY_SESSION_TOKEN_INVALID_OR_USED',
            message: 'This dashboard access token has already been used.',
          },
        },
        410,
      ),
    );

    await expect(bootstrapReplySession('used-token')).rejects.toMatchObject({
      status: 410,
      message: 'This dashboard access token has already been used.',
    });
  });
});
