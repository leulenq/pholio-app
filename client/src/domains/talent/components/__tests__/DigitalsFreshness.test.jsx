import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DigitalsFreshness from '../DigitalsFreshness';
import { talentApi } from '../../api/talent';

vi.mock('../../api/talent', () => ({
  talentApi: { getDigitalsFreshness: vi.fn(), setDigitalsCaptureDate: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** The server's freshness payload — the single source of truth this reads. */
const freshness = ({ state, guidance, undatedImageIds = [], hasDigitals = true }) => ({
  state,
  guidance,
  hasDigitals,
  sets: [
    {
      images: undatedImageIds.map((imageId) => ({ imageId, state: 'undated' })),
    },
  ],
});

function renderWith(payload) {
  talentApi.getDigitalsFreshness.mockResolvedValue(payload);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DigitalsFreshness />
    </QueryClientProvider>,
  );
}

function renderWithProps(payload, props) {
  talentApi.getDigitalsFreshness.mockResolvedValue(payload);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DigitalsFreshness {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('the four states are reported honestly', () => {
  test('an undated set is never labelled current', async () => {
    // The regression this component exists for. The previous note derived its
    // text from `isStale`, which is false for an undated set, and printed
    // "Current — within the 3-month window" over the top of an engine that had
    // explicitly refused to call it current.
    renderWith(
      freshness({
        state: 'undated',
        guidance: 'Some of these have no shoot date, so this set cannot be called current.',
        undatedImageIds: ['img-1'],
      }),
    );

    expect(await screen.findByText('Undated')).toBeInTheDocument();
    expect(screen.queryByText(/^Current$/)).toBeNull();
    expect(screen.getByText(/cannot be called current/i)).toBeInTheDocument();
  });

  test.each([
    ['current', 'Current'],
    ['aging', 'Aging'],
    ['stale', 'Stale'],
  ])('%s renders its own state and the engine guidance', async (state, label) => {
    renderWith(freshness({ state, guidance: `guidance for ${state}` }));
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText(`guidance for ${state}`)).toBeInTheDocument();
  });

  test('a set with no digitals at all renders nothing', async () => {
    const { container } = renderWith(
      freshness({ state: 'undated', guidance: 'none', hasDigitals: false }),
    );
    await waitFor(() => expect(talentApi.getDigitalsFreshness).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('dating an undated set', () => {
  test('the action only appears where there is something to date', async () => {
    renderWith(freshness({ state: 'current', guidance: 'fine' }));
    expect(await screen.findByText('Current')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add the shoot date/i })).toBeNull();
  });

  test('the date cannot be set in the future', async () => {
    renderWith(freshness({ state: 'undated', guidance: 'g', undatedImageIds: ['a'] }));
    fireEvent.click(await screen.findByRole('button', { name: /add the shoot date/i }));

    const input = screen.getByLabelText(/when were these taken/i);
    // The server refuses a future date; the control should not offer one either.
    expect(input).toHaveAttribute('max', new Date().toISOString().slice(0, 10));
  });

  test('submitting sends the undated frames and the chosen date', async () => {
    talentApi.setDigitalsCaptureDate.mockResolvedValue({
      dated: ['a', 'b'],
      freshness: freshness({ state: 'current', guidance: 'ok' }),
    });
    const onDated = vi.fn();

    renderWithProps(
      freshness({ state: 'undated', guidance: 'g', undatedImageIds: ['a', 'b'] }),
      { onDated },
    );

    fireEvent.click(await screen.findByRole('button', { name: /add the shoot date/i }));
    fireEvent.change(screen.getByLabelText(/when were these taken/i), {
      target: { value: '2026-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /date 2 frames/i }));

    await waitFor(() => expect(talentApi.setDigitalsCaptureDate).toHaveBeenCalled());
    expect(talentApi.setDigitalsCaptureDate).toHaveBeenCalledWith(['a', 'b'], '2026-06-01');
    await waitFor(() => expect(onDated).toHaveBeenCalled());
  });

  test('a rejected date leaves the form open rather than losing the input', async () => {
    talentApi.setDigitalsCaptureDate.mockRejectedValue(new Error('A shoot date cannot be in the future.'));

    renderWith(freshness({ state: 'undated', guidance: 'g', undatedImageIds: ['a'] }));

    fireEvent.click(await screen.findByRole('button', { name: /add the shoot date/i }));
    fireEvent.change(screen.getByLabelText(/when were these taken/i), {
      target: { value: '2026-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /date 1 frame/i }));

    await waitFor(() => expect(talentApi.setDigitalsCaptureDate).toHaveBeenCalled());
    expect(screen.getByLabelText(/when were these taken/i)).toHaveValue('2026-06-01');
  });
});
