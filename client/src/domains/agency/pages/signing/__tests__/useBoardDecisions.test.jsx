import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { useBoardDecisions } from '../useBoardDecisions';
import {
  shortlistApplication,
  acceptApplication,
  declineApplication,
  confirmRepresentationApplication,
  updateCastingApplicationStage,
  bulkUpdateCastingApplicationStage,
  bulkDeclineApplications,
  createNote,
} from '../../../api/agency';

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    shortlistApplication: vi.fn(),
    requestMoreApplication: vi.fn(),
    requestMeetingApplication: vi.fn(),
    acceptApplication: vi.fn(),
    offerDevelopmentApplication: vi.fn(),
    confirmRepresentationApplication: vi.fn(),
    keepOnFileApplication: vi.fn(),
    declineApplication: vi.fn(),
    updateCastingApplicationStage: vi.fn(),
    bulkUpdateCastingApplicationStage: vi.fn(),
    bulkDeclineApplications: vi.fn(),
    createNote: vi.fn(),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BOARD_ID = 'board-1';

const candidate = (id, name, status) => ({
  applicationId: id,
  name,
  backendStatus: status,
  statusChangedAt: '2026-08-01T00:00:00.000Z',
});

const CANDIDATES = [
  candidate('app-1', 'Jamie Rivera', 'submitted'),
  candidate('app-2', 'Nour Haddad', 'shortlisted'),
  candidate('app-3', 'Iris Bell', 'accepted'),
  // Standings an agency may not write: only the talent (or the auto-close
  // job) puts a row into these, so Undo cannot put one back.
  candidate('app-4', 'Theo Lane', 'pending'),
  candidate('app-5', 'Rae Okafor', 'withdrawn'),
  candidate('app-6', 'Sol Marin', 'confirmed'),
];

function setup({ vocab = { decided: 'Represented', decidedLower: 'represented' } } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['board-candidates', BOARD_ID], {
    board: { id: BOARD_ID },
    stages: [],
    candidates: CANDIDATES,
  });
  const byId = new Map(CANDIDATES.map((c) => [c.applicationId, c]));
  const wrapper = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useBoardDecisions({ boardId: BOARD_ID, vocab, byId }), { wrapper });
  return { qc, hook };
}

const cached = (qc) => qc.getQueryData(['board-candidates', BOARD_ID]).candidates;
const statusOf = (qc, id) => cached(qc).find((c) => c.applicationId === id).backendStatus;

