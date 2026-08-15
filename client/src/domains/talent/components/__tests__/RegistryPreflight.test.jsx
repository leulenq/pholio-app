import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

/** The geometric state of the mark carrying a given description. */
function markState(description) {
  return screen
    .getByTitle(description)
    .closest('[data-mark-state]')
    ?.getAttribute('data-mark-state');
}

/*
 * Mirrors what `evaluationDto` actually sends (see
 * `src/domains/spec-registry/preflight-service.js`) — including `categoryKey`,
 * the machine-readable bucket the coverage schematic reads. `category` is only
 * its display name, so a fixture carrying just that would let the schematic
 * silently render nothing while the suite stayed green.
 */
const result = {
  available: true,
  sourceCheckedOn: '2026-08-09',
  summary: { needsAttention: 2, informational: 1, confirm: 1, included: 1 },
  shotCoverage: { selected: 4, published: 6, matched: 3 },
  findings: [
    { id: 'shots:missing-profile', categoryKey: 'shots', category: 'Shots', outcome: 'missing', severity: 'attention', requiresAttention: true, sourceLabel: 'Profile image', guidance: 'Add a side profile.', target: { href: '/dashboard/talent/media', label: 'Open the book' } },
    { id: 'files:filter', categoryKey: 'files', category: 'Files', outcome: 'violates', severity: 'attention', requiresAttention: true, sourceLabel: 'No filters', guidance: 'Choose an unfiltered image.' },
    { id: 'setWide:preferred-height', categoryKey: 'setWide', category: 'Presentation', outcome: 'violates', severity: 'informational', requiresAttention: false, sourceLabel: 'Preferred height', guidance: 'This is agency guidance.' },
    { id: 'shots:hair', categoryKey: 'shots', category: 'Shots', outcome: 'unknown', severity: null, requiresAttention: false, sourceLabel: 'Hair pulled back', guidance: 'Confirm this before sending.' },
    { id: 'shots:headshot', categoryKey: 'shots', category: 'Shots', outcome: 'satisfied', severity: null, requiresAttention: false, sourceLabel: 'Headshot', guidance: 'Included.' },
    { id: 'shots:skip', categoryKey: 'shots', category: 'Shots', outcome: 'not_applicable', severity: null, requiresAttention: false, sourceLabel: 'Not applicable' },
  ],
};

describe('RegistryPreflight', () => {
  test('reads as a check against the agency, not as a score', async () => {
    const queryFn = vi.fn().mockResolvedValue(result);
    renderPreflight({ imageIds: ['b', 'a'], queryFn });

    expect(await screen.findByText('3 of 6 shots matched')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Checked against Elite Models’ published route',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/score|%|out of/i)).not.toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledWith({
      agencyId: 'agency-1',
      imageIds: ['a', 'b'],
      seriesId: undefined,
    });
  });

  test('draws the published shots as the same three marks the ledger uses', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByRole('list', { name: 'Published shots' });
    expect(markState('Headshot — in your set')).toBe('covered');
    expect(markState('Profile image — still needed')).toBe('wanted');
    expect(markState('Hair pulled back — not asked for')).toBe('not_asked');
    // A requirement that does not apply is noise, not a slot.
    expect(screen.queryByTitle(/Not applicable/)).not.toBeInTheDocument();
  });

  test('keeps what needs attention open and everything else behind one toggle', async () => {
    const user = userEvent.setup();
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByText('Profile image');
    expect(screen.getByText('No filters')).toBeInTheDocument();
    expect(screen.queryByText('Hair pulled back')).not.toBeInTheDocument();
    expect(screen.queryByText('Preferred height')).not.toBeInTheDocument();
    expect(screen.queryByText('Headshot')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Details \(3\)/ }));

    expect(await screen.findByText('Hair pulled back')).toBeInTheDocument();
    expect(screen.getByText('Preferred height')).toBeInTheDocument();
    expect(screen.getByText('Headshot')).toBeInTheDocument();
    const groups = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(groups).toEqual(['Confirm · 1', 'Guidance · 1', 'Included · 1']);
  });

  test('formats the source date rather than printing the raw calendar value', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    expect(await screen.findByText(/checked August 9, 2026\./)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-09/)).not.toBeInTheDocument();
  });

  test('says it is checking while the preflight is in flight', () => {
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
    expect(
      await screen.findByText('No published requirement needs action for this package.'),
    ).toBeInTheDocument();
  });

  test('never blocks the send when the check itself cannot load', async () => {
    renderPreflight({ queryFn: () => Promise.reject(new Error('offline')) });

    const alert = await screen.findByRole('alert', {}, { timeout: 3_000 });
    expect(alert).toHaveTextContent(
      'Requirements couldn’t load. You can continue — the agency’s site is the source of truth.',
    );
  });

  test('sends an unavailable route to the requirements page and the agency', async () => {
    renderPreflight({
      sourceUrl: 'https://example.com/apply',
      queryFn: () => Promise.resolve({ available: false }),
    });

    expect(
      await screen.findByText(/no published requirements for Elite Models’ selected route/i),
    ).toBeInTheDocument();
    // No heading claiming a check that never happened.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agency requirements' })).toHaveAttribute(
      'href',
      '/dashboard/talent/applications/requirements',
    );
    const source = screen.getByRole('link', { name: 'Their submission page' });
    expect(source).toHaveAttribute('href', 'https://example.com/apply');
    expect(source).toHaveAttribute('target', '_blank');
  });

  test('points a multi-route agency at the page that can resolve the choice', async () => {
    renderPreflight({
      queryFn: () => Promise.resolve({ available: false, resolution: 'choice_required' }),
    });

    expect(
      await screen.findByText(/Elite Models publishes more than one route/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agency requirements' })).toBeInTheDocument();
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
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'shots:missing-profile' }),
    );
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

    const select = await screen.findByRole('combobox');
    expect(select).toHaveTextContent('North America');
    await waitFor(() => expect(onRevisionChange).toHaveBeenCalledWith(first.revisionId));

    await user.click(select);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: /Tokyo/ }));

    expect(onRevisionChange).toHaveBeenLastCalledWith(second.revisionId);
    await waitFor(() => expect(select).toHaveTextContent('Tokyo'));
  });
});
