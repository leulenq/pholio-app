import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ExportWebhookPanel from '../ExportWebhookPanel';
import {
  getExportWebhook,
  saveExportWebhook,
  deleteExportWebhook,
} from '../../../api/agency';

vi.mock('../../../api/agency', () => ({
  getExportWebhook: vi.fn(),
  saveExportWebhook: vi.fn(),
  deleteExportWebhook: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExportWebhookPanel canManage={canManage} />
    </QueryClientProvider>,
  );
}

const configured = (overrides = {}) => ({
  webhook: {
    url: 'https://hooks.example.com/pholio',
    hasSecret: true,
    active: true,
    disabledAt: null,
    lastDeliveredAt: null,
    lastStatusCode: null,
    lastError: null,
    consecutiveFailures: 0,
    ...overrides,
  },
  available: true,
});

describe('ExportWebhookPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  test('shows the secret exactly once, when it is issued', async () => {
    getExportWebhook.mockResolvedValue({ webhook: null, available: true });
    saveExportWebhook.mockResolvedValue({
      webhook: configured().webhook,
      secret: 'deadbeef'.repeat(8),
    });
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());
    await user.type(screen.getByRole('textbox'), 'https://hooks.example.com/pholio');
    await user.click(screen.getByRole('button', { name: /start sending/i }));

    await waitFor(() =>
      expect(screen.getByText('deadbeef'.repeat(8))).toBeInTheDocument(),
    );
  });

  test('never redisplays a stored secret — only that one exists', async () => {
    // A settings screen that echoes the secret puts it in every screenshot.
    getExportWebhook.mockResolvedValue(configured());
    renderPanel();

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://hooks.example.com/pholio')).toBeInTheDocument(),
    );
    // The heading only appears when a secret has just been issued; a stored one
    // is never echoed back. (The phrase itself does appear in the rotate
    // checkbox label, which is why this checks for the block, not the words.)
    expect(
      screen.queryByRole('heading', { name: /signing secret/i }),
    ).not.toBeInTheDocument();
  });

  test('reports a failure in the endpoint\'s own words', async () => {
    getExportWebhook.mockResolvedValue(
      configured({ lastError: 'Endpoint returned 500.', lastStatusCode: 500 }),
    );
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(/Endpoint returned 500/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/\(500\)/)).toBeInTheDocument();
  });

  test('says plainly when delivery was auto-disabled, and how to resume', async () => {
    getExportWebhook.mockResolvedValue(
      configured({ disabledAt: '2026-08-20T00:00:00.000Z', consecutiveFailures: 10 }),
    );
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(/paused after repeated failures/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Save again/i)).toBeInTheDocument();
  });

  test('rotating the secret is an explicit choice, and warns what it breaks', async () => {
    getExportWebhook.mockResolvedValue(configured());
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('checkbox')).toBeInTheDocument(),
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/start failing until you update it/i)).toBeInTheDocument();
  });

  test('a member who cannot manage the org sees it read-only', async () => {
    getExportWebhook.mockResolvedValue(configured());
    renderPanel(false);

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://hooks.example.com/pholio')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save destination/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('https://hooks.example.com/pholio')).toBeDisabled();
  });

  test('says so when the feature has not been migrated yet, rather than erroring', async () => {
    getExportWebhook.mockResolvedValue({ webhook: null, available: false });
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(/briefly unavailable/i)).toBeInTheDocument(),
    );
  });

  test('removes the destination', async () => {
    getExportWebhook.mockResolvedValue(configured());
    deleteExportWebhook.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(deleteExportWebhook).toHaveBeenCalled());
  });
});
