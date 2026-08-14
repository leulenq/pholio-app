import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  },
}));

vi.mock('../../components/RegistryPreflight', () => ({
  default: ({ agencyName, result, isLoading, error, onRetry }) => (
    <div data-testid="registry-preflight">
      <span>{agencyName}</span>
      <span>{isLoading ? 'loading' : result?.seriesId || 'no-result'}</span>
      {error ? <span>error</span> : null}
      <button type="button" onClick={onRetry}>Retry preflight</button>
    </div>
  ),
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
 * Mirrors `routeDto` in `src/domains/spec-registry/preflight-service.js`, which
 * flattens the spec before it leaves the server. The previous fixture invented
 * nested shapes (`scope.organization.name`, `lifecycle.reviewedOn`) and an
 * `organizationName` field that the API has never sent, so these tests were
 * exercising a contract that did not exist.
 */
const routes = [
  {
    seriesId: 'elite-models-na:online-general',
    revisionId: 'elite-models-na:online-general@3',
    agencyName: 'Elite Models',
    organization: { id: 'org-elite', name: 'Elite Models' },
    marketLabel: 'New York',
    sourceUrl: 'https://example.com/elite',
    sourceStatus: 'confirmed',
    sourceCheckedOn: '2026-08-09',
    sourceFreshness: { state: 'checked', nextReviewOn: '2026-11-09' },
  },
  {
    seriesId: 'models1-uk:online',
    revisionId: 'models1-uk:online@1',
    agencyName: 'Models 1',
    organization: { id: 'org-models1', name: 'Models 1' },
    marketLabel: 'London',
    sourceUrl: null,
    sourceStatus: 'confirmed',
    sourceCheckedOn: null,
    sourceFreshness: { state: 'unknown', nextReviewOn: null },
  },
];

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
  });

  test('loads a route directory, batches active image IDs, and selects the first route', async () => {
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes });
    talentApi.preflightSpecRegistry.mockResolvedValue({
      results: [{ seriesId: 'elite-models-na:online-general', available: true }],
    });
    renderPage();

    expect(await screen.findByRole('button', { name: /elite models/i })).toHaveAttribute('aria-current', 'true');
    await waitFor(() => {
      expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
        seriesIds: ['elite-models-na:online-general', 'models1-uk:online'],
        imageIds: ['active-image'],
      });
    });
    // `sourceCheckedOn` is a calendar date on the wire; the page reads it back
    // to the talent rather than printing the stored value.
    expect(screen.getByText('Source checked August 9, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-09/)).not.toBeInTheDocument();
    expect(screen.getByTestId('registry-preflight')).toHaveTextContent('elite-models-na:online-general');
  });

  test('switches the detail view with keyboard-accessible route buttons', async () => {
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes });
    talentApi.preflightSpecRegistry.mockResolvedValue({
      results: [
        { seriesId: 'elite-models-na:online-general', available: true },
        { seriesId: 'models1-uk:online', available: true },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    const models1 = await screen.findByRole('button', { name: /models 1/i });
    await user.click(models1);

    expect(models1).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('registry-preflight')).toHaveTextContent('models1-uk:online');
  });

  test('offers a retry when directory loading fails', async () => {
    talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
    talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
    talentApi.getSpecRegistryRoutes.mockResolvedValueOnce({ routes: [] });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('alert', {}, { timeout: 3_000 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(talentApi.getSpecRegistryRoutes).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('No agency requirement routes are available yet.')).toBeInTheDocument();
  });

  test('shows the empty directory state', async () => {
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
    renderPage();

    expect(await screen.findByText('No agency requirement routes are available yet.')).toBeInTheDocument();
    expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
  });
});
