import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import BookingDeskPage from '../BookingDeskPage';
import { AgencyPermissionsProvider } from '../../context/AgencyPermissionsProvider';
import {
  confirmCommitment,
  createCommitment,
  getCommitments,
} from '../../api/agency';

vi.mock('../../api/agency', () => ({
  getCommitments: vi.fn(),
  createCommitment: vi.fn(),
  updateCommitment: vi.fn(),
  confirmCommitment: vi.fn(),
  releaseCommitment: vi.fn(),
}));

const TODAY = format(new Date(), 'yyyy-MM-dd');
const DATA = {
  roster: [
    {
      membershipId: '11111111-1111-4111-8111-111111111111',
      profileId: '22222222-2222-4222-8222-222222222222',
      name: 'Alex River',
      board: { id: '33333333-3333-4333-8333-333333333333', name: 'Editorial' },
    },
  ],
  events: [
    {
      id: 'bookout:44444444-4444-4444-8444-444444444444',
      source: 'talent',
      membershipId: '11111111-1111-4111-8111-111111111111',
      talentName: 'Alex River',
      board: { id: '33333333-3333-4333-8333-333333333333', name: 'Editorial' },
      kind: 'bookout',
      startDate: TODAY,
      endDate: TODAY,
      canEdit: false,
    },
  ],
};

function renderPage(permissions = ['calendar.view', 'calendar.manage']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgencyPermissionsProvider session={{ permissions }}>
        <BookingDeskPage />
      </AgencyPermissionsProvider>
    </QueryClientProvider>,
  );
}

describe('BookingDeskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommitments.mockResolvedValue(DATA);
    createCommitment.mockResolvedValue({ commitment: { id: 'new' } });
    confirmCommitment.mockResolvedValue({ commitment: { id: 'new', kind: 'booked' } });
  });

  test('shows division-grouped real data and creates an agency commitment', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Booking Desk' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Editorial' })).toBeInTheDocument();
    expect(screen.getByText('Talent-managed bookout').closest('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add commitment' }));
    fireEvent.change(screen.getByLabelText('Commitment'), { target: { value: 'hold' } });
    fireEvent.change(screen.getByLabelText('Client or job'), { target: { value: 'Studio campaign' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createCommitment).toHaveBeenCalledWith(expect.objectContaining({
        membershipId: DATA.roster[0].membershipId,
        kind: 'hold',
        clientRef: 'Studio campaign',
        startDate: TODAY,
        endDate: TODAY,
      }));
    });
  });

  test('keeps the calendar read-only without calendar.manage', async () => {
    renderPage(['calendar.view']);
    expect(await screen.findByText('Alex River')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add commitment' })).not.toBeInTheDocument();
    expect(screen.getByText('Talent-managed bookout').closest('button')).toBeNull();
  });

  test('surfaces an actionable decision when a ranked option overlaps', async () => {
    const overlapId = '55555555-5555-4555-8555-555555555555';
    createCommitment.mockResolvedValueOnce({
      commitment: { id: '66666666-6666-4666-8666-666666666666', kind: 'option' },
      warnings: [{
        id: overlapId,
        source: 'agency',
        kind: 'option',
        label: 'First client',
        startDate: TODAY,
        endDate: TODAY,
        releasable: true,
      }],
    });
    renderPage();
    await screen.findByText('Alex River');
    fireEvent.click(screen.getByRole('button', { name: 'Add commitment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Ranked option overlap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep ranked options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release new option' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release overlaps and confirm' }));

    await waitFor(() => {
      expect(confirmCommitment).toHaveBeenCalledWith(
        '66666666-6666-4666-8666-666666666666',
        [overlapId],
      );
    });
  });
});
