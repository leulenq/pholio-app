import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MaterialsPage from '../MaterialsPage';

/**
 * The applicant's half of "request materials" (design §5.4, ruling Q8).
 *
 * Three things are load-bearing and therefore pinned here:
 *  - the page renders exactly the fields the organizer asked for, and the
 *    designer-visibility sentence verbatim beside the send;
 *  - sending needs no account, and the claim is offered only afterwards;
 *  - an unusable link lands in one quiet unavailable state.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const THIRD_PARTY_ACCESS =
  'Designers see your name, digitals, height, measurements, availability and walk video through a read-only link. They cannot see your email, phone, socials or date of birth, and they have no Pholio account.';

const READY = {
  valid: true,
  fulfilled: false,
  organizer: { name: 'Fashion Week Brooklyn', logo: null, location: 'Brooklyn, NY' },
  event: {
    name: 'Fashion Week Brooklyn',
    startsOn: '2026-10-04',
    endsOn: '2026-10-10',
    location: 'Brooklyn, NY',
  },
  requestedKeys: ['walk_video_url', 'availability_window', 'core_measurements'],
  fieldDefs: [
    { key: 'walk_video_url', kind: 'url', label: 'Walk video' },
    { key: 'availability_window', kind: 'date_range', label: 'Availability' },
    { key: 'core_measurements', kind: 'text', label: 'Measurements' },
  ],
  dueAt: '2026-09-01T00:00:00.000Z',
  values: {},
  disclosure: { thirdPartyAccess: THIRD_PARTY_ACCESS, version: '2026-09-01' },
};

function mockFetch({ get, post }) {
  const fetchMock = vi.fn(async (_url, options) => {
    const body = String(options?.method || 'GET').toUpperCase() === 'POST' ? post : get;
    return {
      ok: body.ok !== false,
      status: body.ok === false ? 400 : 200,
      statusText: 'OK',
      json: async () => body.payload,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/opencall/materials/tok-123']}>
        <Routes>
          <Route path="/opencall/materials/:token" element={<MaterialsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MaterialsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('asks for exactly what the organizer asked for, and restates the disclosure', async () => {
    mockFetch({ get: { payload: { success: true, data: READY } }, post: {} });
    renderPage();

    expect(await screen.findByLabelText('Walk video')).toBeInTheDocument();
    expect(screen.getByLabelText('Measurements')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Availability' })).toBeInTheDocument();
    expect(screen.getByText(/needs three things/)).toBeInTheDocument();
    // Verbatim — the same sentence the applicant consented to at submit.
    expect(screen.getByText(THIRD_PARTY_ACCESS)).toBeInTheDocument();
    // No account is the point (Q8).
    expect(
      screen.getByText('You do not need a Pholio account to send these.'),
    ).toBeInTheDocument();
  });

  test('sending lands in the done state and only then offers the claim', async () => {
    const user = userEvent.setup();
    mockFetch({
      get: { payload: { success: true, data: READY } },
      post: {
        payload: {
          success: true,
          data: {
            valid: true,
            fulfilled: true,
            organizer: { name: 'Fashion Week Brooklyn' },
            claimUrl: 'https://app.pholio.studio/opencall/claim/abc',
          },
        },
      },
    });
    renderPage();

    await user.type(
      await screen.findByLabelText('Walk video'),
      'https://vimeo.com/1234567',
    );
    await user.type(screen.getByLabelText('From'), '2026-10-04');
    await user.type(screen.getByLabelText('To'), '2026-10-10');
    await user.type(screen.getByLabelText('Measurements'), 'Bust 82, Waist 61, Hips 89');

    // The claim is nowhere to be seen while there is still work to do.
    expect(screen.queryByRole('link', { name: 'Keep my profile' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Send to Fashion Week Brooklyn/ }));

    expect(await screen.findByText('Sent to Fashion Week Brooklyn.')).toBeInTheDocument();
    const claim = screen.getByRole('link', { name: 'Keep my profile' });
    expect(claim).toHaveAttribute('href', 'https://app.pholio.studio/opencall/claim/abc');
  });

  test('an unusable link lands in one quiet unavailable state', async () => {
    mockFetch({
      get: { payload: { success: true, data: { valid: false } } },
      post: {},
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'This link is no longer available' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
  });

  test('a link spent by a send that succeeded says "already sent", never "invalid"', async () => {
    mockFetch({
      get: { payload: { success: true, data: { valid: false, alreadySent: true } } },
      post: {},
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Already sent' })).toBeInTheDocument();
  });

  test('per-field server errors are shown against their field', async () => {
    const user = userEvent.setup();
    mockFetch({
      get: { payload: { success: true, data: READY } },
      post: {
        ok: false,
        payload: {
          success: false,
          error: 'VALIDATION',
          message: 'Some answers could not be sent.',
          errors: [{ key: 'walk_video_url', code: 'invalid_url' }],
        },
      },
    });
    renderPage();

    await user.type(await screen.findByLabelText('Walk video'), 'not a link');
    await user.type(screen.getByLabelText('From'), '2026-10-04');
    await user.type(screen.getByLabelText('To'), '2026-10-10');
    await user.type(screen.getByLabelText('Measurements'), 'Bust 82');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Send to/ }));

    await waitFor(() => {
      expect(
        screen.getByText('That does not look like a link. Paste the full URL.'),
      ).toBeInTheDocument();
    });
  });
});
