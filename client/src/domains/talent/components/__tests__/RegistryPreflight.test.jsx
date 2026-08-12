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

const result = {
  available: true,
  sourceCheckedOn: 'August 9, 2026',
  shotCoverage: { selected: 4, published: 6 },
  findings: [
    { id: 'missing-profile', outcome: 'missing', label: 'Profile image', guidance: 'Add a side profile.', target: { href: '/dashboard/talent/media', label: 'Open the book' } },
    { id: 'filter', outcome: 'violates', label: 'No filters', guidance: 'Choose an unfiltered image.' },
    { id: 'preferred-height', outcome: 'violates', severity: 'informational', requiresAttention: false, label: 'Preferred height', guidance: 'This is agency guidance.' },
    { id: 'hair', outcome: 'unknown', label: 'Hair pulled back', guidance: 'Confirm this before sending.' },
    { id: 'headshot', outcome: 'satisfied', label: 'Headshot', guidance: 'Included.' },
    { id: 'skip', outcome: 'not_applicable', label: 'Not applicable' },
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
    expect(screen.getByText('Selected images: 4 · Published shot slots: 6')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/score|%|out of/i)).not.toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledWith({ agencyId: 'agency-1', imageIds: ['a', 'b'], seriesId: undefined });
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
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'missing-profile' }));
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
