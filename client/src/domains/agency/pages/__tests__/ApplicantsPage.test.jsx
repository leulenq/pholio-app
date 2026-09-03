import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import ApplicantsPage from '../ApplicantsPage';
import { AgencyPermissionsContext } from '../../context/agency-permissions-context';
import {
  getApplicants, getBoards, shortlistApplication, getDeclineReasons,
} from '../../api/agency';

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
    getDeclineReasons: vi.fn(),
    shortlistApplication: vi.fn(),
    getCastingBoardPipeline: vi.fn().mockResolvedValue({ board: null, candidates: [] }),
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgencyPermissionsContext.Provider
        value={{ can: () => true, canAny: () => true, canAll: () => true }}
      >
        <MemoryRouter>
          <ApplicantsPage />
        </MemoryRouter>
      </AgencyPermissionsContext.Provider>
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

    // Plain text, never a badge — the only identity fact the card still
    // carries after the restraint revision (2026-09-01 §7); "Email
    // unverified" is gone for good.
    expect(screen.getByText(/Identity disputed/)).toBeInTheDocument();
    expect(screen.queryByText(/Email unverified/)).not.toBeInTheDocument();

    // No slug — the row must never link to a portfolio that does not exist.
    expect(screen.queryByRole('link', { name: /portfolio/i })).not.toBeInTheDocument();
  });

  /**
   * The card metadata contract, restraint revision (spec:
   * 2026-09-01-talent-card-metadata §7). The card prints one figures line —
   * height, age, city — and only the notations that are actionable. No
   * imperial conversion, no applied board, no received moment, never an
   * invented discipline.
   */
  test('prints one figures line and the actionable notations — nothing else', async () => {
    getApplicants.mockResolvedValue({
      profiles: [{
        ...identityRow,
        height_cm: 178,
        age: 24,
        submission_package: { boards: ['Women'] },
        digitalsFreshness: { hasDigitals: false, state: 'undated' },
      }],
      count: 1,
      capped: false,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());

    expect(screen.getByText('178')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Austin')).toBeInTheDocument();
    expect(screen.getByText('No digitals')).toBeInTheDocument();
    expect(screen.getByText('Identity disputed')).toBeInTheDocument();

    // Cut everywhere on cards, per the restraint revision.
    expect(screen.queryByText('5\u2032 10\u2033')).not.toBeInTheDocument();
    expect(screen.queryByText('Women')).not.toBeInTheDocument();
    expect(screen.queryByText(/Received/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Digitals ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/editorial/i)).not.toBeInTheDocument();
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

/**
 * The standing, in one vocabulary with the signing wall, printed as type
 * rather than as a tinted cell (talent-card-metadata §9, defect 1).
 */
describe('ApplicantsPage — where a submission stands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoards.mockResolvedValue([]);
    getDeclineReasons.mockResolvedValue([]);
  });

  test('the To review tab prints no standing line: the tab already says it', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.queryByText('Filed')).not.toBeInTheDocument();
    expect(container.querySelector('.cm-stage')).toBeNull();
  });

  test('a decided tab prints the standing as plain type, never a status cell', async () => {
    getApplicants.mockResolvedValue({
      profiles: [{
        ...identityRow,
        application_status: 'shortlisted',
        status_changed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      }],
      count: 1,
      capped: false,
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Shortlisted' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Shortlisted' }));

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.getByText('Shortlisted', { selector: '.cm-stage' })).toBeInTheDocument();
    expect(screen.getByText('3d')).toBeInTheDocument();
    // The tinted, bordered cell is gone from both the card and the row.
    expect(container.querySelector('.ag-status-cell')).toBeNull();
  });
});

/**
 * One selection language with the signing wall: click selects, the bar rises,
 * the decision is taken there (§9, defect 2).
 */
describe('ApplicantsPage — the working surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoards.mockResolvedValue([{ id: 'b-1', name: 'Women' }]);
    getDeclineReasons.mockResolvedValue([]);
    shortlistApplication.mockResolvedValue({});
  });

  test('no checkbox, no hover triage icons, no floating bulk pill', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(container.querySelector('.ap-pick')).toBeNull();
    expect(container.querySelector('.ap-card-acts')).toBeNull();
    expect(container.querySelector('.ap-bulk')).toBeNull();
    // Nothing rises until something is selected.
    expect(container.querySelector('.sbv-bar')).toBeNull();
  });

  test('a click raises the bar, and the verb decides on what is selected', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    const user = userEvent.setup();
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    await user.click(container.querySelector('.ap-card'));

    expect(container.querySelector('.sbv-bar')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Shortlist/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /File to board/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pass/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Shortlist/ }));

    await waitFor(() => expect(shortlistApplication).toHaveBeenCalledWith('app-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Shortlisted Jamie Rivera',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    ));
  });

  test('Escape clears the selection and the bar steps back', async () => {
    getApplicants.mockResolvedValue({ profiles: [identityRow], count: 1, capped: false });
    const user = userEvent.setup();
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    await user.click(container.querySelector('.ap-card'));
    expect(container.querySelector('.sbv-bar')).not.toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(container.querySelector('.sbv-bar')).toBeNull());
  });
});
