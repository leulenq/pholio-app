import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import VerdictBar from '../VerdictBar';
import { AgencyPermissionsContext } from '../../../context/agency-permissions-context';
import { getDeclineReasons } from '../../../api/agency';

/**
 * The generalised bar. The signing board's own behaviours are covered by
 * pages/signing/__tests__/BoardVerdictBar.test.jsx, which exercises the same
 * component through the board's verb set; what is tested here is the part the
 * inbox added — a verb set that differs, and the board strip.
 */

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getDeclineReasons: vi.fn() };
});

const INBOX_VERBS = [
  { action: 'open', label: 'Open', key: 'Enter', kind: 'plain' },
  { action: 'lineup', label: 'Line up', key: 'L', kind: 'plain', bulk: true, max: 6 },
  { action: 'shortlist', label: 'Shortlist', key: 'S', kind: 'plain', bulk: true },
  { action: 'request_digitals', label: 'Request digitals', key: 'D', kind: 'plain' },
  { action: 'keep_on_file', label: 'Keep on file', key: 'F', kind: 'plain', bulk: true },
  { action: 'clear', label: 'Clear', key: 'Esc', kind: 'plain', single: false, bulk: true },
  { action: 'pass', label: 'Pass', key: 'X', kind: 'arm', armLabel: 'Confirm pass', bulk: true },
  { action: 'file_to_board', label: 'File to board', key: 'B', kind: 'arm' },
  { action: 'offer', label: 'Offer representation', key: 'A', kind: 'arm' },
];

const ALL = new Set([
  'open', 'lineup', 'shortlist', 'request_digitals', 'invite_meeting',
  'offer', 'development', 'keep_on_file', 'pass', 'reopen', 'file_to_board',
]);

const BOARDS = [{ id: 'b-1', name: 'Women' }, { id: 'b-2', name: 'Development' }];

const face = (id, name) => ({ applicationId: id, name, photo: null });

function renderBar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onAction = props.onAction || vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <AgencyPermissionsContext.Provider value={{ can: () => true, canAny: () => true, canAll: () => true }}>
        <VerdictBar
          selected={[face('app-1', 'Jamie Rivera')]}
          verbs={INBOX_VERBS}
          legal={ALL}
          boards={BOARDS}
          active
          sessionDecided={0}
          {...props}
          onAction={onAction}
        />
      </AgencyPermissionsContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, onAction };
}

describe('VerdictBar — a surface brings its own verbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue([]);
  });

  test('a verb the surface did not list is absent even when the standing allows it', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /Shortlist/ })).toBeInTheDocument();
    // `Mark represented` and `Invite to meet` are not in this deck.
    expect(screen.queryByRole('button', { name: /Mark represented/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Invite to meet/ })).not.toBeInTheDocument();
  });

  test('two or more keeps only what a set can honestly receive', () => {
    renderBar({ selected: [face('app-1', 'Jamie Rivera'), face('app-2', 'Nour Haddad')] });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shortlist/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep on file/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Request digitals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Offer representation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /File to board/ })).not.toBeInTheDocument();
  });

  test('a bulk verb past its ceiling is not offered', () => {
    const seven = Array.from({ length: 7 }, (_, i) => face(`app-${i}`, `Face ${i}`));
    renderBar({ selected: seven });
    expect(screen.queryByRole('button', { name: /Line up/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shortlist/ })).toBeInTheDocument();
  });

  test('the shared toast tally still reads in the agency register', () => {
    renderBar({ sessionDecided: 3 });
    expect(screen.getByText('Sitting · 3 decided')).toBeInTheDocument();
  });
});

describe('VerdictBar — the board strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue([]);
  });

  test('B arms the strip; the confirm names the board and rides out with it', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('b');
    expect(onAction).not.toHaveBeenCalled();
    // Nothing is filed until a board is chosen: a default would file a face to
    // a board nobody picked.
    expect(screen.getByRole('button', { name: /^File to board/ })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Women' }));
    const confirm = screen.getByRole('button', { name: /^File to Women/ });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onAction).toHaveBeenCalledWith('file_to_board', { boardId: 'b-1', boardName: 'Women' });
  });

  test('Enter confirms the armed strip, Esc disarms it', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { onAction } = renderBar({ onClear });

    await user.keyboard('b');
    await user.click(screen.getByRole('radio', { name: 'Development' }));
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('file_to_board', { boardId: 'b-2', boardName: 'Development' });

    await user.keyboard('b');
    await user.keyboard('{Escape}');
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /File to board/ })).toBeInTheDocument();
  });

  test('a house with no boards is not asked to file to one', () => {
    renderBar({ boards: [] });
    expect(screen.queryByRole('button', { name: /File to board/ })).not.toBeInTheDocument();
  });

  test('an armed strip answers to its own letter and to nothing else', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('b');
    await user.keyboard('s');
    // A bar one keystroke from filing must not shortlist instead.
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Women' })).toBeInTheDocument();
  });
});

describe('VerdictBar — a chosen pass reason belongs to the person it was chosen for', () => {
  const REASONS = [
    { id: 'r1', label: 'Not the right fit', talentMessage: 'Not the right fit for us right now.' },
  ];

  const treeFor = (props, onAction, qc) => (
    <QueryClientProvider client={qc}>
      <AgencyPermissionsContext.Provider value={{ can: () => true, canAny: () => true, canAll: () => true }}>
        <VerdictBar
          selected={[face('app-1', 'Jamie Rivera')]}
          verbs={INBOX_VERBS}
          legal={ALL}
          boards={BOARDS}
          active
          sessionDecided={0}
          {...props}
          onAction={onAction}
        />
      </AgencyPermissionsContext.Provider>
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('does not leak to the next face selected into the bar', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const faceA = face('app-1', 'Jamie Rivera');
    const faceB = face('app-2', 'Nour Haddad');

    const { rerender } = render(treeFor({ selected: [faceA] }, onAction, qc));

    await user.keyboard('x');
    await screen.findByText('Not the right fit');
    await user.click(screen.getByText('Not the right fit'));
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenNthCalledWith(1, 'pass', { declineReason: 'r1', note: null });

    rerender(treeFor({ selected: [faceB] }, onAction, qc));

    await user.keyboard('x');
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenNthCalledWith(2, 'pass', { declineReason: null, note: null });
  });

  test('an armed pass disarms when the bar stops owning the keys and stays disarmed once it does again', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender } = render(treeFor({}, onAction, qc));

    await user.keyboard('x');
    await screen.findByText('Not the right fit');
    expect(screen.getByRole('button', { name: /Confirm pass/ })).toBeInTheDocument();

    rerender(treeFor({ active: false }, onAction, qc));
    rerender(treeFor({ active: true }, onAction, qc));

    // The strip is closed — arming a plain Enter now should be a no-op, not a pass.
    expect(screen.queryByRole('button', { name: /Confirm pass/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onAction).not.toHaveBeenCalled();
  });
});
