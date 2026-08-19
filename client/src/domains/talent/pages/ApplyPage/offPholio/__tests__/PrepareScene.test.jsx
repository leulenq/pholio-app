import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import PrepareScene from '../PrepareScene';

const WEB_ROUTE = {
  seriesId: 'the-society-management-nyc:online',
  agencyName: 'The Society Management',
  marketLabel: 'New York',
  channelType: 'official_web_form',
  sourceUrl: 'https://example.com/apply',
};

const EMAIL_ROUTE = {
  ...WEB_ROUTE,
  seriesId: 'muse-model-management-nyc:email',
  agencyName: 'Muse Model Management',
  channelType: 'official_email',
};

const SLOTS = [
  { key: 'headshot', label: 'Headshot', image: { id: 'i1', public_url: '/uploads/a.jpg' } },
  { key: 'full', label: 'Full length', image: { id: 'i2', public_url: '/uploads/b.jpg' } },
  { key: 'profile', label: 'Profile', image: null },
];

const STATS = {
  height: { cm: 175, sub: "5′9″" },
  vitals: [{ label: 'Bust', cm: 82 }, { label: 'Waist', cm: 61 }],
  secondary: [{ label: 'Hair', value: 'Brown' }, { label: 'Eyes', value: 'Blue' }],
};

function renderScene(props = {}) {
  return render(
    <PrepareScene
      route={WEB_ROUTE}
      slots={SLOTS}
      stats={STATS}
      frameCount={2}
      gaps={[]}
      exportState={null}
      onPrepare={vi.fn()}
      onModify={vi.fn()}
      onOpenMedia={vi.fn()}
      {...props}
    />,
  );
}

describe('PrepareScene — the manifest', () => {
  test('presents the archive as a document addressed to the agency', () => {
    renderScene();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'The Society Management',
    );
    expect(screen.getByText('Prepared for')).toBeInTheDocument();
    expect(screen.getByText('New York · on their site')).toBeInTheDocument();
  });

  test('lists only the frames actually assigned, with the file they become', () => {
    renderScene();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('alt', 'Headshot');
    // The empty third slot is not invented into the archive.
    expect(screen.queryByAltText('Profile')).toBeNull();
    expect(screen.getByText('2 images')).toBeInTheDocument();
  });

  test('names the files the talent will actually find in the archive', () => {
    renderScene();

    expect(screen.getByText('STATS.txt')).toBeInTheDocument();
    expect(screen.getByText('README.txt')).toBeInTheDocument();
    // No email draft for a web-form agency — that file is not produced.
    expect(screen.queryByText('EMAIL.txt')).toBeNull();
  });

  test('an email agency gets the draft section, and it is numbered in order', () => {
    renderScene({ route: EMAIL_ROUTE });

    expect(screen.getByText('EMAIL.txt')).toBeInTheDocument();
    expect(screen.getByText('III · Message')).toBeInTheDocument();
    expect(screen.getByText('IV · Their terms')).toBeInTheDocument();
  });

  test('shows the stats that become the stats block', () => {
    renderScene();

    expect(screen.getByText(/175 cm \/ 5′9″/)).toBeInTheDocument();
    expect(screen.getByText(/Bust 82/)).toBeInTheDocument();
  });

  test('an empty set says so rather than showing an empty frame row', () => {
    renderScene({ slots: [{ key: 'headshot', label: 'Headshot', image: null }], frameCount: 0 });

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Nothing selected yet/i)).toBeInTheDocument();
    expect(screen.getByText('None yet')).toBeInTheDocument();
  });

  test('a section can be reopened at the step that owns it', async () => {
    const onModify = vi.fn();
    renderScene({ onModify });

    const [firstModify] = screen.getAllByRole('button', { name: /modify/i });
    await userEvent.click(firstModify);
    expect(onModify).toHaveBeenCalledWith('digitals');
  });
});

describe('PrepareScene — the dispatch rail', () => {
  test('says who carries this one before the button offers to prepare it', () => {
    renderScene();

    const rail = screen.getByLabelText('How this one is sent');
    expect(within(rail).getByText(/hands it to you/i)).toBeInTheDocument();
    expect(within(rail).getByText('You')).toBeInTheDocument();
  });

  test('never claims anything was submitted', () => {
    renderScene({ exportState: { status: 'done', filename: 'set.zip', fileCount: 6 } });

    expect(screen.queryByText(/submitted/i)).toBeNull();
    expect(screen.queryByText(/confirmed/i)).toBeNull();
  });

  test('preparing is the primary action and reports its working state', async () => {
    const onPrepare = vi.fn();
    const { rerender } = renderScene({ onPrepare });

    await userEvent.click(screen.getByRole('button', { name: /prepare my set/i }));
    expect(onPrepare).toHaveBeenCalledTimes(1);

    rerender(
      <PrepareScene
        route={WEB_ROUTE}
        slots={SLOTS}
        stats={STATS}
        frameCount={2}
        gaps={[]}
        exportState={{ status: 'pending' }}
        onPrepare={onPrepare}
      />,
    );
    const working = screen.getByRole('button', { name: /preparing/i });
    expect(working).toBeDisabled();
    expect(working).toHaveAttribute('data-state', 'working');
  });

  test('a prepared archive offers another pass — sets and requirements both drift', () => {
    renderScene({ exportState: { status: 'done', filename: 'set.zip', fileCount: 6 } });

    expect(screen.getByRole('button', { name: /prepare it again/i })).toBeInTheDocument();
  });

  test('an export failure is stated in the rail, next to the action that failed', () => {
    renderScene({
      exportState: {
        status: 'error',
        message: 'None of your current images match a shot this agency publishes.',
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/None of your current images match/);
  });

  test('gaps are advisory — they never disable the archive', async () => {
    const onOpenMedia = vi.fn();
    renderScene({
      frameCount: 0,
      gaps: [{ key: 'digitals', label: 'No digitals selected', hint: 'Pick at least one frame.' }],
      onOpenMedia,
    });

    expect(screen.getByText('No digitals selected')).toBeInTheDocument();
    // These are the talent's own files; Pholio does not withhold them.
    expect(screen.getByRole('button', { name: /prepare my set/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /open the book/i }));
    expect(onOpenMedia).toHaveBeenCalledTimes(1);
  });
});
