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
      categoryKey: 'shots',
      field: 'shot.view',
      matchValue: 'profile',
      sourceLabel: 'close-up profile, hair pulled back',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
      guidance: 'Your current package has no confirmed match for “close-up profile, hair pulled back”.',
    },
    {
      id: 'shots:personality',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'personality',
      sourceLabel: 'personality shot',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
    },
    {
      id: 'shots:full-length',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'full_length',
      sourceLabel: 'full-length',
      outcome: 'satisfied',
      severity: null,
      requiresAttention: false,
      category: 'Shots',
    },
    // Not a shot. Real registry data puts file limits and social handles in
    // this same flat list, and they must not land in the headline that counts
    // shot slots.
    {
      id: 'files:maximum-image-count',
      categoryKey: 'files',
      sourceLabel: 'Image count',
      outcome: 'violates',
      severity: 'attention',
      requiresAttention: true,
      category: 'Files',
    },
    {
      id: 'applicationFields:instagram',
      categoryKey: 'applicationFields',
      sourceLabel: 'Instagram',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Application fields',
    },
    // Verbatim from `guidanceForOutcome` in preflight-service.js. Written to
    // state what Pholio knows rather than to instruct a send, because this
    // surface sends nothing.
    {
      id: 'setWide:hair',
      categoryKey: 'setWide',
      sourceLabel: 'Hair pulled back',
      outcome: 'unknown',
      severity: null,
      requiresAttention: false,
      category: 'Presentation',
      guidance:
        'Pholio cannot verify this from your saved profile or selected images. Confirm it yourself.',
    },
  ],
  summary: { needsAttention: 4, informational: 0, confirm: 0, included: 4 },
  shotCoverage: { selected: 5, published: 6, matched: 4 },
};

