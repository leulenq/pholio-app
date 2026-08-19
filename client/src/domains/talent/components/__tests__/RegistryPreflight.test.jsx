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

/** A slice of `registryTaxonomyLabels()` — the vocabulary the panel speaks in. */
const labels = {
  'shot.frame': {
    label: 'Shot frame',
    values: { headshot: { label: 'Headshot' }, close_up: { label: 'Close-up' } },
  },
  'shot.view': { label: 'Shot view', values: { profile: { label: 'Profile' } } },
  'appearance.hair_state': {
    label: 'Hair state',
    values: { pulled_back: { label: 'Pulled back' } },
  },
  'appearance.makeup_level': { label: 'Makeup level', values: {} },
  'file.size_bytes': { label: 'File size', values: {} },
  'applicant.age_years': { label: 'Age', values: {} },
  'contact.email': { label: 'Email', values: {} },
  'files.per_file_size': { label: 'Per-file size limit', values: {} },
};

function finding(overrides) {
  return {
    categoryKey: 'shots',
    category: 'Shots',
    outcome: 'satisfied',
    modality: 'requested',
    severity: null,
    requiresAttention: false,
    field: null,
    matchValue: null,
    matchValues: [],
    matchKey: null,
    guidance: null,
    target: null,
    assignments: [],
    factStates: [],
    ...overrides,
  };
}

/*
 * Mirrors what `evaluationDto` actually sends (see
 * `src/domains/spec-registry/preflight-service.js`) — including `slotKey`,
 * `matchValues` and the top-level `labels` map. A fixture carrying only
 * `sourceLabel` would let the panel render an agency's raw form wording while
 * the suite stayed green.
 */
const result = {
  available: true,
  sourceCheckedOn: '2026-08-09',
  labels,
  summary: { needsAttention: 2, informational: 1, confirm: 1, included: 1 },
  shotCoverage: { selected: 4, published: 6, matched: 3 },
  findings: [
    finding({
      id: 'shots:missing-profile',
      slotKey: 'elite#shots:missing-profile',
      field: 'shot.view',
      matchValue: 'profile',
      matchValues: [{ field: 'shot.view', operator: 'equals', value: 'profile' }],
      matchKey: 'shot.view:equals:profile',
      // IMG's form calls it this; it is not the name of a picture.
      sourceLabel: 'upload profile',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      target: { href: '/dashboard/talent/media', label: 'Open the book' },
    }),
    finding({
      id: 'shots:headshot',
      slotKey: 'elite#shots:headshot',
      field: 'shot.frame',
      matchValue: 'headshot',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'headshot' }],
      matchKey: 'shot.frame:equals:headshot',
      sourceLabel: 'Headshot *',
    }),
    finding({
      id: 'shots:hair',
      slotKey: 'elite#shots:hair',
      matchValues: [
        { field: 'shot.frame', operator: 'equals', value: 'close_up' },
        { field: 'appearance.hair_state', operator: 'equals', value: 'pulled_back' },
      ],
      matchKey: 'appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up',
      sourceLabel: 'Close up (hair pulled back)',
      outcome: 'unknown',
    }),
    finding({
      id: 'shots:skip',
      slotKey: 'elite#shots:skip',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'close_up' }],
      sourceLabel: 'Not applicable',
      outcome: 'not_applicable',
    }),
    finding({
      id: 'setWide:no-makeup',
      slotKey: 'elite#setWide:no-makeup',
      categoryKey: 'setWide',
      category: 'Presentation',
      field: 'appearance.makeup_level',
      modality: 'prohibited',
      sourceLabel: 'Wear no make-up',
      outcome: 'missing',
    }),
    finding({
      id: 'files:size',
      slotKey: 'elite#files:size',
      categoryKey: 'files',
      category: 'Files',
      field: 'file.size_bytes',
      modality: 'required',
      sourceLabel: 'Max. 5mb each',
      outcome: 'unknown',
    }),
    finding({
      id: 'eligibility:age',
      slotKey: 'elite#eligibility:age',
      categoryKey: 'eligibility',
      category: 'Eligibility',
      field: 'applicant.age_years',
      sourceLabel: 'ages 15 and up',
      outcome: 'missing',
      factStates: [{ field: 'applicant.age_years', state: 'missing', source: 'profile' }],
      target: { href: '/dashboard/talent/profile', label: 'Open profile' },
    }),
    finding({
      id: 'applicationFields:email',
      slotKey: 'elite#applicationFields:email',
      categoryKey: 'applicationFields',
      category: 'Application fields',
      field: 'contact.email',
      sourceLabel: 'E-mail',
      outcome: 'unknown',
    }),
    finding({
      id: 'sourceUnknown:files.per_file_size:1',
      slotKey: 'elite#sourceUnknown:files.per_file_size:1',
      categoryKey: 'sourceUnknown',
      category: 'Not published',
      field: 'files.per_file_size',
      sourceLabel: 'Per File Size',
      outcome: 'unknown',
    }),
  ],
};

