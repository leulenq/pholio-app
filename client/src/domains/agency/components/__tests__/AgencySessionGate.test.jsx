import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AgencySessionGate from '../AgencySessionGate';
import { getAgencyLegalStatus, getAgencyProfile } from '../../api/agency';

vi.mock('../../api/agency', () => ({
  getAgencyLegalStatus: vi.fn(),
  getAgencyProfile: vi.fn(),
  acceptAgencyLegalPolicies: vi.fn(),
}));

// The entry splash now lives above the router in AuthEntryTransitionProvider;
// this gate only reports to it, and useAuthEntryHandoff no-ops without one.

describe('AgencySessionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        role: 'AGENCY',
        agencyMembershipId: 'membership-1',
        agencyOnboardingCompletedAt: '2026-07-12T00:00:00.000Z',
        permissions: [],
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('does not load the agency profile before legal acceptance is current', async () => {
    let resolveLegalStatus;
    getAgencyLegalStatus.mockImplementation(
      () => new Promise((resolve) => { resolveLegalStatus = resolve; }),
    );
    getAgencyProfile.mockResolvedValue({ agency_name: 'Ledger Agency' });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard/agency']}>
          <Routes>
            <Route element={<AgencySessionGate />}>
              <Route path="/dashboard/agency" element={<div>Workspace</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getAgencyLegalStatus).toHaveBeenCalledTimes(1));
    expect(getAgencyProfile).not.toHaveBeenCalled();

    resolveLegalStatus({ needsAcceptance: false });
    await waitFor(() => expect(getAgencyProfile).toHaveBeenCalledTimes(1));
  });
});
