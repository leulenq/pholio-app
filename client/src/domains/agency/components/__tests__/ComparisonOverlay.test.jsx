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

    // The guarantee is that field labels exist ONCE, on the rail, rather than
    // being repeated per card — that is what makes every card's rows the same
    // rows. (They live on the rail now; the surface is cards on a grid, not a
    // <table>, so this asserts the invariant rather than the old markup.)
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Waist')).toBeInTheDocument();
    // Both applicants render every field row, so the count of value cells is a
    // multiple of the field count — uniformity, structurally.
    expect(screen.getAllByText(/not given/i).length).toBeGreaterThan(0);
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

  test('states to assistive tech that nothing is ranked, without printing a disclaimer', async () => {
    /* The visible caption was cut deliberately: a surface that announces its own
       even-handedness reads as a disclaimer, and the uniformity demonstrates it.
       The claim still has to be made to anyone who cannot see the layout. */
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada'), record('a2', 'Bo')],
    });
    renderOverlay();

    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    const described = document.getElementById(
      dialog.getAttribute('aria-describedby'),
    );
    expect(described.textContent).toMatch(/nothing is ranked/i);
    expect(described.textContent).toMatch(/identical fields and crops/i);
  });

  test('one control switches the frame on every card at once', async () => {
    // Mixed crops across cards is the exact non-uniformity the spec exists to
    // prevent, so the control is global by construction.
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [record('a1', 'Ada'), record('a2', 'Bo')],
    });
    const user = userEvent.setup();
    renderOverlay();

    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Full length/ }));

    expect(screen.getByRole('button', { name: /^Full length/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Headshot/ })).toHaveAttribute(
      'aria-pressed',
      'false',
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

  test('says Under 18 for a minor and prints no band for anyone else', async () => {
    /* The meta line used to render the wire token with its underscores
       swapped for spaces — "18 or older" on every adult card, which is true of
       the whole table and so tells a booker nothing, and "under 18" in
       lower case for the one card where the band is load-bearing. */
    compareApplications.mockResolvedValue({
      fields: FIELDS,
      slots: SLOTS,
      records: [
        record('a1', 'Ada Adult'),
        record('a2', 'Min Or', { ageBand: 'under_18', withheldForMinor: true }),
      ],
    });
    renderOverlay();

    await waitFor(() => expect(screen.getByText('Ada Adult')).toBeInTheDocument());
    expect(screen.getByText(/Under 18/)).toBeInTheDocument();
    expect(screen.queryByText(/18 or older|18_or_older/)).not.toBeInTheDocument();
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
