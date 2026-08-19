import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import OpenCallPanel from '../OpenCallPanel';
import {
  createOpenCallLink,
  getOpenCallLinks,
  updateOpenCallLink,
} from '../../../api/agency';

vi.mock('../../../api/agency', () => ({
  getOpenCallLinks: vi.fn(),
  createOpenCallLink: vi.fn(),
  updateOpenCallLink: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BRIEFED_LINK = {
  id: 'link-1',
  code: 'ABC123',
  label: 'Website',
  status: 'active',
  arrivals: 12,
  claims: 5,
  submissions: 3,
  needsBrief: false,
  closedByDeadline: false,
  brief: {
    who: "New faces for our women's board.",
    what: 'Four digitals.',
    eligibility: null,
    nextSteps: 'We reply within 30 days.',
    deadline: '2026-09-30',
    ongoing: false,
  },
};

const LEGACY_LINK = {
  id: 'link-2',
  code: 'OLD999',
  label: 'Scouting email',
  status: 'active',
  arrivals: 40,
  claims: 9,
  submissions: 7,
  needsBrief: true,
  closedByDeadline: false,
  brief: null,
};

function renderPanel(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OpenCallPanel canManage {...props} />
    </QueryClientProvider>,
  );
}

// The create form and an open inline editor are on screen together, which is
// exactly what the field id prefix exists to disambiguate.
function fillBrief(prefix) {
  const set = (key, value) =>
    fireEvent.change(document.getElementById(`${prefix}-${key}`), { target: { value } });
  set('who', "New faces for our women's board, London.");
  set('what', 'Four digitals: close-up, profile, waist-up, full length.');
  set('nextSteps', 'We review weekly and reply within 30 days, either way.');
}

describe('OpenCallPanel — brief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOpenCallLinks.mockResolvedValue([BRIEFED_LINK, LEGACY_LINK]);
    createOpenCallLink.mockResolvedValue({ id: 'new' });
    updateOpenCallLink.mockResolvedValue({ id: 'link-2' });
  });

  test('creating a link submits the brief with it', async () => {
    renderPanel();
    await screen.findByText('Live links');

    fireEvent.change(screen.getByLabelText('Link label'), {
      target: { value: 'Spring scouting' },
    });
    fillBrief('new-brief');
    fireEvent.change(screen.getAllByLabelText('Closing date')[0], {
      target: { value: '2026-12-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create link/i }));

    await waitFor(() => expect(createOpenCallLink).toHaveBeenCalled());
    const [label, brief] = createOpenCallLink.mock.calls.at(-1);
    expect(label).toBe('Spring scouting');
    expect(brief.who).toMatch(/New faces/);
    expect(brief.nextSteps).toMatch(/30 days/);
    expect(brief.deadline).toBe('2026-12-01');
    expect(brief.ongoing).toBe(false);
  });

  test('a continuously running call clears the date', async () => {
    renderPanel();
    await screen.findByText('Live links');

    fireEvent.change(screen.getByLabelText('Link label'), { target: { value: 'Always on' } });
    fillBrief('new-brief');
    fireEvent.change(screen.getAllByLabelText('Closing date')[0], { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Runs continuously/i })[0]);

    expect(screen.queryAllByLabelText('Closing date')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Create link/i }));
    await waitFor(() => expect(createOpenCallLink).toHaveBeenCalled());
    const [, brief] = createOpenCallLink.mock.calls.at(-1);
    expect(brief.ongoing).toBe(true);
    expect(brief.deadline).toBe('');
  });

  test('reports a published brief and its closing date on the link', async () => {
    renderPanel();
    expect(await screen.findByText(/Brief published · closes 2026-09-30/)).toBeInTheDocument();
  });

  // Links predate the brief. They keep working, and are told they are missing one.
  test('names a link that has no brief instead of implying it is complete', async () => {
    renderPanel();
    expect(
      await screen.findByText(/No brief yet\. Applicants arriving here are told nothing/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add brief/i })).toBeInTheDocument();
  });

  test('an existing link can have its brief added in place', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Add brief/i }));

    fillBrief('brief-link-2');
    fireEvent.click(screen.getAllByRole('button', { name: /Runs continuously/i }).at(-1));
    fireEvent.click(screen.getByRole('button', { name: /Save brief/i }));

    await waitFor(() => expect(updateOpenCallLink).toHaveBeenCalled());
    const [linkId, payload] = updateOpenCallLink.mock.calls.at(-1);
    expect(linkId).toBe('link-2');
    expect(payload.brief.ongoing).toBe(true);
    expect(payload.brief.who).toMatch(/New faces/);
  });

  test('a link closed by its deadline says it takes nothing more', async () => {
    getOpenCallLinks.mockResolvedValue([
      {
        ...BRIEFED_LINK,
        closedByDeadline: true,
        brief: { ...BRIEFED_LINK.brief, deadline: '2026-08-01' },
      },
    ]);
    renderPanel();
    expect(
      await screen.findByText(/Closed 2026-08-01 — this link no longer takes submissions/),
    ).toBeInTheDocument();
  });

  test('a member without manage rights cannot edit a brief', async () => {
    renderPanel({ canManage: false });
    await screen.findByText('Live links');
    expect(screen.queryByRole('button', { name: /Add brief/i })).not.toBeInTheDocument();
    expect(document.getElementById('new-brief-who')).toBeNull();
  });
});