const models1Evaluation = {
  seriesId: 'models1-uk:online',
  available: true,
  findings: [
    {
      id: 'shots:full',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'full_length',
      sourceLabel: 'Full length',
      outcome: 'satisfied',
      requiresAttention: false,
      category: 'Shots',
    },
    {
      id: 'shots:prof',
      categoryKey: 'shots',
      field: 'shot.view',
      matchValue: 'profile',
      sourceLabel: 'Profile shot',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
    },
  ],
  summary: { needsAttention: 0, informational: 0, confirm: 0, included: 3 },
  shotCoverage: { selected: 5, published: 3, matched: 3 },
};

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

    await screen.findByRole('table');
    await waitFor(() => {
      expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
        seriesIds: ['elite-models-na:online-general', 'models1-uk:online'],
        imageIds: ['active-image'],
      });
    });
  });

  describe('the matrix', () => {
    test('aligns the same shot across agencies by taxonomy value, not by label', async () => {
      renderPage();
      await screen.findByRole('table');

      // Elite calls it "close-up profile, hair pulled back"; Models 1 calls the
      // same `shot.view: profile` "Profile shot". One row, not two — matching on
      // the label would have produced two.
      const rows = screen.getAllByRole('row').slice(1);
      const headings = rows.map((row) => within(row).getAllByRole('rowheader')[0]?.textContent);
      expect(headings.filter((h) => /profile/i.test(h || ''))).toHaveLength(1);
    });

    test('leads with the shot that unlocks the most agencies', async () => {
      renderPage();
      await screen.findByRole('table');

      // Both agencies want a profile and neither is covered → unlocks 2, the
      // highest, so it sorts to the top and becomes the recommendation.
      expect(
        await screen.findByText(/would satisfy 2 more agencies/i),
      ).toBeInTheDocument();
      const firstRow = screen.getAllByRole('row')[1];
      expect(within(firstRow).getAllByRole('rowheader')[0].textContent).toMatch(/profile/i);
    });

    test('does not count a shot an agency never asked for', async () => {
      renderPage();
      await screen.findByRole('table');

      // Only Elite publishes a personality shot, so it can unlock exactly one.
      const row = screen
        .getAllByRole('row')
        .find((r) => /personality/i.test(within(r).queryAllByRole('rowheader')[0]?.textContent || ''));
      expect(within(row).getByText('1')).toBeInTheDocument();
    });

    test('marks a covered shot as covered rather than as leverage', async () => {
      renderPage();
      await screen.findByRole('table');

      const row = screen
        .getAllByRole('row')
        .find((r) => /full[- ]length/i.test(within(r).queryAllByRole('rowheader')[0]?.textContent || ''));
      expect(within(row).getByText('covered')).toBeInTheDocument();
    });

    test('describes every cell for a screen reader', async () => {
      renderPage();
      await screen.findByRole('table');

      expect(
        screen.getByText('Elite Models: full-length covered'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Models 1: .*still needed/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Models 1: does not ask for personality shot/),
      ).toBeInTheDocument();
    });

    test('the grid is the navigation — a column head opens that agency', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: /models 1/i }));
      expect(
        await screen.findByRole('heading', { name: 'Models 1', level: 2 }),
      ).toBeInTheDocument();
    });
  });

  describe('the opened agency', () => {
    test('opens on an agency that actually published a shot list', async () => {
      renderPage();
      // Not simply the first route — one that can demonstrate the check.
      expect(
        await screen.findByRole('heading', { name: 'Elite Models', level: 2 }),
      ).toBeInTheDocument();
      expect(await screen.findByText('4')).toBeInTheDocument();
    });

    test('names the shots still missing, and counts the rest separately', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      // "Still needed" is both this inline label and, once the check is open, a
      // group heading — so the query names which one it means.
      const missing = await screen.findByText('Still needed', { selector: 'strong' });
      const line = missing.closest('p');
      expect(line).toHaveTextContent('close-up profile, hair pulled back');
      // The figure counts shot slots, so the line beneath it names shots — a
      // file limit and a social handle would be a different question.
      expect(line).not.toHaveTextContent('Image count');
      expect(line).toHaveTextContent('2 other published requirements to check');
    });

    test('marks deliverability inline rather than splitting the market', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });
      expect(screen.getByText('Applies on their own site')).toBeInTheDocument();
    });

    test('never frames a reference agency as somewhere a package is sent', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      expect(screen.queryByText(/prepare this package/i)).not.toBeInTheDocument();

      // Open the full check so the server-supplied guidance is actually on the
      // page — asserting against a collapsed panel would pass for the wrong reason.
      await user.click(screen.getByRole('button', { name: /see the full check/i }));
      expect(screen.getByText(/Confirm it yourself\./)).toBeInTheDocument();
      expect(screen.queryByText(/before sending/i)).not.toBeInTheDocument();
    });

    test('shows the full check for an agency that cannot receive a Pholio application', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      await user.click(screen.getByRole('button', { name: /see the full check/i }));
      expect(screen.getByRole('heading', { name: /Still needed/, level: 4 })).toBeInTheDocument();
      expect(
        screen.getByText('close-up profile, hair pulled back', { selector: 'p' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Already covered/, level: 4 })).toBeInTheDocument();
    });

    test('carries provenance and non-affiliation, without needing to be opened', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      // A calendar date on the wire, read back to the talent — not the raw value.
      expect(
        screen.getByText(/Requirements as published by Elite Models, checked August 9, 2026\./),
      ).toBeInTheDocument();
      expect(screen.queryByText(/2026-08-09/)).not.toBeInTheDocument();
      expect(
        screen.getByText(/Pholio is not affiliated with Elite Models\./),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View their page' })).toHaveAttribute(
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
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();

      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      await user.click(screen.getByRole('button', { name: /download the elite models-ready set/i }));

      await waitFor(() => {
        expect(talentApi.exportSpecRegistrySet).toHaveBeenCalledWith({
          seriesId: 'elite-models-na:online-general',
          imageIds: ['active-image'],
        });
      });
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(
        await screen.findByText('4 files downloaded as elite-models-digitals.zip.'),
      ).toBeInTheDocument();
    });

    test('reports an export that could not be built instead of failing silently', async () => {
      talentApi.exportSpecRegistrySet.mockRejectedValue(
        new Error('None of your current images match a shot this agency publishes.'),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      await user.click(screen.getByRole('button', { name: /download the elite models-ready set/i }));

      expect(
        await screen.findByText(
          'None of your current images match a shot this agency publishes.',
        ),
      ).toBeInTheDocument();
    });

    test('records the outbound click without standing between talent and agency', async () => {
      talentApi.recordSpecRegistryOutboundClick.mockResolvedValue({ recorded: true });
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      const link = screen.getByRole('link', { name: /apply on their site/i });
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
      await screen.findByRole('heading', { name: 'Elite Models', level: 2 });

      await user.click(screen.getByRole('link', { name: /apply on their site/i }));
      await waitFor(() => expect(talentApi.recordSpecRegistryOutboundClick).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: /see the full check/i })).toBeEnabled();
    });
  });

  describe('page states', () => {
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

    test('shows the empty state without checking or drawing a grid', async () => {
      talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
      renderPage();

      expect(
        await screen.findByText('No agency requirements are catalogued yet.'),
      ).toBeInTheDocument();
      expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});
