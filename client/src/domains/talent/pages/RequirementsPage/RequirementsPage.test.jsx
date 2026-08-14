import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import RequirementsPage from './index';

vi.mock('../../../auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/talent', () => ({
  talentApi: {
    getSpecRegistryRoutes: vi.fn(),
    preflightSpecRegistry: vi.fn(),
    exportSpecRegistrySet: vi.fn(),
    recordSpecRegistryOutboundClick: vi.fn(),
  },
}));

import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequirementsPage />
    </QueryClientProvider>,
  );
}

/*
 * Mirrors `routeDto` in `src/domains/spec-registry/preflight-service.js`.
 * `acceptsPholioSubmissions` comes from the agency-routes join, not from
 * `origin` — an agency can be live on Pholio while Pholio researched its spec.
 */
const routes = [
  {
    seriesId: 'elite-models-na:online-general',
    revisionId: 'elite-models-na:online-general@3',
    agencyName: 'Elite Models',
    marketLabel: 'New York',
    sourceUrl: 'https://example.com/elite',
    sourceStatus: 'confirmed',
    sourceCheckedOn: '2026-08-09',
    sourceFreshness: { state: 'checked', nextReviewOn: '2026-11-09' },
    acceptsPholioSubmissions: false,
  },
  {
    seriesId: 'models1-uk:online',
    revisionId: 'models1-uk:online@1',
    agencyName: 'Models 1',
    marketLabel: 'London',
    sourceUrl: null,
    sourceStatus: 'confirmed',
    sourceCheckedOn: null,
    sourceFreshness: { state: 'unknown', nextReviewOn: null },
    acceptsPholioSubmissions: true,
  },
];

/** Mirrors `evaluationDto`: flat findings, `countSummary`, `shotCoverage`. */
const eliteEvaluation = {
  seriesId: 'elite-models-na:online-general',
  available: true,
  findings: [
    {
      id: 'shots:close-up-profile',
      sourceLabel: 'close-up profile, hair pulled back',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
      guidance: 'Your current package has no confirmed match for this.',
    },
    {
      id: 'shots:personality',
      sourceLabel: 'personality shot',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
    },
    {
      id: 'shots:full-length',
      sourceLabel: 'full-length',
      outcome: 'satisfied',
      severity: null,
      requiresAttention: false,
      category: 'Shots',
    },
  ],
  summary: { needsAttention: 2, informational: 0, confirm: 0, included: 4 },
  shotCoverage: { selected: 5, published: 6, matched: 4 },
};

const models1Evaluation = {
  seriesId: 'models1-uk:online',
  available: true,
  findings: [],
  summary: { needsAttention: 0, informational: 0, confirm: 0, included: 3 },
  shotCoverage: { selected: 5, published: 3, matched: 3 },
};

function entryFor(name) {
  return screen.getByRole('heading', { name, level: 3 }).closest('li');
}

