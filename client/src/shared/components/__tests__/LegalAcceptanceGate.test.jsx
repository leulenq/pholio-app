import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import LegalAcceptanceGate from '../LegalAcceptanceGate';
import { summarizeChange } from '../legalChangeSummary';
import { talentApi } from '../../../domains/talent/api/talent';

vi.mock('../../../domains/talent/api/talent', () => ({
  talentApi: {
    getLegalStatus: vi.fn(),
    acceptLegalTerms: vi.fn(),
  },
}));

vi.mock('../../lib/logout', () => ({
  MARKETING_SITE_URL: 'https://www.pholio.studio',
}));

describe('summarizeChange', () => {
  test('splits on an em dash for a scannable title', () => {
    expect(
      summarizeChange(
        'Added explicit age and guardian rules — a 13+ minimum, guardian authorization for under-18 Talent.',
      ),
    ).toEqual({
      title: 'Added explicit age and guardian rules',
      detail:
        'a 13+ minimum, guardian authorization for under-18 Talent.',
    });
  });

  test('splits on a colon when no em dash is present', () => {
    expect(
      summarizeChange(
        'Broadened who can receive a submission: agencies, casting organizations, and brands.',
      ),
    ).toEqual({
      title: 'Broadened who can receive a submission',
      detail: 'agencies, casting organizations, and brands.',
    });
  });

  test('keeps short copy as a title-only row', () => {
    expect(summarizeChange('Clarified our role as a software platform.')).toEqual({
      title: 'Clarified our role as a software platform.',
      detail: '',
    });
  });
});

describe('LegalAcceptanceGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders a scannable consent sheet with sticky agree controls', async () => {
    talentApi.getLegalStatus.mockResolvedValue({
      needsAcceptance: true,
      changes: [
        'Added explicit age and guardian rules — a 13+ minimum and guardian authorization for under-18 Talent.',
        'Detailed subscription renewal, cancellation, tax, and price-change notices.',
      ],
    });

    render(
      <LegalAcceptanceGate>
        <div>Dashboard</div>
      </LegalAcceptanceGate>,
    );

    expect(await screen.findByRole('dialog', { name: /our terms have changed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /added explicit age and guardian rules/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^terms$/i })).toHaveAttribute(
      'href',
      'https://www.pholio.studio/terms',
    );

    const agree = screen.getByRole('checkbox', {
      name: /i agree to the updated terms of service and privacy policy/i,
    });
    const submit = screen.getByRole('button', { name: /agree & continue/i });
    expect(submit).toBeDisabled();

    fireEvent.click(agree);
    expect(submit).toBeEnabled();

    talentApi.acceptLegalTerms.mockResolvedValue({ ok: true });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(talentApi.acceptLegalTerms).toHaveBeenCalledWith({
        terms_accepted: true,
        privacy_accepted: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
