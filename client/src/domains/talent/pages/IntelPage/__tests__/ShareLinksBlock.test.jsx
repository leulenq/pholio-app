import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ShareLinksBlock from '../blocks/ShareLinksBlock';
import { talentApi } from '../../../api/talent';

/* `Block` animates with framer-motion's `whileInView`, which needs an
   IntersectionObserver jsdom does not provide. The block is always in view for
   these assertions, so the stub reports exactly that. */
class ImmediateIntersectionObserver {
  constructor(callback) { this.callback = callback; }
  observe(target) { this.callback([{ isIntersecting: true, target }], this); }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);

vi.mock('../../../api/talent', () => ({
  talentApi: {
    getShareTokens: vi.fn(),
    createShareToken: vi.fn(),
    revokeShareToken: vi.fn(),
  },
}));

function renderBlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ShareLinksBlock />
    </QueryClientProvider>,
  );
}

const token = (overrides = {}) => ({
  id: 't1',
  token: 'abc123',
  label: 'Marilyn Agency',
  kind: 'portfolio',
  open_count: 0,
  first_opened_at: null,
  last_opened_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  url: '/portfolio/ada?st=abc123',
  ...overrides,
});

describe('ShareLinksBlock', () => {
  beforeEach(() => vi.clearAllMocks());

  test('an unopened link says so plainly, and is not flagged as a problem', async () => {
    talentApi.getShareTokens.mockResolvedValue({ tokens: [token()] });
    renderBlock();

    await waitFor(() => expect(screen.getByText('Marilyn Agency')).toBeInTheDocument());
    expect(screen.getByText('Not opened yet')).toBeInTheDocument();
    // Silence from an agency is ordinary; the copy says so rather than
    // implying the talent did something wrong.
    expect(screen.getByText(/ordinary/i)).toBeInTheDocument();
  });

  test('names who opened it, which is the whole point of one link per recipient', async () => {
    talentApi.getShareTokens.mockResolvedValue({
      tokens: [token({ open_count: 3, last_opened_at: '2026-08-20T10:00:00.000Z' })],
    });
    renderBlock();

    await waitFor(() => expect(screen.getByText('Marilyn Agency')).toBeInTheDocument());
    expect(screen.getByText(/3 opens/)).toBeInTheDocument();
  });

  test('a single open reads as one open, not "1 opens"', async () => {
    talentApi.getShareTokens.mockResolvedValue({
      tokens: [token({ open_count: 1, first_opened_at: '2026-08-20T10:00:00.000Z' })],
    });
    renderBlock();

    await waitFor(() => expect(screen.getByText(/^Opened /)).toBeInTheDocument());
  });

  test('minting requires a recipient name — an unnamed link tells you nothing', async () => {
    talentApi.getShareTokens.mockResolvedValue({ tokens: [] });
    const user = userEvent.setup();
    renderBlock();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create link/i })).toBeDisabled(),
    );

    await user.type(screen.getByRole('textbox'), 'Ford Models');
    expect(screen.getByRole('button', { name: /create link/i })).toBeEnabled();
  });

  test('creates the link with the recipient name', async () => {
    talentApi.getShareTokens.mockResolvedValue({ tokens: [] });
    talentApi.createShareToken.mockResolvedValue({ token: token() });
    const user = userEvent.setup();
    renderBlock();

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());
    await user.type(screen.getByRole('textbox'), 'Ford Models');
    await user.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() =>
      expect(talentApi.createShareToken).toHaveBeenCalledWith({ label: 'Ford Models' }),
    );
  });

  test('revokes a link', async () => {
    talentApi.getShareTokens.mockResolvedValue({ tokens: [token()] });
    talentApi.revokeShareToken.mockResolvedValue({ revoked: true });
    const user = userEvent.setup();
    renderBlock();

    await waitFor(() => expect(screen.getByText('Marilyn Agency')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /revoke the link for Marilyn Agency/i }));

    await waitFor(() => expect(talentApi.revokeShareToken).toHaveBeenCalledWith('t1'));
  });

  test('with no links at all it explains what a link is for', async () => {
    talentApi.getShareTokens.mockResolvedValue({ tokens: [] });
    renderBlock();

    await waitFor(() =>
      expect(screen.getByText(/turns an open into an answer/i)).toBeInTheDocument(),
    );
  });
});
