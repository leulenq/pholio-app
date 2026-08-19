import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import TalentFullView from '../TalentFullView';
import { getTalentDossier } from '../../api/agency';

// Identity-backed applicant fixture: no Pholio account yet — `talent.id` and
// `talent.slug` are null, and the plain-data truth fields sit at the top of
// the dossier payload (design: open-call-applicant-flow-design-2026-08).
const identityDossier = {
  application: {
    id: 'app-1',
    status: 'submitted',
    board_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    viewed_at: null,
    accepted_at: null,
    declined_at: null,
    invited_by_agency_id: null,
  },
  talent: {
    id: null,
    slug: null,
    first_name: 'Jamie',
    last_name: 'Rivera',
    city: 'Austin',
    market: null,
    nationality: null,
    is_minor: false,
    age: 24,
    stats_track: null,
    professional: { discipline: null, city_secondary: null },
    social: [],
    bio_curated: null,
    stats: { fields: [] },
  },
  images: [],
  submissionPackage: null,
  representation: { status: null, represented_by: null, lines: [] },
  availability: { status: null, window_days: 90, bookouts: [], commitments: [] },
  standing: {
    submitted_at: '2026-08-01T00:00:00.000Z',
    viewed_at: null,
    days_since_submitted: 5,
    days_since_last_action: 5,
    last_action_at: null,
    last_action_type: null,
    board: null,
    invited: false,
    notes: [],
    tags: [],
    timeline: [],
  },
  compliance: { is_minor: false, age_band: null, guardian_consent_at: null },
  contact: { email: 'jamie@example.com', phone: null },
  identityClaimed: false,
  emailVerified: false,
  identityDisputed: true,
  identitySource: 'submission',
};

vi.mock('../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTalentDossier: vi.fn(),
    getBoards: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    getNotes: vi.fn().mockResolvedValue([]),
  };
});

function renderView(applicationId = 'app-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/agency/talent/${applicationId}`]}>
        <Routes>
          <Route path="/dashboard/agency/talent/:applicationId" element={<TalentFullView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TalentFullView — identity-backed applicant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders an unclaimed submission without crashing, honestly', async () => {
    getTalentDossier.mockResolvedValue(identityDossier);
    renderView();

    // The name renders even though there is no live profile behind it.
    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    // The dispute sentence is a plain sentence, prominently placed — never a badge.
    expect(
      screen.getByText('The person behind this email says they did not submit this application.'),
    ).toBeInTheDocument();

    // Email verification state is meaningful for an identity row.
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();

    // No slug — never a link to a portfolio that does not exist.
    expect(screen.queryByRole('link', { name: /portfolio/i })).not.toBeInTheDocument();

    // No account yet — messaging is replaced by a plain-text reason, not a
    // composer that would silently fail to send.
    expect(
      screen.getByText("No Pholio account yet — this applicant can't be messaged directly."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Write a message to the talent…')).not.toBeInTheDocument();
  });

  test('a claimed, profile-backed applicant shows no email/identity lines and can be messaged', async () => {
    getTalentDossier.mockResolvedValue({
      ...identityDossier,
      talent: { ...identityDossier.talent, id: 'profile-1', slug: 'jamie-rivera' },
      identityClaimed: true,
      emailVerified: true,
      identityDisputed: false,
      identitySource: 'profile',
    });
    renderView();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    // A profile row already went through Pholio's own signup verification —
    // the row says nothing about email state rather than guessing "verified".
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
    expect(
      screen.queryByText('The person behind this email says they did not submit this application.'),
    ).not.toBeInTheDocument();

    expect(screen.getByPlaceholderText('Write a message to the talent…')).toBeInTheDocument();
  });
});
