import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CompCardImportOverlay from '../CompCardImportOverlay';
import { talentApi } from '../../../api/talent';

vi.mock('../../../api/talent', () => ({
  talentApi: {
    importCompCard: vi.fn(),
    confirmCompCardImport: vi.fn(),
    discardCompCardImport: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = '';
});

describe('the import overlay', () => {
  test('renders nothing until it is opened', () => {
    render(<CompCardImportOverlay open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('opens as a labelled modal dialog', () => {
    render(<CompCardImportOverlay open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/start from a card you/i)).toBeInTheDocument();
  });

  test('Escape closes it', () => {
    const onClose = vi.fn();
    render(<CompCardImportOverlay open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('the close button closes it', () => {
    const onClose = vi.fn();
    render(<CompCardImportOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('the page behind does not scroll while the dialog is open', () => {
    const { unmount } = render(<CompCardImportOverlay open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  test('discarding closes the overlay rather than resetting it in place', async () => {
    talentApi.importCompCard.mockResolvedValue({
      id: 'import-1',
      source: { method: 'pdf_text' },
      shotTypes: [],
      summary: { found: 1, ambiguous: 0, notFound: 0, total: 1 },
      fields: [
        {
          key: 'first_name',
          label: 'First name',
          group: 'identity',
          status: 'found',
          value: 'Mara',
          display: 'Mara',
          evidence: 'MARA OKONKWO',
          confidence: 'high',
        },
      ],
    });
    talentApi.discardCompCardImport.mockResolvedValue({});

    const onClose = vi.fn();
    render(<CompCardImportOverlay open onClose={onClose} />);

    const file = new File(['card'], 'card.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    await screen.findByText(/what the card/i);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(talentApi.discardCompCardImport).toHaveBeenCalledWith('import-1');
  });
});
