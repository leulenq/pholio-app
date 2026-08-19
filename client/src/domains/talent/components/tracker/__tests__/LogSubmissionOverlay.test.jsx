import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../api/talent', () => ({
  talentApi: {
    logTrackedSubmission: vi.fn(),
    getSpecRegistryRoutes: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LogSubmissionOverlay from '../LogSubmissionOverlay';
import { talentApi } from '../../../api/talent';

function renderOverlay(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LogSubmissionOverlay open onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = '';
  talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
  talentApi.logTrackedSubmission.mockResolvedValue({ id: 'trk-1' });
});

describe('logging an off-platform submission', () => {
  test('renders nothing until it is opened', () => {
    renderOverlay({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('opens as a labelled modal that says who can see the record', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog', { name: /log a submission/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/private to you, and no agency is contacted/i)).toBeInTheDocument();
  });

  test('Escape and the close button both close it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderOverlay({ onClose });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('will not send without an agency name', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: /log submission/i }));

    expect(await screen.findByText('Name the agency you submitted to.')).toBeInTheDocument();
    expect(talentApi.logTrackedSubmission).not.toHaveBeenCalled();
  });

  test('refuses a date the talent has not reached yet', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.type(screen.getByLabelText('Agency'), 'Muse Management');
    const date = screen.getByLabelText(/date sent/i);
    await user.clear(date);
    await user.type(date, '2099-01-01');
    await user.click(screen.getByRole('button', { name: /log submission/i }));

    expect(await screen.findByText('That date is still ahead of you.')).toBeInTheDocument();
    expect(talentApi.logTrackedSubmission).not.toHaveBeenCalled();
  });

  test('refuses a link that is not a real address', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.type(screen.getByLabelText('Agency'), 'Muse Management');
    await user.type(screen.getByLabelText(/link/i), 'musenyc.com');
    await user.click(screen.getByRole('button', { name: /log submission/i }));

    expect(
      await screen.findByText('Use the full address, starting with https://'),
    ).toBeInTheDocument();
    expect(talentApi.logTrackedSubmission).not.toHaveBeenCalled();
  });

  test('sends the entry, defaulting the date to today and omitting empty fields', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onLogged = vi.fn();
    renderOverlay({ onClose, onLogged });

    await user.type(screen.getByLabelText('Agency'), 'Muse Management');
    await user.selectOptions(screen.getByLabelText(/how you sent it/i), 'official_email');
    await user.click(screen.getByRole('button', { name: /log submission/i }));

    await waitFor(() => expect(talentApi.logTrackedSubmission).toHaveBeenCalled());
    const payload = talentApi.logTrackedSubmission.mock.calls[0][0];
    expect(payload).toMatchObject({ agencyName: 'Muse Management', channel: 'official_email' });
    expect(payload.submittedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload).not.toHaveProperty('note');
    expect(payload).not.toHaveProperty('destinationUrl');
    expect(payload).not.toHaveProperty('seriesId');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onLogged).toHaveBeenCalledWith({ id: 'trk-1' });
  });

  test('ties the row to a published spec when the name is one Pholio tracks', async () => {
    const user = userEvent.setup();
    talentApi.getSpecRegistryRoutes.mockResolvedValue({
      routes: [{ seriesId: 'muse-ny:online', agencyName: 'Muse Management' }],
    });
    renderOverlay();

    await waitFor(() => expect(talentApi.getSpecRegistryRoutes).toHaveBeenCalled());
    await user.type(screen.getByLabelText('Agency'), 'muse management');
    await user.click(screen.getByRole('button', { name: /log submission/i }));

    await waitFor(() => expect(talentApi.logTrackedSubmission).toHaveBeenCalled());
    expect(talentApi.logTrackedSubmission.mock.calls[0][0].seriesId).toBe('muse-ny:online');
  });

  test('surfaces a server refusal in the form instead of losing the entry', async () => {
    const user = userEvent.setup();
    talentApi.logTrackedSubmission.mockRejectedValue(new Error('submittedOn cannot be in the future.'));
    renderOverlay();

    await user.type(screen.getByLabelText('Agency'), 'Muse Management');
    await user.click(screen.getByRole('button', { name: /log submission/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'submittedOn cannot be in the future.',
    );
  });

  test('the page behind does not scroll while the dialog is open', () => {
    const { unmount } = renderOverlay();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  test('the note field cannot be dragged open', () => {
    renderOverlay();
    expect(screen.getByLabelText(/note/i).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/note/i)).toHaveClass('pholio-textarea');
  });
});