describe('useBoardDecisions — one decision', () => {
  beforeEach(() => vi.clearAllMocks());

  test('shortlist writes the standing optimistically, calls the API, and toasts with Undo', async () => {
    shortlistApplication.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('shortlist', ['app-1']); });

    expect(shortlistApplication).toHaveBeenCalledWith('app-1');
    expect(statusOf(qc, 'app-1')).toBe('shortlisted');
    expect(statusOf(qc, 'app-1')).not.toBe('submitted');
    expect(toast.success).toHaveBeenCalledWith('Shortlisted Jamie Rivera', expect.objectContaining({
      action: expect.objectContaining({ label: 'Undo' }),
    }));
    expect(hook.result.current.sessionDecided).toBe(1);
  });

  test('Undo PATCHes the prior standing back and says so without claiming a recall', async () => {
    shortlistApplication.mockResolvedValue({ success: true });
    updateCastingApplicationStage.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('shortlist', ['app-1']); });
    const undo = toast.success.mock.calls[0][1].action.onClick;
    await act(async () => { await undo(); });

    expect(updateCastingApplicationStage).toHaveBeenCalledWith('app-1', { status: 'submitted' });
    expect(statusOf(qc, 'app-1')).toBe('submitted');
    expect(toast.success).toHaveBeenLastCalledWith('Restored Jamie Rivera to Filed');
    await waitFor(() => expect(hook.result.current.sessionDecided).toBe(0));
  });

  test('a pass carries its reason and its house note', async () => {
    declineApplication.mockResolvedValue({ success: true });
    createNote.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => {
      await hook.result.current.decide('pass', ['app-2'], { declineReason: 'board_full', note: '  not this season  ' });
    });

    expect(declineApplication).toHaveBeenCalledWith('app-2', expect.objectContaining({ declineReason: 'board_full' }));
    expect(createNote).toHaveBeenCalledWith('app-2', 'not this season');
    expect(statusOf(qc, 'app-2')).toBe('declined');
    expect(toast.success).toHaveBeenCalledWith('Passed on Nour Haddad', expect.anything());
  });

  test('a failed decision rolls the wall back and never counts as decided', async () => {
    shortlistApplication.mockRejectedValue(new Error('Action failed'));
    const { qc, hook } = setup();

    let outcome;
    await act(async () => { outcome = await hook.result.current.decide('shortlist', ['app-1']); });

    expect(outcome).toBe(false);
    expect(statusOf(qc, 'app-1')).toBe('submitted');
    expect(hook.result.current.sessionDecided).toBe(0);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('a package board says the package vocabulary when representation is confirmed', async () => {
    confirmRepresentationApplication.mockResolvedValue({ success: true });
    const { hook } = setup({ vocab: { decided: 'Confirmed', decidedLower: 'confirmed' } });

    await act(async () => { await hook.result.current.decide('represent', ['app-3']); });

    expect(toast.success).toHaveBeenCalledWith('Iris Bell confirmed for the package', expect.anything());
  });

  test('reopen returns a shelved face to the shortlist', async () => {
    updateCastingApplicationStage.mockResolvedValue({ success: true });
    const { hook } = setup();

    await act(async () => { await hook.result.current.decide('reopen', ['app-2']); });

    expect(updateCastingApplicationStage).toHaveBeenCalledWith('app-2', { status: 'shortlisted' });
    expect(toast.success).toHaveBeenCalledWith('Reopened Nour Haddad', expect.anything());
  });

  test('an unknown action and an empty selection are both refused', async () => {
    const { hook } = setup();
    let a; let b;
    await act(async () => {
      a = await hook.result.current.decide('promote', ['app-1']);
      b = await hook.result.current.decide('shortlist', []);
    });
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(shortlistApplication).not.toHaveBeenCalled();
  });
});

describe('useBoardDecisions — the set', () => {
  beforeEach(() => vi.clearAllMocks());

  test('keeping several on file goes through the batch route and counts them all', async () => {
    bulkUpdateCastingApplicationStage.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('keep_on_file', ['app-1', 'app-2']); });

    expect(bulkUpdateCastingApplicationStage).toHaveBeenCalledWith(['app-1', 'app-2'], { status: 'kept_on_file' });
    expect(statusOf(qc, 'app-1')).toBe('kept_on_file');
    expect(statusOf(qc, 'app-2')).toBe('kept_on_file');
    expect(toast.success).toHaveBeenCalledWith('2 kept on file', expect.anything());
    expect(hook.result.current.sessionDecided).toBe(2);
  });

  test('passing on several sends one reason for the batch', async () => {
    bulkDeclineApplications.mockResolvedValue({ success: true });
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.decide('pass', ['app-1', 'app-2', 'app-3'], { declineReason: 'board_full' });
    });

    expect(bulkDeclineApplications).toHaveBeenCalledWith(['app-1', 'app-2', 'app-3'], 'board_full');
    expect(toast.success).toHaveBeenCalledWith('Passed on 3', expect.anything());
  });

  test('there is no such thing as a bulk offer', async () => {
    const { qc, hook } = setup();

    let outcome;
    await act(async () => { outcome = await hook.result.current.decide('offer', ['app-1', 'app-2']); });

    expect(outcome).toBe(false);
    expect(acceptApplication).not.toHaveBeenCalled();
    expect(statusOf(qc, 'app-1')).toBe('submitted');
    expect(toast.success).not.toHaveBeenCalled();
  });
});


