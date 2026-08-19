import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import AgencyBriefScene from '../AgencyBriefScene';
import { briefForSeries } from '../../../../content/agencyBriefs';

// Lane A owns content/agencyBriefs.js — mocked so this suite passes
// regardless of its build timing (per the shared contract).
vi.mock('../../../../content/agencyBriefs', () => ({
  briefForSeries: vi.fn(),
  checkedOn: '2026-08-19',
}));

const ROUTE = {
  agencyName: 'Route-only Agency Name',
  marketLabel: 'New York',
  sourceUrl: 'https://example.com/route-apply',
  sourceCheckedOn: '2026-07-01',
  verification: null,
  channelType: 'official_web_form',
};

const AUTHORED_ENTRY = {
  id: 'muse-nyc',
  name: 'Muse Management',
  market: 'New York',
  kind: 'agency',
  registration: { authority: 'NY DOL', cert: '26-67AN4-LSFW' },
  officialApplyUrl: 'https://www.musenyc.com/contact',
  seriesIds: ['muse-model-management-nyc:email'],
  brief: {
    howYouApply: 'You apply by email — one message with your photos.',
    photos: {
      slots: ['Close-up, hair up', 'Full length'],
      rules: ['Natural light works best', 'Keep each photo around 1 MB'],
    },
    yourDetails: 'Name, age, and location, plus four measurements.',
    whoTheyWant: 'Muse prefers women 5\'9" and taller — and represents all sizes.',
    under18: 'A parent should be involved in your email.',
    afterYouSubmit: 'Silence is the normal outcome here, not a mistake.',
    headsUps: ['musetheagency.com is a different company.'],
    finePrint: ['Office: 150 Broadway, Suite 300, New York, NY 10038'],
  },
};

const FALLBACK_EVALUATION = {
  seriesId: 'unbriefed-agency:online',
  agencyName: 'Unbriefed Agency',
  findings: [
    {
      id: 'f1',
      slotKey: 's1',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'close_up',
      outcome: 'missing',
      sourceLabel: 'Close up shot',
    },
    {
      id: 'f2',
      slotKey: 's2',
      categoryKey: 'setWide',
      field: 'presentation.background',
      outcome: 'missing',
      modality: 'required',
      sourceLabel: 'Plain white background required',
    },
    {
      id: 'f3',
      slotKey: 's3',
      categoryKey: 'applicationFields',
      field: 'applicant.message',
      outcome: 'unknown',
    },
  ],
};

function renderScene(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AgencyBriefScene
        route={ROUTE}
        seriesId="some-series:online"
        onStartPreparing={vi.fn()}
        onOutboundClick={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('AgencyBriefScene — authored brief', () => {
  test('renders the authored copy for a stubbed series, over the route DTO', () => {
    briefForSeries.mockReturnValue(AUTHORED_ENTRY);
    renderScene();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Muse Management');
    expect(screen.getByText(/You apply by email/)).toBeInTheDocument();
    expect(screen.getByText('Close-up, hair up')).toBeInTheDocument();
    expect(screen.getByText('Registered · NY DOL 26-67AN4-LSFW')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open their application page/i }),
    ).toHaveAttribute('href', 'https://www.musenyc.com/contact');
  });

  test('under-18 section is always present, with the authored truth', () => {
    briefForSeries.mockReturnValue(AUTHORED_ENTRY);
    renderScene();

    expect(screen.getByRole('heading', { name: 'Under 18?' })).toBeInTheDocument();
    expect(screen.getByText('A parent should be involved in your email.')).toBeInTheDocument();
  });

  test('the outbound CTA opens the agency page and records the click', async () => {
    briefForSeries.mockReturnValue(AUTHORED_ENTRY);
    const onOutboundClick = vi.fn();
    renderScene({ onOutboundClick });

    const link = screen.getByRole('link', { name: /Open their application page/i });
    await userEvent.click(link);
    expect(onOutboundClick).toHaveBeenCalledTimes(1);
  });

  test('"Start preparing" advances into the existing off-Pholio flow', async () => {
    briefForSeries.mockReturnValue(AUTHORED_ENTRY);
    const onStartPreparing = vi.fn();
    renderScene({ onStartPreparing });

    await userEvent.click(screen.getByRole('button', { name: 'Start preparing' }));
    expect(onStartPreparing).toHaveBeenCalledTimes(1);
  });
});

describe('AgencyBriefScene — DTO fallback', () => {
  test('renders the same section layout from the published route alone', async () => {
    briefForSeries.mockReturnValue(null);
    renderScene({
      route: { ...ROUTE, agencyName: 'Unbriefed Agency' },
      seriesId: 'unbriefed-agency:online',
      queryFn: () => Promise.resolve({ data: FALLBACK_EVALUATION }),
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Unbriefed Agency');

    await waitFor(() => {
      expect(screen.getByText('Close-up')).toBeInTheDocument();
    });

    // Under 18 renders even with nothing authored — the honest unknown, never
    // blank — while the sections the fallback data DOES cover (formFields) no
    // longer read that way.
    const under18Heading = screen.getByRole('heading', { name: 'Under 18?' });
    expect(
      within(under18Heading.closest('section')).getByText('The agency doesn’t say.'),
    ).toBeInTheDocument();
  });

  test('never renders research vocabulary or raw source labels', async () => {
    briefForSeries.mockReturnValue(null);
    renderScene({
      route: { ...ROUTE, agencyName: 'Unbriefed Agency' },
      seriesId: 'unbriefed-agency:online',
      queryFn: () => Promise.resolve({ data: FALLBACK_EVALUATION }),
    });

    await waitFor(() => {
      expect(screen.getByText('Close-up')).toBeInTheDocument();
    });
    expect(screen.queryByText(/FACT|OBSERVED/)).toBeNull();
    expect(screen.queryByText('Close up shot')).toBeNull();
  });
});
