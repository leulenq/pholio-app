import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BoardVerdictBar from '../BoardVerdictBar';
import { AgencyPermissionsContext } from '../../../context/agency-permissions-context';
import { getDeclineReasons } from '../../../api/agency';

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getDeclineReasons: vi.fn() };
});

const REASONS = [
  { id: 'board_full', label: 'Board is full', talentMessage: 'Their board is full right now.' },
];

const ALL = new Set([
  'open', 'lineup', 'shortlist', 'request_digitals', 'invite_meeting',
  'offer', 'development', 'represent', 'keep_on_file', 'pass', 'reopen',
]);

const face = (id, name) => ({ applicationId: id, name, headshot: null });

function renderBar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onAction = props.onAction || vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <AgencyPermissionsContext.Provider value={{ can: () => true, canAny: () => true, canAll: () => true }}>
        <BoardVerdictBar
          selected={[face('app-1', 'Jamie Rivera')]}
          vocab={{ decided: 'Represented', decidedLower: 'represented' }}
          legal={ALL}
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

describe('BoardVerdictBar — resting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('nothing selected means no bar at all', () => {
    const { container } = renderBar({ selected: [] });
    expect(container).toBeEmptyDOMElement();
  });

  test('it names who is under the verdict and keeps the sitting tally', () => {
    renderBar({ sessionDecided: 4 });
    expect(screen.getByText('Jamie Rivera')).toBeInTheDocument();
    expect(screen.getByText('Sitting · 4 decided')).toBeInTheDocument();
  });

  test('only the legal actions are rendered — an illegal one is absent, not disabled', () => {
    renderBar({ legal: new Set(['open', 'keep_on_file', 'pass']) });
    expect(screen.getByRole('button', { name: /Keep on file/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shortlist/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Offer representation/ })).not.toBeInTheDocument();
  });

  test('a soft move fires straight through, unarmed', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();
    await user.click(screen.getByRole('button', { name: /Request digitals/ }));
    expect(onAction).toHaveBeenCalledWith('request_digitals', {});
  });

  test('a development-only selection arms straight into the development offer', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar({ legal: new Set(['open', 'represent', 'development', 'keep_on_file', 'pass']) });

    expect(screen.getByRole('button', { name: /^Development offer/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Offer representation/ })).not.toBeInTheDocument();

    await user.keyboard('a');
    // With only one legal kind there is no variant to toggle.
    await user.keyboard('n');
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('development', { variant: 'development' });
  });

  test('a package board asks for the package confirmation, not representation', () => {
    renderBar({ vocab: { decided: 'Confirmed', decidedLower: 'confirmed' } });
    expect(screen.getByRole('button', { name: /Confirm for package/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark represented/ })).not.toBeInTheDocument();
  });

  test('two or more selected: Line up and Clear appear, the offer does not', () => {
    renderBar({ selected: [face('app-1', 'Jamie Rivera'), face('app-2', 'Nour Haddad')] });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Line up/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Offer representation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark represented/ })).not.toBeInTheDocument();
  });

  test('one selected cannot be lined up against itself', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /Line up/ })).toBeDisabled();
  });

  test('seven faces show six thumbs and the overflow count', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      applicationId: `app-${i}`, name: `Face ${i}`, headshot: `/f${i}.jpg`,
    }));
    const { container } = renderBar({ selected: many });
    expect(container.querySelectorAll('img.sbv-thumb')).toHaveLength(6);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});

describe('BoardVerdictBar — arming the offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('A arms, N relabels the primary, A confirms the development variant', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('a');
    expect(screen.getByRole('button', { name: /Confirm offer/ })).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();

    await user.keyboard('n');
    expect(screen.getByRole('button', { name: /Confirm development offer/ })).toBeInTheDocument();

    await user.keyboard('a');
    expect(onAction).toHaveBeenCalledWith('development', { variant: 'development' });
  });

  test('Enter confirms a plain representation offer', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();
    await user.keyboard('a');
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('offer', { variant: 'represent' });
  });

  test('Esc disarms without deciding anything', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { onAction } = renderBar({ onClear });

    await user.keyboard('a');
    await user.keyboard('{Escape}');

    expect(onAction).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Offer representation/ })).toBeInTheDocument();
  });
});

