import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ReviewRoom from '../ReviewRoom';
import { getApplicationDetails } from '../../../api/agency';

// `/applications/:id/details` for an identity-backed applicant (design:
// open-call-applicant-flow-design-2026-08) — `profile.id` / `profile.slug`
// are null, and the plain-data truth fields sit at the top of the payload.
const identityDetails = {
  application: {
    id: 'app-1',
    status: 'submitted',
    created_at: '2026-08-01T00:00:00.000Z',
    accepted_at: null,
    declined_at: null,
    viewed_at: null,
    invited_by_agency_id: null,
  },
  profile: {
    id: null,
    slug: null,
    first_name: 'Jamie',
    last_name: 'Rivera',
    archetype: 'editorial',
    city: 'Austin',
    is_minor: false,
    age: 24,
    images: [],
    stats: {
      height: { cm: 178, feet_inches: '5\'10"' },
      fields: [{ key: 'height', label: 'Height', value: '178 cm' }],
      updated_days_ago: 10,
      is_stale: false,
      track: null,
    },
    nationality: null,
    bio_curated: null,
    social: [],
    languages: [],
    user_email: 'jamie@example.com',
  },
  submissionPackage: {
    id: null,
    submittedAt: '2026-08-01T00:00:00.000Z',
    images: [],
    mediaSet: null,
    boards: [],
    contact: { email: 'jamie@example.com', phone: null },
    compCard: null,
    profile: null,
  },
  notes: [],
  tags: [],
  emailVerified: false,
  identityClaimed: false,
  identityDisputed: true,
  identitySource: 'submission',
  materialsStatus: 'requested',
  materialRequest: { id: 'req-1', dueAt: '2026-08-25T00:00:00.000Z', fulfilledAt: null },
  possibleDuplicateOf: 'app-999',
};

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getApplicationDetails: vi.fn(),
  };
});

const row = {
  applicationId: 'app-1',
  name: 'Jamie Rivera',
  city: 'Austin',
  type: 'editorial',
  status: 'submitted',
  appliedAt: '2026-08-01T00:00:00.000Z',
  photo: null,
};

function renderRoom(overrides = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReviewRoom
          applicationId="app-1"
          row={row}
          position={{ index: 0, total: 1 }}
          onClose={() => {}}
          onDecide={() => {}}
          onJump={() => {}}
          queue={[row]}
          boards={[]}
          busy={false}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReviewRoom — identity-backed applicant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders an unclaimed submission honestly, without crashing', async () => {
    getApplicationDetails.mockResolvedValue(identityDetails);
    renderRoom();

    await waitFor(() => expect(screen.getAllByText('Jamie Rivera').length).toBeGreaterThan(0));

    // The dispute sentence, prominent and plain — never a badge.
    expect(
      screen.getByText('The person behind this email says they did not submit this application.'),
    ).toBeInTheDocument();

    // Email state, meaningful only because this is an identity row.
    expect(screen.getByText('Unverified')).toBeInTheDocument();

    // The materials line, with its due date.
    expect(screen.getByText(/Materials requested/)).toBeInTheDocument();

    // The duplicate signal, as a plain sentence with a route to the other record.
    expect(screen.getByText(/May be the same person as/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'an earlier submission' })).toBeInTheDocument();
  });

  test('a claimed, profile-backed applicant shows none of the identity-row lines', async () => {
    getApplicationDetails.mockResolvedValue({
      ...identityDetails,
      profile: { ...identityDetails.profile, id: 'profile-1', slug: 'jamie-rivera' },
      identityClaimed: true,
      emailVerified: true,
      identityDisputed: false,
      identitySource: 'profile',
      materialsStatus: 'none',
      materialRequest: null,
      possibleDuplicateOf: null,
    });
    renderRoom();

    await waitFor(() => expect(screen.getAllByText('Jamie Rivera').length).toBeGreaterThan(0));

    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(
      screen.queryByText('The person behind this email says they did not submit this application.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/May be the same person as/)).not.toBeInTheDocument();
  });
});
