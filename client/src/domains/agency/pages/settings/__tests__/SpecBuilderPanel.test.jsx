import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SpecBuilderPanel from '../SpecBuilderPanel';
import { getSpecBuilder, publishSpecDraft, saveSpecDraft } from '../../../api/agency';

vi.mock('../../../api/agency', () => ({
  getSpecBuilder: vi.fn(),
  saveSpecDraft: vi.fn(),
  publishSpecDraft: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const VOCABULARY = {
  groups: {
    shots: [
      {
        id: 'shot.frame',
        label: 'Shot frame',
        valueType: 'string',
        allowedValues: [
          { id: 'close_up', label: 'Close-up' },
          { id: 'full_length', label: 'Full length' },
        ],
      },
    ],
    presentation: [
      {
        id: 'appearance.makeup_level',
        label: 'Makeup level',
        valueType: 'string',
        allowedValues: [{ id: 'none', label: 'None' }],
      },
    ],
    files: [{ id: 'file.size_bytes', label: 'File size', valueType: 'number', allowedValues: [] }],
    eligibility: [
      { id: 'applicant.height_cm', label: 'Height', valueType: 'number', allowedValues: [] },
    ],
  },
  scopeFields: [
    {
      id: 'applicant.gender',
      label: 'Gender',
      valueType: 'string',
      allowedValues: [{ id: 'female', label: 'Female' }],
    },
  ],
  refused: [
    { id: 'applicant.nationality', reason: 'Nationality is a protected characteristic.' },
    { id: 'appearance.hair_color', reason: 'Hair colour is a personal characteristic.' },
  ],
};

const EMPTY_DRAFT = {
  version: 1,
  office: { id: null, name: null },
  market: { kind: 'unspecified', code: null, countryCodes: [], city: null },
  shots: { allowImageReuseAcrossSlots: null, slots: [] },
  presentation: [],
  files: [],
  eligibility: [],
  notes: null,
};

function builderState(overrides = {}) {
  return {
    seriesId: 'agency:northlight:open-call',
    vocabulary: VOCABULARY,
    draft: EMPTY_DRAFT,
    hasUnpublishedChanges: false,
    published: null,
    openCall: { code: 'ABC123', url: 'https://app.pholio.studio/opencall/ABC123' },
    advisoryOnly: true,
    ...overrides,
  };
}

function renderPanel(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SpecBuilderPanel canManage {...props} />
    </QueryClientProvider>,
  );
}

describe('SpecBuilderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSpecBuilder.mockResolvedValue(builderState());
    saveSpecDraft.mockImplementation(async (draft) => ({ ...builderState({ draft }), issues: [] }));
    publishSpecDraft.mockResolvedValue({ published: true, revision: 1, ...builderState() });
  });

  test('states plainly that requirements never block a submission', async () => {
    renderPanel();
    await screen.findByText(/What your applicants should send/i);
    expect(screen.getByText(/anyone can still submit/i)).toBeInTheDocument();
  });

  test('renders every authorable group with an empty state', async () => {
    renderPanel();
    await screen.findByText('Shots');
    for (const title of [
      'Shots',
      'How the pictures should look',
      'File limits',
      'Who this is for',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Nothing set/i).length).toBe(4);
  });

  test('adding a shot saves a draft to the server', async () => {
    renderPanel();
    const add = await screen.findByRole('button', { name: /Add a shot/i });
    fireEvent.click(add);

    await waitFor(() => expect(saveSpecDraft).toHaveBeenCalled());
    const saved = saveSpecDraft.mock.calls.at(-1)[0];
    expect(saved.shots.slots).toHaveLength(1);
    expect(saved.shots.slots[0].field).toBe('shot.frame');
  });

  test('offers only fields the agency is allowed to require', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Add a requirement/i }));

    const fieldSelects = await screen.findAllByLabelText('Field');
    const options = Array.from(fieldSelects.at(-1).options).map((option) => option.value);
    expect(options).toContain('applicant.height_cm');
    expect(options).not.toContain('applicant.nationality');
    expect(options).not.toContain('appearance.hair_color');
  });

  test('explains why a refused field is absent instead of hiding it', async () => {
    renderPanel();
    const disclosure = await screen.findByRole('button', { name: /Why can.t I require/i });
    fireEvent.click(disclosure);

    expect(screen.getByText(/Nationality is a protected characteristic/i)).toBeInTheDocument();
    expect(screen.getByText(/Hair colour is a personal characteristic/i)).toBeInTheDocument();
  });

  test('an eligibility rule can be scoped to a declared gender', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Add a requirement/i }));

    const scope = await screen.findByLabelText('Applies to');
    expect(Array.from(scope.options).map((option) => option.value)).toEqual([
      '',
      'applicant.gender',
    ]);
  });

  test('asks for an open call link before requirements can be published', async () => {
    getSpecBuilder.mockResolvedValue(builderState({ openCall: null }));
    renderPanel();

    expect(await screen.findByText(/Create an open call link first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish requirements/i })).toBeDisabled();
  });

  test('surfaces publish validation problems returned by the server', async () => {
    publishSpecDraft.mockRejectedValue({
      data: {
        message: 'These requirements cannot be published yet.',
        details: [{ code: 'shots', location: '/shots/1', message: 'Choose a value for this shot.' }],
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Publish requirements/i }));
    expect(await screen.findByText(/Choose a value for this shot/i)).toBeInTheDocument();
  });

  test('reports the published revision and its re-confirmation date', async () => {
    getSpecBuilder.mockResolvedValue(
      builderState({
        published: {
          revisionId: 'agency:northlight:open-call@2',
          revision: 2,
          publishedOn: '2026-08-11',
          nextReviewOn: '2027-08-11',
          evaluationMode: 'advisory',
        },
        hasUnpublishedChanges: true,
      }),
    );
    renderPanel();

    expect(await screen.findByText(/Revision 2 on 2026-08-11/)).toBeInTheDocument();
    expect(screen.getByText('2027-08-11')).toBeInTheDocument();
    expect(screen.getByText(/publish to make them live/i)).toBeInTheDocument();
  });

  test('a member without manage rights sees no editing controls', async () => {
    getSpecBuilder.mockResolvedValue(
      builderState({
        draft: {
          ...EMPTY_DRAFT,
          shots: {
            allowImageReuseAcrossSlots: null,
            slots: [
              {
                id: 'close-up',
                label: 'Close-up',
                field: 'shot.frame',
                value: 'close_up',
                minimum: 1,
                maximum: 1,
                modality: 'required',
              },
            ],
          },
        },
      }),
    );
    renderPanel({ canManage: false });

    const wording = await screen.findByLabelText('Your wording');
    expect(wording).toHaveValue('Close-up');
    expect(wording).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Add a shot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish requirements/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove this rule/i })).not.toBeInTheDocument();
  });
});
