import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { DeclineReasonModal } from '../DeclineReasonModal';
import { getDeclineReasons } from '../../../api/agency';

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getDeclineReasons: vi.fn() };
});

// Deliberately distinct label vs. talentMessage per reason, the way the real
// vocabulary (services/decline-reasons.js) is shaped, so a test that showed
// the label where the message belongs (or vice versa) would fail loudly.
const REASONS = [
  {
    id: 'board_full',
    label: 'Board is full',
    talentMessage: 'Their board is full at the moment, so they are not taking on new talent in this division right now.',
  },
  {
    id: 'materials',
    label: 'Could not assess from the materials',
    talentMessage: 'They could not assess your submission from the materials sent.',
  },
];

function renderModal(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeclineReasonModal
        open
        talentName="Jamie Rivera"
        onConfirm={onConfirm}
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onConfirm, onClose };
}

describe('DeclineReasonModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeclineReasons.mockResolvedValue(REASONS);
  });

  test('declining without picking a reason still works and sends null', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await screen.findByText('Board is full');
    // "No reason" is the default selection — no extra click required.
    await user.click(screen.getByRole('button', { name: 'Pass' }));

    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  test('picking a reason sends its id and previews the talent-facing message, not the agency label', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await screen.findByText('Board is full');
    await user.click(screen.getByText('Board is full'));

    // The preview is the verbatim sentence the talent will read...
    expect(screen.getByText(REASONS[0].talentMessage)).toBeInTheDocument();
    // ...and it is not a repeat of the agency-facing label standing in for it.
    expect(screen.getByText(REASONS[0].talentMessage)).not.toHaveTextContent(REASONS[0].label);

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    expect(onConfirm).toHaveBeenCalledWith('board_full');
  });
});
