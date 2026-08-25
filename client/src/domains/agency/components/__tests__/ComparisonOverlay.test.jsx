import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ComparisonOverlay from '../ComparisonOverlay';
import { compareApplications } from '../../api/agency';

vi.mock('../../api/agency', () => ({ compareApplications: vi.fn() }));

const FIELDS = [
  { key: 'height', label: 'Height', unit: 'cm' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
];
const SLOTS = [
  { key: 'headshot', label: 'Headshot' },
  { key: 'full_length', label: 'Full length' },
];

const record = (id, name, overrides = {}) => ({
  applicationId: id,
  status: 'pending',
  submittedAt: '2026-08-01T00:00:00.000Z',
  name,
  ageBand: '18_or_older',
  fields: [
    { key: 'height', value: 178 },
    { key: 'waist', value: null },
  ],
  slots: [
    { key: 'headshot', image: { id: 'i1', public_url: 'https://cdn/x.jpg' } },
    { key: 'full_length', image: null },
  ],
  withheldForMinor: false,
  hasSnapshot: true,
  ...overrides,
});

function renderOverlay(ids = ['a1', 'a2']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ComparisonOverlay applicationIds={ids} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ComparisonOverlay', () => {
  beforeEach(() => vi.clearAllMocks());

  test('lays every applicant out against the same rows', async () => {
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada Editorial'), record('a2', 'Bo Runway')],
    });
    renderOverlay();

    await waitFor(() => expect(screen.getByText('Ada Editorial')).toBeInTheDocument());
    expect(screen.getByText('Bo Runway')).toBeInTheDocument();
    // Row headers exist once each — the fields are the table's spine.
    expect(screen.getByRole('rowheader', { name: 'Height' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Waist' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Full length' })).toBeInTheDocument();
  });

  test('a missing measurement is blank, never a dash or a zero', async () => {
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada Editorial')],
    });
    renderOverlay(['a1']);

    await waitFor(() => expect(screen.getByText('178')).toBeInTheDocument());
    // A dash or a 0 in a measurement column reads as a measurement.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Not given')).toBeInTheDocument();
  });

  test('says outright that nothing is ranked', async () => {
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada'), record('a2', 'Bo')],
    });
    renderOverlay();

    await waitFor(() =>
      expect(screen.getByText(/Nothing here is ranked/i)).toBeInTheDocument(),
    );
  });

  test('explains a short column rather than letting it read as unsent', async () => {
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada', { withheldForMinor: true })],
    });
    renderOverlay(['a1']);

    await waitFor(() =>
      expect(screen.getByText(/withheld, not unsent/i)).toBeInTheDocument(),
    );
  });

  test('closes on Escape', async () => {
    compareApplications.mockResolvedValue({ fields: FIELDS, slots: SLOTS, records: [] });
    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ComparisonOverlay applicationIds={['a1']} onClose={onClose} />
      </QueryClientProvider>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  test('sends the selection to the server in the order given', async () => {
    compareApplications.mockResolvedValue({ fields: FIELDS, slots: SLOTS, records: [] });
    renderOverlay(['a3', 'a1', 'a2']);
    await waitFor(() =>
      expect(compareApplications).toHaveBeenCalledWith(['a3', 'a1', 'a2']),
    );
  });
});
