import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MessagePage } from '../ApplyExperience';
import { talentApi } from '../../../api/talent';

// Mock framer-motion to render static markup
vi.mock('framer-motion', () => {
  const tagCache = new Map();
  const passthroughFor = (tag) => {
    if (!tagCache.has(tag)) {
      const Tag = tag;
      const Passthrough = ({ children, ...props }) => <Tag {...props}>{children}</Tag>;
      Passthrough.displayName = `motion.${tag}`;
      tagCache.set(tag, Passthrough);
    }
    return tagCache.get(tag);
  };
  return {
    motion: new Proxy({}, { get: (_target, tag) => passthroughFor(String(tag)) }),
    AnimatePresence: ({ children }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

// Mock talentApi
vi.mock('../../../api/talent', () => ({
  talentApi: {
    draftSubmissionNote: vi.fn(),
    sharpenSubmissionNote: vi.fn(),
    shortenSubmissionNote: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Apply Workspace MessagePage with BioWriter', () => {
  const mockAgency = {
    id: 'agency-123',
    name: 'Elite Model Management',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders letterhead, placeholder, and empty word count', () => {
    render(
      <MessagePage
        agency={mockAgency}
        note=""
        onNoteChange={vi.fn()}
        boardLabels={['Women']}
        digitalsCount={4}
        compCardName="Editorial Card"
      />,
    );

    expect(screen.getByText('Elite Model Management')).toBeInTheDocument();
    expect(screen.getByText(/women board/i)).toBeInTheDocument();
    expect(screen.getByText(/4 digitals/i)).toBeInTheDocument();
    expect(screen.getByText(/comp card/i)).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Introduce yourself, name the representation/i),
    ).toBeInTheDocument();
  });

  test('shows draft action and length options popover on hover', async () => {
    const user = userEvent.setup();
    render(
      <MessagePage
        agency={mockAgency}
        note=""
        onNoteChange={vi.fn()}
      />,
    );

    const magicButton = screen.getByRole('button', { name: /draft a note with pholio/i });
    expect(magicButton).toBeInTheDocument();

    // Hover reveals the options popover
    await user.hover(magicButton);
    expect(screen.getByRole('dialog', { name: /pholio note writer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tight$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^standard$/i })).toBeInTheDocument();
  });

  test('drafts a note when magic button is clicked', async () => {
    const onNoteChange = vi.fn();
    const user = userEvent.setup();
    talentApi.draftSubmissionNote.mockResolvedValue({
      note: 'Hello, I am Jane Doe submitting for representation.',
    });

    render(
      <MessagePage
        agency={mockAgency}
        note=""
        onNoteChange={onNoteChange}
        boardLabels={['Women']}
      />,
    );

    const magicButton = screen.getByRole('button', { name: /draft a note with pholio/i });
    await user.click(magicButton);

    await waitFor(() => {
      expect(talentApi.draftSubmissionNote).toHaveBeenCalledWith({
        agencyId: 'agency-123',
        agencyName: 'Elite Model Management',
        targetBoards: ['Women'],
        note: undefined,
      });
      expect(onNoteChange).toHaveBeenCalledWith('Hello, I am Jane Doe submitting for representation.');
    });
  });

  test('refines a note when text is present', async () => {
    const onNoteChange = vi.fn();
    const user = userEvent.setup();
    const initialNote = 'I am an editorial model with 4 years experience in Paris and Milan.';
    talentApi.sharpenSubmissionNote.mockResolvedValue({
      note: 'Editorial model with 4 years experience in Paris and Milan, seeking representation.',
    });

    render(
      <MessagePage
        agency={mockAgency}
        note={initialNote}
        onNoteChange={onNoteChange}
        boardLabels={['Editorial']}
      />,
    );

    const magicButton = screen.getByRole('button', { name: /refine note with pholio/i });
    expect(magicButton).toBeInTheDocument();

    await user.click(magicButton);

    await waitFor(() => {
      expect(talentApi.sharpenSubmissionNote).toHaveBeenCalledWith({
        agencyId: 'agency-123',
        agencyName: 'Elite Model Management',
        targetBoards: ['Editorial'],
        note: initialNote,
      });
      expect(onNoteChange).toHaveBeenCalledWith(
        'Editorial model with 4 years experience in Paris and Milan, seeking representation.',
      );
    });
  });

  test('omits note composer for minor submissions', () => {
    render(
      <MessagePage
        agency={mockAgency}
        note=""
        onNoteChange={vi.fn()}
        minor={true}
      />,
    );

    expect(
      screen.getByText(/Direct notes and contact details are omitted from minor submissions/i),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Introduce yourself/i)).not.toBeInTheDocument();
  });
});
