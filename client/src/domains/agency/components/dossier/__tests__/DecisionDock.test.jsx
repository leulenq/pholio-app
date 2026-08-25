import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { DecisionDock } from '../DecisionDock';
import { AgencyPermissionsContext } from '../../../context/agency-permissions-context';
import { declineApplication, getDeclineReasons, getBoards } from '../../../api/agency';

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    declineApplication: vi.fn(),
    getDeclineReasons: vi.fn(),
    getBoards: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const REASONS = [
  { id: 'board_full', label: 'Board is full', talentMessage: 'Their board is full right now.' },
];

function renderDock(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgencyPermissionsContext.Provider value={{ can: () => true, canAny: () => true, canAll: () => true }}>
        <DecisionDock applicationId="app-1" talentName="Jamie Rivera" status="submitted" {...props} />
      </AgencyPermissionsContext.Provider>
    </QueryClientProvider>,
  );
}

describe('DecisionDock — Pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoards.mockResolvedValue([]);
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('declining without a reason still works — no reason reaches the API call', async () => {
    declineApplication.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderDock();

    await user.click(screen.getByRole('button', { name: /pass/i }));
    await screen.findByText('Board is full');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pass' }));

    expect(declineApplication).toHaveBeenCalledWith('app-1', { declineReason: null });
  });

  test('picking a reason sends it through to the API call', async () => {
    declineApplication.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderDock();

    await user.click(screen.getByRole('button', { name: /pass/i }));
    await screen.findByText('Board is full');
    await user.click(screen.getByText('Board is full'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pass' }));

    expect(declineApplication).toHaveBeenCalledWith('app-1', { declineReason: 'board_full' });
  });

  test('the server rejecting an unknown reason surfaces the error and leaves the modal open', async () => {
    declineApplication.mockRejectedValue(new Error('Unknown decline_reason "bogus". Expected one of: board_full.'));
    const user = userEvent.setup();
    renderDock();

    await user.click(screen.getByRole('button', { name: /pass/i }));
    await screen.findByText('Board is full');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pass' }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Only a successful decline closes the picker — a rejected one leaves it
    // open so the reviewer can retry rather than losing the in-flight choice.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
