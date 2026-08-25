import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ApplicantsPage from '../ApplicantsPage';
import { getApplicants, getBoards } from '../../api/agency';

// `/api/agency/applications` for an identity-backed applicant (open-call
// submission, no Pholio account yet): the profile fields are spread from the
// frozen snapshot with `id: null` / `slug: null`, and the plain-data truth
// fields ride at the top level of each row (design:
// open-call-applicant-flow-design-2026-08, §6).
const identityRow = {
  application_id: 'app-1',
  id: null,
  slug: null,
  first_name: 'Jamie',
  last_name: 'Rivera',
  city: 'Austin',
  images: [],
  application_status: 'submitted',
  application_created_at: '2026-08-01T00:00:00.000Z',
  archetype: 'editorial',
  emailVerified: false,
  identityClaimed: false,
  identityDisputed: true,
  identitySource: 'submission',
  materialsStatus: 'requested',
};

vi.mock('../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getApplicants: vi.fn(),
    getBoards: vi.fn(),
    getCastingBoardPipeline: vi.fn().mockResolvedValue({ board: null, candidates: [] }),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicantsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApplicantsPage — identity-backed applicant row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoards.mockResolvedValue([]);
  });

  test('renders the unclaimed submission row without crashing, honestly', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    // Plain text, never a badge — meaningful only because this row has no
    // Pholio account behind it yet.
    expect(screen.getByText(/Email unverified/)).toBeInTheDocument();
    expect(screen.getByText(/Identity disputed/)).toBeInTheDocument();

    // No slug — the row must never link to a portfolio that does not exist.
    expect(screen.queryByRole('link', { name: /portfolio/i })).not.toBeInTheDocument();
  });

  test('a claimed, profile-backed row shows neither line', async () => {
    getApplicants.mockResolvedValue({
      profiles: [{
        ...identityRow,
        id: 'profile-1',
        slug: 'jamie-rivera',
        emailVerified: true,
        identityClaimed: true,
        identityDisputed: false,
        identitySource: 'profile',
      }],
      count: 1,
      capped: false,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    expect(screen.queryByText(/Email verified/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Email unverified/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Identity disputed/)).not.toBeInTheDocument();
  });
});

/**
 * The desk used to call getApplicants with no filter params and then re-filter
 * the returned array. The endpoint truncates at SUBMISSIONS_HARD_CAP and says
 * so via `capped`, so that arrangement silently answered "who matches?" from a
 * partial pool, and never told anyone.
 */
describe('ApplicantsPage — filtering is server-authoritative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoards.mockResolvedValue([]);
  });

  test('surfaces a truncated pool instead of presenting it as complete', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.getByText(/showing the first/i)).toBeInTheDocument();
    expect(screen.getByText(/the whole pool is searched/i)).toBeInTheDocument();
  });

  test('says nothing about truncation when the pool is whole', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.queryByText(/showing the first/i)).not.toBeInTheDocument();
  });

  test('sends the city filter to the server rather than slicing the page', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await user.type(screen.getByLabelText('Filter by city'), 'Paris');

    await waitFor(() =>
      expect(getApplicants).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Paris' }),
      ),
    );
  });
});
