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

  test('prints every change open, with the effective date and agree controls', async () => {
    talentApi.getLegalStatus.mockResolvedValue({
      needsAcceptance: true,
      version: '2026-07-18',
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
    expect(screen.getByText(/effective 18 july 2026/i)).toBeInTheDocument();

    // The detail is visible without interaction — a consent gate must show the
    // thing being consented to, so there is no disclosure control to open.
    expect(
      screen.getByRole('heading', { name: /added explicit age and guardian rules/i }),
    ).toBeInTheDocument();
    // Not toBeVisible(): the panel carries framer-motion's initial opacity: 0 in
    // jsdom, where the entrance never runs. `hidden` is what the old accordion
    // used to withhold the detail, so that is what this pins.
    const detail = screen.getByText(
      /a 13\+ minimum and guardian authorization for under-18 talent/i,
    );
    expect(detail).toBeInTheDocument();
    expect(detail).not.toHaveAttribute('hidden');
    expect(
      screen.queryByRole('button', { name: /added explicit age and guardian rules/i }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
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
