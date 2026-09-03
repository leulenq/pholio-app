import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Route, Routes, useLocation,
} from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import SigningBoardPage from '../../SigningBoardPage';
import { AgencyPermissionsContext } from '../../../context/agency-permissions-context';
import { getCastingBoardPipeline, getDeclineReasons } from '../../../api/agency';

/* The board page, as the surface a booker actually drives: the URL is the
   state, the bar owns its own keys, and a record can be opened from anywhere
   the set is shown — including the shelves, which are not in the queue. */

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCastingBoardPipeline: vi.fn(),
    getDeclineReasons: vi.fn(),
  };
});

vi.mock('../../../components/review/ReviewRoom', () => ({
  __esModule: true,
  default: ({ applicationId, position, queue }) => (
    <div data-testid="review-room">
      <span data-testid="review-id">{applicationId}</span>
      <span data-testid="review-position">{`${position.index}/${position.total}`}</span>
      <span data-testid="review-queue">{queue.map((q) => q.applicationId).join(',')}</span>
    </div>
  ),
}));

vi.mock('../../../components/ComparisonOverlay', () => ({
  __esModule: true,
  default: ({ applicationIds }) => (
    <div data-testid="lineup">{applicationIds.join(',')}</div>
  ),
}));

const candidate = (id, name, status) => ({
  id,
  applicationId: id,
  name,
  backendStatus: status,
  statusChangedAt: '2026-08-20T00:00:00.000Z',
  submittedAt: '2026-08-01T00:00:00.000Z',
  headshot: null,
  city: 'Berlin',
});

const BOARD = { id: 'board-1', name: 'Women — New Faces' };
const CANDIDATES = [
  candidate('app-1', 'Jamie Rivera', 'submitted'),
  candidate('app-2', 'Nour Haddad', 'shortlisted'),
  candidate('app-3', 'Iris Bell', 'requested_more'),
  candidate('app-4', 'Theo Lane', 'kept_on_file'),
];

function Probe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderBoard(search = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgencyPermissionsContext.Provider
        value={{ can: () => true, canAny: () => true, canAll: () => true }}
      >
        <MemoryRouter initialEntries={[`/dashboard/agency/signing/board-1${search}`]}>
          <Routes>
            <Route
              path="/dashboard/agency/signing/:boardId"
              element={<><SigningBoardPage /><Probe /></>}
            />
          </Routes>
        </MemoryRouter>
      </AgencyPermissionsContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getDeclineReasons.mockResolvedValue([]);
  getCastingBoardPipeline.mockResolvedValue({
    board: BOARD,
    stages: [],
    candidates: CANDIDATES,
  });
});

describe('SigningBoardPage — the bar keeps its arming while its own note is typed in', () => {
  test('focusing the house note does not tear down the armed pass', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('button', { name: 'Jamie Rivera' });

    await user.click(screen.getByRole('button', { name: 'Jamie Rivera' }).closest('.sb-tile'));
    await user.keyboard('x');

    const note = await screen.findByLabelText('House note');
    await user.click(note);

    // The strip the field lives in must still be there — a bar that unmounts
    // when its own input takes focus cannot take a reason at all.
    expect(screen.getByLabelText('House note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm pass/ })).toBeInTheDocument();

    // The wall's own keys stay suppressed while that field has focus.
    await user.keyboard('v');
    expect(screen.getByLabelText('House note')).toHaveValue('v');
  });
});

describe('SigningBoardPage — opening a record from the shelves', () => {
  test('a shelved face opens alone, with no queue to walk', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('button', { name: 'Jamie Rivera' });

    await user.click(screen.getByRole('button', { name: /On file/ }));
    const shelfRow = (await screen.findAllByText('Theo Lane'))[0].closest('.sb-shelf-row');
    await user.dblClick(shelfRow);

    const room = await screen.findByTestId('review-room');
    expect(room).toBeInTheDocument();
    expect(screen.getByTestId('review-id')).toHaveTextContent('app-4');
    // Not in the in-play queue: it is its own single-entry queue, so the room
    // offers no previous and no next.
    expect(screen.getByTestId('review-position')).toHaveTextContent('0/1');
    expect(screen.getByTestId('review-queue')).toHaveTextContent('app-4');
  });

  test('an in-play face opens at its place in the wall order', async () => {
    const user = userEvent.setup();
    renderBoard();
    const name = await screen.findByRole('button', { name: 'Nour Haddad' });
    await user.click(name);

    await screen.findByTestId('review-room');
    expect(screen.getByTestId('review-id')).toHaveTextContent('app-2');
    expect(screen.getByTestId('review-position')).toHaveTextContent('/3');
    expect(screen.getByTestId('review-queue')).toHaveTextContent('app-1,app-2,app-3');
  });
});

describe('SigningBoardPage — a pasted ?lineup=', () => {
  test('unknown ids are dropped and the param is rewritten', async () => {
    renderBoard('?lineup=app-1,ghost,app-2');
    await screen.findByTestId('lineup');
    expect(screen.getByTestId('lineup')).toHaveTextContent('app-1,app-2');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('lineup=app-1%2Capp-2'));
  });

  test('fewer than two survivors opens nothing and drops the param', async () => {
    renderBoard('?lineup=app-1,ghost');
    await screen.findByRole('button', { name: 'Jamie Rivera' });
    expect(screen.queryByTestId('lineup')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('lineup'));
  });

  test('the set is capped at six', async () => {
    getCastingBoardPipeline.mockResolvedValue({
      board: BOARD,
      stages: [],
      candidates: Array.from({ length: 8 }, (_, i) => candidate(`app-${i + 1}`, `Face ${i + 1}`, 'submitted')),
    });
    renderBoard('?lineup=app-1,app-2,app-3,app-4,app-5,app-6,app-7,app-8');
    const lineup = await screen.findByTestId('lineup');
    expect(lineup.textContent.split(',')).toHaveLength(6);
  });
});