describe('useBoardDecisions — Undo can only write what an agency may write', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a `pending` prior is restored as its writable equivalent, and says so', async () => {
    shortlistApplication.mockResolvedValue({ success: true });
    updateCastingApplicationStage.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('shortlist', ['app-4']); });
    const undo = toast.success.mock.calls[0][1].action.onClick;
    await act(async () => { await undo(); });

    // `pending` is not in WRITABLE_APPLICATION_STATUSES; `submitted` is the
    // same standing this surface prints as "Filed".
    expect(updateCastingApplicationStage).toHaveBeenCalledWith('app-4', { status: 'submitted' });
    expect(statusOf(qc, 'app-4')).toBe('submitted');
    expect(toast.success).toHaveBeenLastCalledWith('Restored Theo Lane to Filed');
  });

  test('a talent-owned prior gets a toast with no Undo at all', async () => {
    shortlistApplication.mockResolvedValue({ success: true });
    const { hook } = setup();

    await act(async () => { await hook.result.current.decide('shortlist', ['app-5']); });
    expect(toast.success).toHaveBeenCalledWith('Shortlisted Rae Okafor', undefined);

    await act(async () => { await hook.result.current.decide('shortlist', ['app-6']); });
    expect(toast.success).toHaveBeenLastCalledWith('Shortlisted Sol Marin', undefined);
  });

  test('a mixed batch keeps its Undo only when every prior can be written back', async () => {
    bulkUpdateCastingApplicationStage.mockResolvedValue({ success: true });
    const { hook } = setup();

    await act(async () => { await hook.result.current.decide('keep_on_file', ['app-1', 'app-5']); });
    expect(toast.success).toHaveBeenCalledWith('2 kept on file', undefined);
  });

  test('undoing several rows rolls back to one snapshot taken before any write', async () => {
    bulkUpdateCastingApplicationStage.mockResolvedValue({ success: true });
    updateCastingApplicationStage.mockRejectedValue(new Error('nope'));
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('keep_on_file', ['app-1', 'app-2']); });
    const undo = toast.success.mock.calls[0][1].action.onClick;
    await act(async () => { await undo(); });

    // The failed Undo restores the decided state for BOTH rows, not a
    // half-written cache captured mid-loop.
    expect(statusOf(qc, 'app-1')).toBe('kept_on_file');
    expect(statusOf(qc, 'app-2')).toBe('kept_on_file');
    expect(toast.error).toHaveBeenCalled();
  });

  test('a multi-row Undo names the prior standing without counting alone', async () => {
    bulkUpdateCastingApplicationStage.mockResolvedValue({ success: true });
    updateCastingApplicationStage.mockResolvedValue({ success: true });
    const { qc, hook } = setup();

    await act(async () => { await hook.result.current.decide('keep_on_file', ['app-1', 'app-2']); });
    const undo = toast.success.mock.calls[0][1].action.onClick;
    await act(async () => { await undo(); });

    expect(statusOf(qc, 'app-1')).toBe('submitted');
    expect(statusOf(qc, 'app-2')).toBe('shortlisted');
    expect(toast.success).toHaveBeenLastCalledWith('Restored 2 to prior standing');
  });
});

describe('useBoardDecisions — ids are matched as strings', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a numeric legacy id still receives the optimistic standing', async () => {
    shortlistApplication.mockResolvedValue({ success: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['board-candidates', BOARD_ID], {
      board: { id: BOARD_ID },
      stages: [],
      candidates: [{ id: 41, name: 'Legacy Row', backendStatus: 'submitted' }],
    });
    const byId = new Map([['41', { applicationId: '41', name: 'Legacy Row', backendStatus: 'submitted' }]]);
    const wrapper = ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => useBoardDecisions({ boardId: BOARD_ID, vocab: { decided: 'Represented' }, byId }),
      { wrapper },
    );

    await act(async () => { await hook.result.current.decide('shortlist', ['41']); });

    expect(qc.getQueryData(['board-candidates', BOARD_ID]).candidates[0].backendStatus)
      .toBe('shortlisted');
  });
});
