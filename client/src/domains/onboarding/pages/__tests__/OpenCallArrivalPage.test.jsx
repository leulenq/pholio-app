import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import OpenCallArrivalPage from '../OpenCallArrivalPage';

// The page formats dates in the viewer's locale, so the expectation is built
// the same way rather than pinned to one region's ordering.
function humanDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const AGENCY = {
  id: 'agency-1',
  name: 'Northlight Management',
  location: 'London',
  logo: null,
  website: 'https://northlight.example.com',
  openBoards: [],
};

const BRIEF = {
  who: "New faces for our women's board, London.",
  what: 'Four digitals: close-up, profile, waist-up and full length.',
  eligibility: '16 and over.',
  nextSteps: 'We review weekly and reply within 30 days, either way.',
  deadline: '2026-09-30',
  ongoing: false,
};

function mockArrival(data) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('/arrival')) {
      return { ok: true, json: async () => ({ data: { valid: true } }) };
    }
    return { ok: true, json: async () => ({ data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/opencall/ABC123']}>
      <Routes>
        <Route path="/opencall/:code" element={<OpenCallArrivalPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('main');
}

describe('OpenCallArrivalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows the agency brief in the agency’s own words', async () => {
    mockArrival({ valid: true, agency: AGENCY, brief: BRIEF, closed: false, alreadyApplied: false, authenticated: true });
    await renderPage();

    expect(screen.getByText('Who this is for')).toBeInTheDocument();
    expect(screen.getByText(BRIEF.who)).toBeInTheDocument();
    expect(screen.getByText('What to send')).toBeInTheDocument();
    expect(screen.getByText(BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText('What happens next')).toBeInTheDocument();
    expect(screen.getByText(BRIEF.nextSteps)).toBeInTheDocument();
  });

  test('states the closing date', async () => {
    mockArrival({ valid: true, agency: AGENCY, brief: BRIEF, closed: false, alreadyApplied: false, authenticated: true });
    await renderPage();
    expect(screen.getByText(`Closes ${humanDate('2026-09-30')}.`)).toBeInTheDocument();
  });

  test('says so when a call runs continuously', async () => {
    mockArrival({
      valid: true, agency: AGENCY, closed: false, alreadyApplied: false, authenticated: true,
      brief: { ...BRIEF, deadline: null, ongoing: true },
    });
    await renderPage();
    expect(screen.getByText('This call runs continuously.')).toBeInTheDocument();
  });

  test('omits eligibility when the call is open to everyone', async () => {
    mockArrival({
      valid: true, agency: AGENCY, closed: false, alreadyApplied: false, authenticated: true,
      brief: { ...BRIEF, eligibility: null },
    });
    await renderPage();
    expect(screen.queryByText('Eligibility')).not.toBeInTheDocument();
    expect(screen.getByText('Who this is for')).toBeInTheDocument();
  });

  // Links published before briefs existed keep working, and inventing
  // reassuring filler on the agency's behalf would be worse than generic steps.
  test('falls back to the generic steps when no brief was written', async () => {
    mockArrival({ valid: true, agency: AGENCY, brief: null, closed: false, alreadyApplied: false, authenticated: true });
    await renderPage();

    expect(screen.queryByText('Who this is for')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happens next')).toBeInTheDocument();
    expect(screen.getByText(/Prepare your digitals/)).toBeInTheDocument();
  });

  test('a closed call says so and never invites a submission', async () => {
    mockArrival({ valid: true, agency: AGENCY, brief: { ...BRIEF, deadline: '2026-08-01' }, closed: true, alreadyApplied: false, authenticated: true });
    await renderPage();

    expect(screen.getByText(/open call has closed/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`closed on ${humanDate('2026-08-01')}`)),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Begin your submission/i })).not.toBeInTheDocument();
  });

  test('does not fire the arrival beacon into a closed call', async () => {
    const fetchMock = mockArrival({ valid: true, agency: AGENCY, brief: BRIEF, closed: true, alreadyApplied: false, authenticated: true });
    await renderPage();

    const arrivalCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/arrival'));
    expect(arrivalCalls).toHaveLength(0);
  });
});