describe('BoardVerdictBar — arming the pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('X arms the reason strip; a reason and a note ride out with the pass', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('x');
    await screen.findByText('Board is full');
    await user.click(screen.getByText('Board is full'));
    await user.type(screen.getByLabelText('House note'), 'wrong division');
    await user.click(screen.getByRole('button', { name: /Confirm pass/ }));

    expect(onAction).toHaveBeenCalledWith('pass', {
      declineReason: 'board_full',
      note: 'wrong division',
    });
  });

  test('passing with no reason is a first-class outcome', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('x');
    await user.keyboard('{Enter}');

    expect(onAction).toHaveBeenCalledWith('pass', { declineReason: null, note: null });
  });

  test('keys typed into the note never reach the verdict shortcuts', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('x');
    await user.type(screen.getByLabelText('House note'), 'sadmx');

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText('House note')).toHaveValue('sadmx');
  });
});

describe('BoardVerdictBar — who owns the keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('while another surface is active the bar answers to nothing', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { onAction } = renderBar({ active: false, onClear });

    await user.keyboard('s');
    await user.keyboard('x');
    await user.keyboard('{Escape}');

    expect(onAction).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  test('Esc with nothing armed clears the selection', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ onClear });
    await user.keyboard('{Escape}');
    expect(onClear).toHaveBeenCalled();
  });

  test('an illegal action has no key either', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar({ legal: new Set(['open', 'pass']) });
    await user.keyboard('s');
    await user.keyboard('f');
    expect(onAction).not.toHaveBeenCalled();
  });

  test('S shortlists, F keeps on file, M invites', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar();

    await user.keyboard('s');
    await user.keyboard('f');
    await user.keyboard('m');

    expect(onAction).toHaveBeenNthCalledWith(1, 'shortlist', {});
    expect(onAction).toHaveBeenNthCalledWith(2, 'keep_on_file', {});
    expect(onAction).toHaveBeenNthCalledWith(3, 'invite_meeting', {});
  });

  test('L belongs to the page, not the bar — the button still lines up', async () => {
    const user = userEvent.setup();
    const onLineUp = vi.fn();
    renderBar({ onLineUp, selected: [face('app-1', 'Jamie Rivera'), face('app-2', 'Nour Haddad')] });

    // Two listeners answering L would push two history entries for one press.
    await user.keyboard('l');
    expect(onLineUp).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Line up/ }));
    expect(onLineUp).toHaveBeenCalledTimes(1);
  });
});

describe('BoardVerdictBar — reporting that it is armed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('arming and disarming are both announced, so the page can stand down', async () => {
    const user = userEvent.setup();
    const onArmingChange = vi.fn();
    renderBar({ onArmingChange });

    expect(onArmingChange).toHaveBeenLastCalledWith(false);

    await user.keyboard('a');
    expect(onArmingChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Escape}');
    expect(onArmingChange).toHaveBeenLastCalledWith(false);
  });

  test('confirming a pass announces the disarm too', async () => {
    const user = userEvent.setup();
    const onArmingChange = vi.fn();
    renderBar({ onArmingChange });

    await user.keyboard('x');
    expect(onArmingChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Enter}');
    expect(onArmingChange).toHaveBeenLastCalledWith(false);
  });

  test('a bar that no longer owns the keys is not armed', async () => {
    const user = userEvent.setup();
    const onArmingChange = vi.fn();
    const { rerender, ...rest } = renderBar({ onArmingChange });
    void rest;

    await user.keyboard('a');
    expect(onArmingChange).toHaveBeenLastCalledWith(true);

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AgencyPermissionsContext.Provider value={{ can: () => true, canAny: () => true, canAll: () => true }}>
          <BoardVerdictBar
            selected={[face('app-1', 'Jamie Rivera')]}
            vocab={{ decided: 'Represented', decidedLower: 'represented' }}
            legal={ALL}
            active={false}
            sessionDecided={0}
            onAction={vi.fn()}
            onArmingChange={onArmingChange}
          />
        </AgencyPermissionsContext.Provider>
      </QueryClientProvider>,
    );
    expect(onArmingChange).toHaveBeenLastCalledWith(false);
  });
});
