import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AnalyticsPage from '../AnalyticsPage';
import { getSeasonAnalytics } from '../../api/agency';

vi.mock('../../api/agency', () => ({
  getSeasonAnalytics: vi.fn(),
}));

const EMPTY_REPORT = {
  meta: {
    generatedAt: '2026-08-01T16:00:00.000Z',
    timeZone: 'America/New_York',
    stages: ['Applied', 'Shortlisted', 'Offered', 'Represented'],
    boards: [
      { id: 'package-runway', name: 'Runway intake', kind: 'package' },
      { id: 'division-development', name: 'Development', kind: 'division' },
    ],
    rosterIsDerived: false,
  },
  totals: { windowSubmissions: 0, allTimeSubmissions: 0, activitiesObserved: 0 },
  signals: [
    {
      key: 'submissions',
      label: 'Submissions',
      value: 0,
      unit: 'count',
      delta: 0,
      deltaPercent: null,
      goodDirection: 'neutral',
      series: [],
      sample: 0,
    },
  ],
  flow: { stages: [], cohort: 0, totalCohort: 0, excludedIncomplete: 0, signed: 0 },
  volume: { series: [], granularity: 'day', windowSize: 7 },
  queue: { total: 0, buckets: [] },
  calibration: { sample: 0, bins: [], separation: null },
  boards: [],
  cohorts: [],
  roster: {
    size: 0,
    everSize: 0,
    growth: [],
    boardMix: [],
    heights: [],
    ages: [],
    fit: [],
    markets: [],
    tenure: [],
    stages: [],
    experience: [],
    coverage: { heights: 0, ages: 0, fit: 0 },
  },
  desk: {
    punchTotal: 0,
    punchMax: 0,
    punchcard: [],
    teamTotal: 0,
    team: [],
    latency: { sample: 0, buckets: [] },
    interviews: { total: 0, byType: [] },
    reminders: { open: 0, overdue: 0, completedInWindow: 0, onTimeRate: null },
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard/agency/analytics']}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSeasonAnalytics.mockResolvedValue(EMPTY_REPORT);
  });

  test('offers only compatible package and division scopes for each lens', async () => {
    renderPage();

    expect(await screen.findByLabelText('Package')).toHaveTextContent('Runway intake');
    expect(screen.getByLabelText('Package')).not.toHaveTextContent('Development');

    fireEvent.change(screen.getByLabelText('Package'), { target: { value: 'package-runway' } });
    await waitFor(() => {
      expect(getSeasonAnalytics).toHaveBeenCalledWith(expect.objectContaining({
        range: 90,
        boardId: 'package-runway',
      }));
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Roster' }));
    expect(await screen.findByLabelText('Division')).toHaveTextContent('Development');
    expect(screen.getByLabelText('Division')).not.toHaveTextContent('Runway intake');

    fireEvent.change(screen.getByLabelText('Division'), { target: { value: 'division-development' } });
    await waitFor(() => {
      expect(getSeasonAnalytics).toHaveBeenCalledWith(expect.objectContaining({
        range: 90,
        boardId: 'division-development',
      }));
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Desk' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('supports roving keyboard focus across analytics tabs', async () => {
    renderPage();
    const pipeline = await screen.findByRole('tab', { name: 'Pipeline' });

    pipeline.focus();
    fireEvent.keyDown(pipeline, { key: 'ArrowRight' });
    const roster = screen.getByRole('tab', { name: 'Roster' });
    expect(roster).toHaveAttribute('aria-selected', 'true');
    expect(roster).toHaveFocus();

    fireEvent.keyDown(roster, { key: 'End' });
    const desk = screen.getByRole('tab', { name: 'Desk' });
    expect(desk).toHaveAttribute('aria-selected', 'true');
    expect(desk).toHaveFocus();

    fireEvent.keyDown(desk, { key: 'Home' });
    expect(pipeline).toHaveAttribute('aria-selected', 'true');
    expect(pipeline).toHaveFocus();
  });

  test('renders an assertive, retryable failure state when no report is available', async () => {
    getSeasonAnalytics.mockRejectedValueOnce(new Error('analytics unavailable'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The season report couldn’t load.');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'The Season' })).toBeInTheDocument();
    await waitFor(() => expect(getSeasonAnalytics).toHaveBeenCalledTimes(2));
  });

  test('keeps the last successful report visible when a refresh fails', async () => {
    const { queryClient } = renderPage();
    await screen.findByLabelText('Package');

    getSeasonAnalytics.mockRejectedValueOnce(new Error('refresh unavailable'));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['agency-season', 90, ''] });
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Couldn’t refresh this report. Showing the last successful read',
    );
    expect(screen.getByLabelText('Headline measures, 90 days')).toBeInTheDocument();
  });
});
