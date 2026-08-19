import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../auth/hooks/useAuth', () => ({ useAuth: vi.fn() }));

vi.mock('../../api/talent', () => ({
  talentApi: {
    getApplications: vi.fn(),
    getAgencies: vi.fn(),
    listDrafts: vi.fn(),
    listTrackedSubmissions: vi.fn(),
    logTrackedSubmission: vi.fn(),
    updateTrackedSubmission: vi.fn(),
    deleteTrackedSubmission: vi.fn(),
    getSpecRegistryRoutes: vi.fn(),
    withdrawApplication: vi.fn(),
    confirmApplicationSlot: vi.fn(),
    declineApplicationSlot: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ApplicationsView from '../ApplicationsView';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';

const applications = [
  {
    id: 'app-old',
    agency_name: 'Ridge & Bloom',
    agency_location: 'Chicago',
    status: 'pending',
    created_at: '2026-07-02T10:00:00.000Z',
  },
  {
    id: 'app-new',
    agency_name: 'Northlight Talent',
    agency_location: 'Toronto',
    status: 'represented',
    created_at: '2026-08-10T10:00:00.000Z',
  },
];

const tracked = [
  {
    id: 'trk-await',
    agencyName: 'Muse Management',
    channel: 'official_web_form',
    submittedOn: '2026-08-05',
    status: 'awaiting',
    note: null,
    outcomeNote: null,
    reviewWindowDays: 30,
    isLapsed: false,
    lapseDate: '2026-09-04',
    reapplyOpensOn: '2027-02-05',
    destinationUrl: null,
    sentSummary: null,
  },
  {
    id: 'trk-lapsed',
    agencyName: 'Que Management',
    channel: 'official_email',
    submittedOn: '2026-06-01',
    status: 'awaiting',
    note: 'Sent to the scouting address.',
    outcomeNote: null,
    reviewWindowDays: 30,
    isLapsed: true,
    lapseDate: '2026-07-01',
    reapplyOpensOn: '2026-12-01',
    destinationUrl: null,
    sentSummary: null,
  },
];

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicationsView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Agency names in the merged ledger, in the order they are rendered. */
function ledgerNames() {
  return [...document.querySelectorAll('.app-ledger-list .app-ledger-card__agency')].map(
    (node) => node.textContent,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    profile: { first_name: 'Mara', email: 'mara@example.com', phone: '+1 555 0100' },
    images: [{ id: 'img-1', status: 'active' }],
  });
  talentApi.getApplications.mockResolvedValue(applications);
  talentApi.getAgencies.mockResolvedValue([]);
  talentApi.listDrafts.mockResolvedValue([]);
  talentApi.listTrackedSubmissions.mockResolvedValue(tracked);
  talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
});

describe('the merged submission ledger', () => {
  test('reads the tracker from the ["tracker"] key the rest of the app invalidates', async () => {
    renderView();
    await waitFor(() => expect(talentApi.listTrackedSubmissions).toHaveBeenCalled());
  });

  test('interleaves logged submissions with on-Pholio ones in one chronology', async () => {
    renderView();
    await screen.findByText('Muse Management');

    expect(ledgerNames()).toEqual([
      'Northlight Talent', // 2026-08-10
      'Muse Management', //  2026-08-05
      'Ridge & Bloom', //    2026-07-02
      'Que Management', //   2026-06-01
    ]);
  });

  test('states where an off-platform submission went as a plain line', async () => {
    renderView();
    await screen.findByText('Muse Management');

    expect(screen.getByText('Submitted on their site')).toBeInTheDocument();
    expect(screen.getByText('Submitted by email')).toBeInTheDocument();
  });

  test('the filter tabs bucket tracked rows alongside applications', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByRole('tab', { name: 'In Review' }));
    expect(ledgerNames()).toEqual(['Muse Management', 'Ridge & Bloom']);

    await user.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(ledgerNames()).toEqual(['Que Management']);

    await user.click(screen.getByRole('tab', { name: 'Represented' }));
    expect(ledgerNames()).toEqual(['Northlight Talent']);
  });

  test('a lapsed row reads as convention, not as a verdict from the agency', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Que Management');

    await user.click(screen.getByText('Que Management'));

    const detail = screen.getByRole('complementary', { name: /application detail/i });
    expect(within(detail).getByText('No response')).toBeInTheDocument();
    expect(
      within(detail).getByText(
        'Industry convention says treat this as a pass. Re-apply window opens Dec 1, 2026.',
      ),
    ).toBeInTheDocument();
    expect(within(detail).getByText('Sent to the scouting address.')).toBeInTheDocument();
  });

  test('a tracked row offers the actions that are truthful for it, and no messaging', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByText('Muse Management'));

    const detail = screen.getByRole('complementary', { name: /application detail/i });
    expect(within(detail).getByRole('button', { name: /heard back/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /close record/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /message/i })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /withdraw/i })).toBeNull();
  });

  test('closing a record sends only the status that actually changes', async () => {
    const user = userEvent.setup();
    talentApi.updateTrackedSubmission.mockResolvedValue({ ...tracked[0], status: 'closed_by_talent' });
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByText('Muse Management'));
    await user.click(screen.getByRole('button', { name: /close record/i }));

    expect(talentApi.updateTrackedSubmission).toHaveBeenCalledWith('trk-await', {
      status: 'closed_by_talent',
    });
  });

  test('recording a reply carries the outcome note with the status change', async () => {
    const user = userEvent.setup();
    talentApi.updateTrackedSubmission.mockResolvedValue({ ...tracked[0], status: 'heard_back' });
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByText('Muse Management'));
    await user.click(screen.getByRole('button', { name: /heard back/i }));
    await user.type(screen.getByLabelText(/what they said/i), 'Asked for fresh digitals.');
    await user.click(screen.getByRole('button', { name: /record reply/i }));

    expect(talentApi.updateTrackedSubmission).toHaveBeenCalledWith('trk-await', {
      status: 'heard_back',
      outcomeNote: 'Asked for fresh digitals.',
    });
  });

  test('deleting asks first, because the record is gone for good', async () => {
    const user = userEvent.setup();
    talentApi.deleteTrackedSubmission.mockResolvedValue({ deleted: true });
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByText('Muse Management'));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(talentApi.deleteTrackedSubmission).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/cannot be recovered/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(talentApi.deleteTrackedSubmission).toHaveBeenCalledWith('trk-await'));
  });

  test('the ledger head opens the log form', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Muse Management');

    await user.click(screen.getByRole('button', { name: /log a submission/i }));
    expect(screen.getByRole('dialog', { name: /log a submission/i })).toBeInTheDocument();
  });
});
