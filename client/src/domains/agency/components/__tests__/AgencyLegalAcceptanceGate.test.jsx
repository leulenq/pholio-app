import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AgencyLegalAcceptanceGate from '../AgencyLegalAcceptanceGate';
import {
  acceptAgencyLegalPolicies,
  getAgencyLegalStatus,
} from '../../api/agency';

vi.mock('../../api/agency', () => ({
  getAgencyLegalStatus: vi.fn(),
  acceptAgencyLegalPolicies: vi.fn(),
}));

const POLICIES = [
  ['terms', 'Terms of Service'],
  ['privacy', 'Privacy Policy'],
  ['workspaceUse', 'Workspace use'],
  ['decisionPolicy', 'Fair decision-making'],
  ['dataProcessing', 'Data handling and processing terms'],
].map(([key, title]) => ({
  key,
  title,
  copy: `Accept ${title}`,
  version: '2026-07-12',
  url: `https://www.pholio.studio/policies#${key}`,
  contentDigest: `sha256:${key.padEnd(64, '0')}`,
}));

const REQUIRED_STATUS = {
  needsAcceptance: true,
  manifestVersion: 'sha256:manifest',
  policies: POLICIES,
};

function renderGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgencyLegalAcceptanceGate>
        <div>Agency workspace</div>
      </AgencyLegalAcceptanceGate>
    </QueryClientProvider>,
  );
}

describe('AgencyLegalAcceptanceGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders the workspace when the member is current', async () => {
    getAgencyLegalStatus.mockResolvedValue({ needsAcceptance: false });
    renderGate();
    expect(await screen.findByText('Agency workspace')).toBeInTheDocument();
  });

  test('submits the exact displayed policy manifest and all acknowledgements', async () => {
    getAgencyLegalStatus.mockResolvedValue(REQUIRED_STATUS);
    acceptAgencyLegalPolicies.mockResolvedValue({ needsAcceptance: false });
    renderGate();

    const submit = await screen.findByRole('button', {
      name: 'Accept and enter workspace',
    });
    expect(screen.getAllByText('Version 2026-07-12')).toHaveLength(5);
    expect(submit).toBeDisabled();

    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(acceptAgencyLegalPolicies.mock.calls[0][0]).toEqual({
        manifestVersion: REQUIRED_STATUS.manifestVersion,
        acceptances: POLICIES.map(({ key, version, contentDigest }) => ({
          policyKey: key,
          version,
          contentDigest,
          accepted: true,
        })),
      });
    });
    expect(await screen.findByText('Agency workspace')).toBeInTheDocument();
  });
});