describe('RequirementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      profile: { images: [{ id: 'profile-image' }] },
      images: [
        { id: 'active-image', status: 'active', asset_kind: 'image' },
        { id: 'deleted-image', deleted_at: '2026-01-01' },
        { id: 'video-image', asset_kind: 'video' },
      ],
    });
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes });
    talentApi.preflightSpecRegistry.mockResolvedValue({
      results: [eliteEvaluation, models1Evaluation],
    });
  });

  test('checks the talent’s current agency-visible digitals, once, for every route', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    await waitFor(() => {
      expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
        seriesIds: ['elite-models-na:online-general', 'models1-uk:online'],
        imageIds: ['active-image'],
      });
    });
  });

  test('leads with what the agency published and how the set measures up', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await waitFor(() => {
      expect(within(elite).getByText('Your current set covers 4 of 6.')).toBeInTheDocument();
    });
    expect(
      within(elite).getByText('Missing: close-up profile, hair pulled back · personality shot'),
    ).toBeInTheDocument();
  });

  test('never frames a reference agency as somewhere a package is sent', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });

    // "Prepare this package for Elite" is wrong when nothing is sent.
    expect(screen.queryByText(/prepare this package/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/before sending/i)).not.toBeInTheDocument();
  });

  test('keeps one directory and marks each entry inline, rather than splitting the list', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });

    // Both agencies live in a single list, not in two labelled groups.
    const directory = screen
      .getAllByRole('list')
      .find((list) => within(list).queryAllByRole('heading', { level: 3 }).length === 2);
    expect(directory).toBeTruthy();

    expect(
      within(entryFor('Elite Models')).getByText('Applies on their own site.'),
    ).toBeInTheDocument();
    expect(
      within(entryFor('Models 1')).getByText('Accepts applications through Pholio.'),
    ).toBeInTheDocument();
  });

  test('shows the full check for an agency that cannot receive a Pholio application', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await user.click(within(elite).getByRole('button', { name: /see requirements/i }));

    expect(within(elite).getByText('Still needed')).toBeInTheDocument();
    expect(within(elite).getByText('close-up profile, hair pulled back')).toBeInTheDocument();
    expect(within(elite).getByText('Already covered')).toBeInTheDocument();
  });

  test('carries provenance and non-affiliation on every entry', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await user.click(within(elite).getByRole('button', { name: /see requirements/i }));

    // A calendar date on the wire, read back to the talent — not the raw value.
    expect(
      within(elite).getByText(/Requirements as published by Elite Models, checked August 9, 2026\./),
    ).toBeInTheDocument();
    expect(within(elite).queryByText(/2026-08-09/)).not.toBeInTheDocument();
    expect(
      within(elite).getByText(/Pholio is not affiliated with Elite Models\./),
    ).toBeInTheDocument();
    expect(within(elite).getByRole('link', { name: 'View their page' })).toHaveAttribute(
      'href',
      'https://example.com/elite',
    );
  });

  test('downloads a set prepared for the agency, from the same selection it checked', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    talentApi.exportSpecRegistrySet.mockResolvedValue({
      blob,
      filename: 'elite-models-digitals.zip',
      fileCount: 4,
    });
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await user.click(
      within(elite).getByRole('button', { name: /download elite models-ready set/i }),
    );

    await waitFor(() => {
      expect(talentApi.exportSpecRegistrySet).toHaveBeenCalledWith({
        seriesId: 'elite-models-na:online-general',
        imageIds: ['active-image'],
      });
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(
      await within(elite).findByText('4 files downloaded as elite-models-digitals.zip.'),
    ).toBeInTheDocument();
  });

  test('reports an export that could not be built instead of failing silently', async () => {
    talentApi.exportSpecRegistrySet.mockRejectedValue(
      new Error('None of your current images match a shot this agency publishes.'),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await user.click(
      within(elite).getByRole('button', { name: /download elite models-ready set/i }),
    );

    expect(
      await within(elite).findByText(
        'None of your current images match a shot this agency publishes.',
      ),
    ).toBeInTheDocument();
  });

  test('records the outbound click without standing between talent and agency', async () => {
    talentApi.recordSpecRegistryOutboundClick.mockResolvedValue({ recorded: true });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    const link = within(elite).getByRole('link', { name: /apply on their site/i });
    // Straight to the agency, not through a Pholio redirect.
    expect(link).toHaveAttribute('href', 'https://example.com/elite');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await user.click(link);
    expect(talentApi.recordSpecRegistryOutboundClick).toHaveBeenCalledWith(
      'elite-models-na:online-general',
    );
  });

  test('a failed click count never blocks the talent reaching the agency', async () => {
    talentApi.recordSpecRegistryOutboundClick.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Elite Models', level: 3 });
    const elite = entryFor('Elite Models');
    await user.click(within(elite).getByRole('link', { name: /apply on their site/i }));

    await waitFor(() => expect(talentApi.recordSpecRegistryOutboundClick).toHaveBeenCalled());
    expect(within(elite).getByRole('button', { name: /see requirements/i })).toBeEnabled();
  });

  test('offers a retry when the directory itself fails to load', async () => {
    talentApi.getSpecRegistryRoutes.mockReset();
    // The directory query is configured `retry: 1`, so the error only reaches
    // the surface after two failed attempts.
    talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
    talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
    talentApi.getSpecRegistryRoutes.mockResolvedValueOnce({ routes: [] });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('alert', {}, { timeout: 3_000 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('No agency requirements are catalogued yet.'),
    ).toBeInTheDocument();
  });

  test('shows the empty directory state without checking anything', async () => {
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
    renderPage();

    expect(
      await screen.findByText('No agency requirements are catalogued yet.'),
    ).toBeInTheDocument();
    expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
  });
});
