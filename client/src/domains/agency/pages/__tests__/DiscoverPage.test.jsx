/**
 * DiscoverPage — the semantic layer's presentation
 * (tasks/discover-semantic-2026-09.md §3.3, §3.4).
 *
 * Two contracts the server now depends on the page keeping:
 *
 *   a. every result may carry `why` — the talent's own sentence or their
 *      book's description — and it takes the "Mentions …" slot when present,
 *      falling back to mentions when it is not;
 *   b. `discover_v2.look_only` means no requirement was applied, so the count
 *      line reads "Closest to your brief" and no group is named.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import DiscoverPage from '../DiscoverPage';
import { getDiscoverableTalent, getAgencyProfile } from '../../api/agency';

// The page's atmospheric layer is a WebGL shader; jsdom has no GL context.
vi.mock('../Grainient', () => ({ default: () => null }));

vi.mock('../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDiscoverableTalent: vi.fn(),
    getAgencyProfile: vi.fn(),
    inviteTalent: vi.fn(),
  };
});

const profile = (over = {}) => ({
  id: over.id || 'p-1',
  first_name: 'Ines',
  last_name: 'Moreau',
  city: 'Paris',
  height_cm: 178,
  gender: 'female',
  lanes: ['editorial'],
  images: [],
  bio_curated: null,
  facts: ['Women', '5′ 10″'],
  mentions: [],
  notes: [],
  heritage: [],
  why: null,
  ...over,
});

const response = ({ results, lookOnly = false, match = null, partial = 0 }) => ({
  profiles: results,
  pagination: { page: 1, limit: 30, total: results.length, totalPages: 1, hasNext: false, hasPrev: false },
  discover_v2: {
    engine: 'match',
    query: 'girl next door commercial warmth',
    role: 0,
    roles: [],
    filters: [],
    notes: [],
    groups: [
      { kind: 'match', total: match ?? results.length, results },
      { kind: 'partial', total: partial, results: [] },
    ],
    pool: { eligible: 12, match: match ?? results.length, partial, shown: results.length },
    look_only: lookOnly,
    semantic: true,
    query_log_id: null,
  },
});

function renderPage(query = 'girl next door commercial warmth') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/agency/discover?q=${encodeURIComponent(query)}`]}>
        <DiscoverPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DiscoverPage — the why line', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAgencyProfile.mockResolvedValue({ agency_name: 'Maison' });
  });

  test('renders the server-written why in place of the mentions line', async () => {
    const why = 'From their bio: “Fresh-faced, natural and approachable.”';
    getDiscoverableTalent.mockResolvedValue(response({
      results: [profile({ why, mentions: ['approachable'] })],
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Ines Moreau')).toBeInTheDocument());

    const line = screen.getByText(why);
    expect(line).toBeInTheDocument();
    // The whole sentence stays reachable even when the two-line clamp cuts it.
    expect(line).toHaveAttribute('title', why);
    // The slot is one line, not two: mentions do not also print.
    expect(screen.queryByText(/^Mentions /)).not.toBeInTheDocument();
  });

  test('falls back to the mentions line when the server sends no why', async () => {
    getDiscoverableTalent.mockResolvedValue(response({
      results: [profile({ why: null, mentions: ['runway', 'campaign'] })],
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Ines Moreau')).toBeInTheDocument());
    expect(screen.getByText('Mentions runway, campaign')).toBeInTheDocument();
  });

  test('a blank why is treated as absent', async () => {
    getDiscoverableTalent.mockResolvedValue(response({
      results: [profile({ why: '   ', mentions: ['runway'] })],
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Ines Moreau')).toBeInTheDocument());
    expect(screen.getByText('Mentions runway')).toBeInTheDocument();
  });
});

describe('DiscoverPage — a look-only brief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAgencyProfile.mockResolvedValue({ agency_name: 'Maison' });
  });

  test('the count line reads "Closest to your brief" and no group is named', async () => {
    getDiscoverableTalent.mockResolvedValue(response({
      results: [profile({ why: 'From their book: daylight three-quarter portrait, soft natural light' })],
      lookOnly: true,
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Ines Moreau')).toBeInTheDocument());

    expect(screen.getByText('Closest to your brief')).toBeInTheDocument();
    expect(screen.queryByText(/\bmatches\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial matches/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Closest first/)).not.toBeInTheDocument();
    // The brief still follows the count, in italic.
    expect(screen.getByText(/for “girl next door commercial warmth”/)).toBeInTheDocument();
  });

  test('a brief with requirements still counts its matches', async () => {
    getDiscoverableTalent.mockResolvedValue(response({
      results: [profile(), profile({ id: 'p-2', first_name: 'Lena' })],
      lookOnly: false,
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Ines Moreau')).toBeInTheDocument());
    expect(screen.getByText('2 matches')).toBeInTheDocument();
    expect(screen.queryByText('Closest to your brief')).not.toBeInTheDocument();
  });
});
