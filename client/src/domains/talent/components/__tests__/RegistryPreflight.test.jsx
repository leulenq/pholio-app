import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import RegistryPreflight from '../RegistryPreflight';

function renderPreflight(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RegistryPreflight agencyId="agency-1" agencyName="Elite Models" {...props} />
    </QueryClientProvider>,
  );
}

/*
 * Mirrors what `evaluationDto` actually sends (see
 * `src/domains/spec-registry/preflight-service.js`). The previous fixture used
 * a `label` field and a pre-formatted `sourceCheckedOn`, neither of which the
 * server produces — so the suite passed against a contract that did not exist
 * and could not catch the component drifting away from the real one.
 */
const result = {
  available: true,
  sourceCheckedOn: '2026-08-09',
  summary: { needsAttention: 2, informational: 1, confirm: 1, included: 1 },
  shotCoverage: { selected: 4, published: 6, matched: 3 },
  findings: [
    { id: 'shots:missing-profile', category: 'Shots', outcome: 'missing', severity: 'attention', requiresAttention: true, sourceLabel: 'Profile image', guidance: 'Add a side profile.', target: { href: '/dashboard/talent/media', label: 'Open the book' } },
    { id: 'files:filter', category: 'Files', outcome: 'violates', severity: 'attention', requiresAttention: true, sourceLabel: 'No filters', guidance: 'Choose an unfiltered image.' },
    { id: 'setWide:preferred-height', category: 'Presentation', outcome: 'violates', severity: 'informational', requiresAttention: false, sourceLabel: 'Preferred height', guidance: 'This is agency guidance.' },
    { id: 'shots:hair', category: 'Shots', outcome: 'unknown', severity: null, requiresAttention: false, sourceLabel: 'Hair pulled back', guidance: 'Confirm this before sending.' },
    { id: 'shots:headshot', category: 'Shots', outcome: 'satisfied', severity: null, requiresAttention: false, sourceLabel: 'Headshot', guidance: 'Included.' },
    { id: 'shots:skip', category: 'Shots', outcome: 'not_applicable', severity: null, requiresAttention: false, sourceLabel: 'Not applicable' },
  ],
};

describe('RegistryPreflight', () => {
  test('groups advisory findings without a score, badge, or progress control', async () => {
    const queryFn = vi.fn().mockResolvedValue(result);
    renderPreflight({ imageIds: ['b', 'a'], queryFn });

    await screen.findByRole('heading', { name: 'Needs attention' });

    expect(screen.getByRole('heading', { name: 'Prepare this package for Elite Models' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm before sending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Published guidance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Included in this package' })).toBeInTheDocument();
    expect(screen.getByText('Profile image')).toBeInTheDocument();
    expect(screen.getByText('No filters')).toBeInTheDocument();
    expect(screen.getByText('Preferred height')).toBeInTheDocument();
    expect(screen.getByText('Hair pulled back')).toBeInTheDocument();
    expect(screen.getByText('Headshot')).toBeInTheDocument();
    expect(screen.queryByText('Not applicable')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/score|%|out of/i)).not.toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledWith({ agencyId: 'agency-1', imageIds: ['a', 'b'], seriesId: undefined });
  });

  test('reports the server summary and the full shot coverage', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByRole('heading', { name: 'Needs attention' });
    expect(screen.getByText('2 need attention · 1 to confirm · 1 already included')).toBeInTheDocument();

    // `matched` says how much of the talent's own package landed in a
    // published slot; the previous reader dropped it entirely.
    const coverage = ['Selected', 'Matched to a slot', 'Published slots'];
    for (const label of coverage) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('renders each finding under the category the server assigned it', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByText('Profile image');
    expect(screen.getAllByText('Shots').length).toBeGreaterThan(0);
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Presentation')).toBeInTheDocument();
  });

  test('formats the source date rather than printing the raw calendar value', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    expect(
      await screen.findByText(/checked August 9, 2026\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-09/)).not.toBeInTheDocument();
  });

  test('shows a skeleton while the preflight is loading', () => {
    renderPreflight({ queryFn: () => new Promise(() => {}) });

    expect(screen.getByRole('status')).toHaveTextContent('Checking published requirements…');
  });

  test('lets the user retry after an advisory request fails', async () => {
    const queryFn = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ available: true, findings: [] });
    const user = userEvent.setup();
    renderPreflight({ queryFn });

    await screen.findByRole('alert', {}, { timeout: 3_000 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('No published requirements need action for this package.')).toBeInTheDocument();
  });

  test('renders the unavailability fallback and agency source link', async () => {
    renderPreflight({
      sourceUrl: 'https://example.com/apply',
      queryFn: () => Promise.resolve({ available: false }),
    });

    expect(await screen.findByText(/does not yet have published requirements/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View agency source' })).toHaveAttribute(
      'href',
      'https://example.com/apply',
    );
    expect(screen.getByRole('link', { name: 'View agency source' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  test('renders a controlled batched result without running the query function', async () => {
    const queryFn = vi.fn();
    renderPreflight({ result, isLoading: false, queryFn });

    expect(await screen.findByText('Profile image')).toBeInTheDocument();
    expect(queryFn).not.toHaveBeenCalled();
  });

  test('delegates retry to a controlled parent', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderPreflight({ error: new Error('offline'), isLoading: false, onRetry });

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('keeps advisory findings actionable without disabling the surrounding flow', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderPreflight({ queryFn: () => Promise.resolve(result), onAction });

    const action = await screen.findByRole('link', { name: 'Open the book' });
    expect(action).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(action);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'shots:missing-profile' }));
  });

  test('unwraps the single result returned by the batched preflight endpoint', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      available: true,
      results: [result],
    });
    renderPreflight({ queryFn });

    expect(await screen.findByText('Profile image')).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  test('lets talent choose the exact route when an agency has multiple published routes', async () => {
    const onRevisionChange = vi.fn();
    const user = userEvent.setup();
    const first = {
      ...result,
      revisionId: 'elite-models-na:online-general@1',
      agencyName: 'Elite Models',
      marketLabel: 'North America',
    };
    const second = {
      ...result,
      revisionId: 'elite-japan-tokyo:online@1',
      agencyName: 'Elite Models',
      marketLabel: 'Tokyo',
    };
    renderPreflight({
      queryFn: () => Promise.resolve({
        available: true,
        resolution: 'choice_required',
        results: [first, second],
      }),
      onRevisionChange,
    });

    const select = await screen.findByRole('combobox', { name: 'Submission route' });
    expect(select).toHaveValue(first.revisionId);
    await waitFor(() => expect(onRevisionChange).toHaveBeenCalledWith(first.revisionId));

    await user.selectOptions(select, second.revisionId);
    expect(select).toHaveValue(second.revisionId);
    expect(onRevisionChange).toHaveBeenLastCalledWith(second.revisionId);
    expect(screen.getByRole('option', { name: /Tokyo/ })).toBeInTheDocument();
  });
});
