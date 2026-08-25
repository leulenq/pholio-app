import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../api/talent', () => ({
  talentApi: { listCallWindows: vi.fn() },
}));

import OpenCallsCard from '../OpenCallsCard';
import { talentApi } from '../../../api/talent';

const windows = [
  {
    id: 'cw-muse',
    displayName: 'Muse Management',
    label: 'Walk-in open call',
    weekday: 4, // Thursday
    startMinute: 900,
    endMinute: 960,
    timezone: 'America/New_York',
    location: '35 W 36th St',
  },
  {
    id: 'cw-que',
    displayName: 'Que Management',
    label: 'Open call',
    weekday: 4,
    startMinute: 600,
    endMinute: 660,
    timezone: 'America/New_York',
    location: null,
  },
  {
    id: 'cw-msa',
    displayName: 'MSA Models',
    label: 'Walk-in',
    weekday: 2, // Tuesday
    startMinute: null,
    endMinute: null,
    timezone: 'America/New_York',
    location: null,
  },
  {
    id: 'cw-extra',
    displayName: 'Fourth House',
    label: 'Open call',
    weekday: 5,
    startMinute: 720,
    endMinute: 780,
    timezone: 'America/New_York',
    location: null,
  },
];

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OpenCallsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('the open calls card', () => {
  test('lists the windows as plain rows with the agency, the time and the label', async () => {
    talentApi.listCallWindows.mockResolvedValue([windows[0]]);
    renderCard();

    expect(await screen.findByText('Muse Management')).toBeInTheDocument();
    expect(screen.getByText('Thu · 3–4 PM ET')).toBeInTheDocument();
    expect(screen.getByText('Walk-in open call')).toBeInTheDocument();
  });

  test('shows at most three, ordered by whichever comes round next', async () => {
    // A Monday: Tuesday is nearest, then Thursday (earlier hour first), then Friday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T15:00:00Z'));
    talentApi.listCallWindows.mockResolvedValue(windows);
    renderCard();

    await vi.waitFor(() => expect(document.querySelectorAll('.ov-calls-row').length).toBe(3));
    expect([...document.querySelectorAll('.ov-calls-name')].map((n) => n.textContent)).toEqual([
      'MSA Models',
      'Que Management',
      'Muse Management',
    ]);
    vi.useRealTimers();
  });

  test('names a day without inventing an hour when the time is unpublished', async () => {
    talentApi.listCallWindows.mockResolvedValue([windows[2]]);
    renderCard();

    expect(await screen.findByText('MSA Models')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
  });

  test('links out to the full list without a counter or a status dot', async () => {
    talentApi.listCallWindows.mockResolvedValue([windows[0]]);
    renderCard();

    const link = await screen.findByRole('link', { name: /all open calls/i });
    // This asserted /dashboard/talent/applications until 2026-08-25 — the
    // tracker, which has never queried a call window. The link promised a
    // calendar and delivered a different page, and this test held that in
    // place: the destination was pinned, so nothing failed when it was wrong.
    // A link assertion is only worth having if it names a page that answers
    // the link's own words.
    expect(link).toHaveAttribute('href', '/dashboard/talent/open-calls');
  });

  test('renders nothing at all when Pholio holds no windows', async () => {
    talentApi.listCallWindows.mockResolvedValue([]);
    const { container } = renderCard();

    await waitFor(() => expect(talentApi.listCallWindows).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  test('stays silent rather than showing an error when the feed is unavailable', async () => {
    talentApi.listCallWindows.mockRejectedValue(new Error('offline'));
    const { container } = renderCard();

    await waitFor(() => expect(talentApi.listCallWindows).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
