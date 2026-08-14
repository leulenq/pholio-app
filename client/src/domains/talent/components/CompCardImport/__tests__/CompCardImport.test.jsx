import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CompCardImport from '../CompCardImport';
import { talentApi } from '../../../api/talent';

vi.mock('../../../api/talent', () => ({
  talentApi: {
    importCompCard: vi.fn(),
    confirmCompCardImport: vi.fn(),
    discardCompCardImport: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const proposalWith = (overrides = {}) => ({
  id: 'import-1',
  source: { method: 'pdf_text' },
  shotTypes: [],
  summary: { found: 2, ambiguous: 1, notFound: 1, total: 4 },
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
    {
      key: 'height_cm',
      label: 'Height',
      group: 'measurements',
      status: 'found',
      value: 178,
      display: '178 cm',
      evidence: 'HEIGHT 178',
      confidence: 'medium',
    },
    {
      key: 'waist_cm',
      label: 'Waist',
      group: 'measurements',
      status: 'ambiguous',
      value: null,
      evidence: 'WAIST 52',
      options: [
        { label: '52 in (132.1 cm)', value: 132.1, unit: 'in' },
        { label: '52 cm', value: 52, unit: 'cm' },
      ],
    },
    {
      key: 'hips_cm',
      label: 'Hips',
      group: 'measurements',
      status: 'not_found',
      value: null,
      evidence: null,
    },
  ],
  ...overrides,
});

function uploadCard() {
  const file = new File(['card'], 'card.pdf', { type: 'application/pdf' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the review screen', () => {
  test('found fields are offered pre-selected, with the line they came from', async () => {
    talentApi.importCompCard.mockResolvedValue(proposalWith());
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/what the card/i);

    expect(screen.getByLabelText('First name value')).toHaveValue('Mara');
    expect(screen.getByText(/on the card: MARA OKONKWO/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /first name/i })).toBeChecked();
  });

  test('an ambiguous field starts unselected and is not counted as applied', async () => {
    talentApi.importCompCard.mockResolvedValue(proposalWith());
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/needs your answer/i);

    // Both readings offered, neither chosen — the product does not pick a unit.
    expect(screen.getByRole('button', { name: '52 in (132.1 cm)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: '52 cm' })).toHaveAttribute('aria-pressed', 'false');

    // Only the two found fields are in the apply count.
    expect(screen.getByRole('button', { name: /apply 2 fields/i })).toBeInTheDocument();
  });

  test('choosing a reading adds it, and confirm posts only what was accepted', async () => {
    talentApi.importCompCard.mockResolvedValue(proposalWith());
    talentApi.confirmCompCardImport.mockResolvedValue({ applied: ['first_name', 'waist_cm'] });
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/needs your answer/i);

    fireEvent.click(screen.getByRole('button', { name: '52 cm' }));
    expect(screen.getByRole('button', { name: /apply 3 fields/i })).toBeInTheDocument();

    // Drop one of the found fields to prove only the checked ones are sent.
    fireEvent.click(screen.getByRole('checkbox', { name: /height/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply 2 fields/i }));

    await waitFor(() => expect(talentApi.confirmCompCardImport).toHaveBeenCalled());
    const [importId, accepted] = talentApi.confirmCompCardImport.mock.calls[0];
    expect(importId).toBe('import-1');
    expect(accepted).toEqual({ first_name: 'Mara', waist_cm: 52 });
    expect(accepted).not.toHaveProperty('height_cm');
    expect(accepted).not.toHaveProperty('hips_cm');
  });

  test('fields the card did not carry are named rather than silently omitted', async () => {
    talentApi.importCompCard.mockResolvedValue(proposalWith());
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/not on the card/i);
    expect(screen.getByText(/Hips\./)).toBeInTheDocument();
  });

  test('measurement provenance is stated before anything is applied', async () => {
    talentApi.importCompCard.mockResolvedValue(proposalWith());
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/declared on import, not measured today/i);
  });

  test('shot types are shown as guidance and explicitly not imported', async () => {
    talentApi.importCompCard.mockResolvedValue(
      proposalWith({ shotTypes: ['headshot', 'full_length'] }),
    );
    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/shots your card shows/i);
    expect(screen.getByText(/no shoot date/i)).toBeInTheDocument();
  });
});

describe('the flow never dead-ends', () => {
  test('an unreadable card still reaches a screen that points at manual entry', async () => {
    talentApi.importCompCard.mockResolvedValue({
      id: 'import-2',
      source: { method: 'none', reason: 'pdf_no_text_layer' },
      message: 'That PDF has no readable text — it was saved as a flat image.',
      shotTypes: [],
      summary: { found: 0, ambiguous: 0, notFound: 4, total: 4 },
      fields: proposalWith().fields.map((field) => ({
        ...field,
        status: 'not_found',
        value: null,
      })),
    });

    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/no readable text/i);
    expect(screen.getByText(/not on the card/i)).toBeInTheDocument();
    // Nothing to apply, and the button says so rather than pretending.
    expect(screen.getByRole('button', { name: /nothing selected/i })).toBeDisabled();
  });

  test('a request failure lands on the same review screen, not an error state', async () => {
    talentApi.importCompCard.mockRejectedValue(new Error('Server exploded'));

    render(<CompCardImport />);
    uploadCard();

    await screen.findByText(/fill your details in on the form below/i);
  });
});