describe('RegistryPreflight', () => {
  test('reads as a check against the agency, not as a score', async () => {
    const queryFn = vi.fn().mockResolvedValue(result);
    renderPreflight({ imageIds: ['b', 'a'], queryFn });

    expect(await screen.findByText('1 of 3 shots in your set')).toBeInTheDocument();
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

  test('speaks the same three words the requirements page speaks (ruling R-D)', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByRole('list', { name: 'Published shots' });
    expect(markState('Headshot — in your set')).toBe('in_set');
    expect(markState('Profile shot — still needed')).toBe('needed');
    // A published slot Pholio can't verify is still asked for — it reads as
    // "still needed", never "not asked for" (live-verification correction).
    expect(markState('Close-up, hair pulled back — still needed')).toBe('needed');
    // A requirement that does not apply is noise, not a slot.
    expect(screen.queryByTitle(/Not applicable/)).not.toBeInTheDocument();
  });

  test('names shots canonically — never the agency’s own form wording', async () => {
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    expect(await screen.findByText('Profile shot')).toBeInTheDocument();
    expect(screen.queryByText('upload profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Headshot *')).not.toBeInTheDocument();
  });

  test('keeps what is still needed open and everything else behind one toggle', async () => {
    const user = userEvent.setup();
    renderPreflight({ queryFn: () => Promise.resolve(result) });

    await screen.findByText('Profile shot');
    expect(screen.queryByText('Wear no make-up')).not.toBeInTheDocument();
    expect(screen.queryByText(/Their form publishes limits/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /What else they published \(5\)/ }));

    const blocks = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(blocks).toEqual([
      'Set rules',
      'Files',
      'Eligibility',
      'Their form asks for',
      'Not published',
    ]);
    expect(await screen.findByText('Wear no make-up')).toBeInTheDocument();
    expect(
      screen.getByText('Age — Pholio can’t check this from your profile.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Elite Models doesn’t publish file limits.'),
    ).toBeInTheDocument();
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
      await screen.findByText('They publish no shot list — form details only.'),
    ).toBeInTheDocument();
  });

  test('never blocks the send when the check itself cannot load', async () => {
    renderPreflight({ queryFn: () => Promise.reject(new Error('offline')) });

    const alert = await screen.findByRole('alert', {}, { timeout: 3_000 });
    expect(alert).toHaveTextContent(
      'Requirements couldn’t load. You can continue — the agency’s site is the source of truth.',
    );
  });

  test('sends an unavailable route to the agency itself', async () => {
    renderPreflight({
      sourceUrl: 'https://example.com/apply',
      queryFn: () => Promise.resolve({ available: false }),
    });

    expect(
      await screen.findByText(/no published requirements for Elite Models’ selected route/i),
    ).toBeInTheDocument();
    // No heading claiming a check that never happened.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    // The standalone requirements page is gone; the agency's own page is the
    // only destination left, and the only one that was ever authoritative.
    expect(screen.queryByRole('link', { name: 'Agency requirements' })).toBeNull();
    const source = screen.getByRole('link', { name: 'Their submission page' });
    expect(source).toHaveAttribute('href', 'https://example.com/apply');
    expect(source).toHaveAttribute('target', '_blank');
  });

  test('says plainly that a multi-route agency cannot be resolved for you', async () => {
    renderPreflight({
      sourceUrl: 'https://example.com/apply',
      queryFn: () => Promise.resolve({ available: false, resolution: 'choice_required' }),
    });

    expect(
      await screen.findByText(/Elite Models publishes more than one route/),
    ).toBeInTheDocument();
    // Never a guess dressed as an answer: the agency's own page is the only
    // place the choice can actually be resolved.
    expect(
      screen.getByRole('link', { name: 'Their submission page' }),
    ).toHaveAttribute('href', 'https://example.com/apply');
  });

  test('renders a controlled batched result without running the query function', async () => {
    const queryFn = vi.fn();
    renderPreflight({ result, isLoading: false, queryFn });

    expect(await screen.findByText('Profile shot')).toBeInTheDocument();
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
      expect.objectContaining({ key: 'elite#shots:missing-profile' }),
    );
  });

  test('unwraps the single result returned by the batched preflight endpoint', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      available: true,
      labels,
      results: [result],
    });
    renderPreflight({ queryFn });

    expect(await screen.findByText('Profile shot')).toBeInTheDocument();
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
        labels,
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
