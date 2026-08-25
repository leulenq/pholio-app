/**
 * The open-calls page.
 *
 * What is worth protecting is not the layout. It is that the page shows the
 * half of the payload the Overview card has no room for — where to go, what to
 * bring, and when Pholio last checked — because those decide whether someone
 * actually turns up, and a walk-in hour without an address is trivia.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../api/talent', () => ({
  talentApi: { listCallWindows: vi.fn() },
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return { ...actual, useReducedMotion: () => true };
});

import { talentApi } from '../../../api/talent';
import OpenCallsPage from '../index';

/* A Wednesday, so today / later-this-week are both reachable in one fixture. */
const NOW = new Date('2026-08-26T14:00:00.000Z');

const MUSE = {
  id: 'w-muse',
  displayName: 'Muse Management',
  label: 'Women, new faces',
  weekday: 3,
  startMinute: 900,
  endMinute: 960,
  timezone: 'America/New_York',
  location: '119 W 24th St, 5th Floor, New York NY',
  instructions: 'Bring digitals and a comp card. No appointment needed.',
  sourceUrl: 'https://example.test/muse',
  verifiedOn: '2026-08-12',
};

const SILENT = {
  id: 'w-silent',
  displayName: 'Silent Models',
  label: null,
  weekday: 5,
  startMinute: 660,
  endMinute: 720,
  timezone: 'America/New_York',
  location: null,
  instructions: null,
  sourceUrl: null,
  verifiedOn: null,
};

function renderPage(rows) {
  talentApi.listCallWindows.mockResolvedValue(rows);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OpenCallsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('open calls page', () => {
  test('shows the fields the Overview card has no room for', async () => {
    renderPage([MUSE]);

    expect(await screen.findByText('Muse Management')).toBeInTheDocument();
    expect(screen.getByText(MUSE.location)).toBeInTheDocument();
    expect(screen.getByText(MUSE.instructions)).toBeInTheDocument();
    expect(screen.getByText(/Verified 2026-08-12/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /their page/i })).toHaveAttribute(
      'href',
      MUSE.sourceUrl,
    );
  });

  test('a window missing those fields renders without empty scaffolding', async () => {
    renderPage([SILENT]);

    expect(await screen.findByText('Silent Models')).toBeInTheDocument();
    // No "Verified" line invented for a row that was never stamped.
    expect(screen.queryByText(/Verified/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /their page/i })).not.toBeInTheDocument();
  });

  test('groups by next occurrence and says Today in words', async () => {
    renderPage([SILENT, MUSE]);

    await screen.findByText('Muse Management');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    // Wednesday is today, so it leads — which is why grouping keys off
    // daysUntilNext rather than the weekday number.
    expect(headings).toEqual(['Today', 'Fridays']);
  });

  test('no windows says what "none" actually means', async () => {
    renderPage([]);

    // Not "there are no open calls" — Pholio lists only what it has verified,
    // and claiming the stronger thing would be a quiet lie.
    const state = await screen.findByText(/no confirmed walk-in hours/i);
    expect(state).toHaveTextContent(/hand-verified/i);
    expect(state).toHaveTextContent(/not about every agency everywhere/i);
  });

  test('the row keeps its name and time together', async () => {
    renderPage([MUSE]);

    const heading = await screen.findByRole('heading', { name: 'Muse Management' });
    expect(within(heading.closest('.oc-row')).getByText(/3–4 PM/)).toBeInTheDocument();
  });
});
