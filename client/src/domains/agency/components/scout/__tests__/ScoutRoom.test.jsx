/**
 * The Scout Room (tasks/discover-expanded-view-2026-09.md §3, §4).
 *
 * The contracts this surface exists to keep:
 *   a. it LOADS the profile, so the book exists at all. The old view
 *      rendered the grid card and therefore showed one photograph;
 *   b. representation is stated as words, for every value, and an unknown
 *      status never resolves to "Unrepresented";
 *   c. absence is never a positive claim: an unpublished measurement says
 *      "Not listed";
 *   d. once invited, the verb is a state and inert, and the date is shown;
 *   e. "Not for us" is private and reversible;
 *   f. the two arrow scopes never collide: left/right is the result set,
 *      up/down is the book;
 *   g. the boundary of what an application would add is stated plainly;
 *   h. no banned agency pattern is reintroduced.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ScoutRoom from '../ScoutRoom';
import { getProfilePreview, dismissTalent, undismissTalent } from '../../../api/agency';

vi.mock('../../../api/agency', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProfilePreview: vi.fn(),
    dismissTalent: vi.fn(),
    undismissTalent: vi.fn(),
  };
});

const card = (over = {}) => ({
  id: 'p-1',
  name: 'Ines Moreau',
  archetype: 'Editorial',
  city: 'Paris',
  photo: 'https://img.test/lead.jpg',
  band: 'match',
  why: 'From their bio: “Fresh faced, natural and approachable.”',
  isInvited: false,
  ...over,
});

const preview = (over = {}) => ({
  success: true,
  profile: {
    id: 'p-1',
    display_name: 'Ines Moreau',
    first_name: 'Ines',
    last_name: 'Moreau',
    slug: 'ines-moreau',
    lanes: ['Editorial'],
    city: 'Paris',
    city_secondary: null,
    age_band: '18+',
    representation_status: 'unrepresented',
    represented_by: null,
    height_cm: 178,
    bust_cm: 84,
    waist_cm: null,
    hips_cm: 89,
    shoe_size: 'US 9',
    dress_size: null,
    suit_size: null,
    inseam_cm: null,
    measurements_updated_at: '2026-07-04T00:00:00.000Z',
    profile_updated_at: '2026-08-28T00:00:00.000Z',
    hair_color: 'brown',
    eye_color: 'green',
    tattoos: null,
    piercings: null,
    experience_level: 'developing',
    specialties: [],
    languages: ['French', 'English'],
    union_membership: null,
    availability_travel: true,
    playing_age_min: null,
    playing_age_max: null,
    heritage: ['French'],
    bio_curated: 'I grew up between Lyon and Paris and started shooting at eighteen.',
    social: [],
    is_minor: false,
    images: [
      { id: 'i1', public_url: 'https://img.test/1.jpg' },
      { id: 'i2', public_url: 'https://img.test/2.jpg' },
      { id: 'i3', public_url: 'https://img.test/3.jpg' },
    ],
    ...over,
  },
});

function renderRoom(props = {}, previewOver = {}) {
  const talent = props.talent || card();
  const talents = props.talents || [talent, card({ id: 'p-2', name: 'Lena Voss', band: 'partial' })];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ScoutRoom
        talent={talent}
        talents={talents}
        brief="girl next door commercial warmth"
        onClose={props.onClose || (() => {})}
        onNavigate={props.onNavigate || (() => {})}
        onInvite={props.onInvite || (() => {})}
        inviting={props.inviting || false}
      />
    </QueryClientProvider>,
  );
  return { ...utils, talent, talents, previewOver };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProfilePreview.mockResolvedValue(preview());
  dismissTalent.mockResolvedValue({ success: true });
  undismissTalent.mockResolvedValue({ success: true });
});

describe('ScoutRoom — the book is loaded, not reused from the card', () => {
  test('renders every frame of the fetched book, and states the count as words', async () => {
    renderRoom();

    await waitFor(() => expect(getProfilePreview).toHaveBeenCalledWith('p-1'));
    await screen.findByRole('tab', { name: 'Frame 3' });

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByText('3 frames')).toBeInTheDocument();
    // The full book appears again below the fold, at grid size.
    expect(screen.getByRole('button', { name: 'Raise frame 3' })).toBeInTheDocument();
  });

  test('the card supplies the header before the preview lands, and claims no book', () => {
    getProfilePreview.mockReturnValue(new Promise(() => {}));
    renderRoom();
    expect(screen.getByRole('heading', { name: 'Ines Moreau' })).toBeInTheDocument();
    // The card's one photograph is not a claim about the size of the book.
    expect(screen.getAllByText('Loading the book').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  test('the chrome carries the brief and the band with the position', async () => {
    renderRoom();
    await screen.findByText('3 frames');
    expect(screen.getByText('“girl next door commercial warmth”')).toBeInTheDocument();
    expect(screen.getByText('Exact match')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });
});

describe('ScoutRoom — representation is words', () => {
  const cases = [
    [{ representation_status: 'unrepresented' }, 'Representation not stated'],
    [{ representation_status: 'seeking' }, 'Seeking representation'],
    [{ representation_status: 'represented', represented_by: 'undisclosed' }, 'Represented, agency undisclosed'],
    [{ representation_status: 'represented', represented_by: 'Elite Paris' }, 'Represented by Elite Paris'],
    [{ representation_status: 'exclusive_elsewhere' }, 'Exclusive elsewhere'],
  ];

  test.each(cases)('%o reads as words', async (over, expected) => {
    getProfilePreview.mockResolvedValue(preview(over));
    renderRoom();
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  test('no status, and the DTO\'s absence bucket, both refuse the claim', async () => {
    getProfilePreview.mockResolvedValue(preview({ representation_status: null }));
    renderRoom();
    expect(await screen.findByText('Representation not stated')).toBeInTheDocument();
    expect(screen.queryByText('Unrepresented')).not.toBeInTheDocument();
  });
});

describe('ScoutRoom — absence is never a positive claim', () => {
  test('an unpublished measurement reads Not listed', async () => {
    renderRoom();
    await screen.findByText('3 frames');
    // waist is null in the fixture; bust, hips and shoe are published.
    expect(screen.getAllByText('Not listed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('US 9')).toBeInTheDocument();
  });

  test('height is dual unit, imperial first', async () => {
    renderRoom();
    expect(await screen.findByText('5′ 10″')).toBeInTheDocument();
    expect(screen.getByText('178 cm')).toBeInTheDocument();
  });

  test('the boundary of what an application would add is stated', async () => {
    renderRoom();
    expect(await screen.findByText('What an application would add')).toBeInTheDocument();
    expect(screen.getByText(/does not include their\s+dossier/)).toBeInTheDocument();
  });

  test('an empty book still composes, and says so', async () => {
    getProfilePreview.mockResolvedValue(preview({ images: [] }));
    renderRoom({ talent: card({ photo: null }) });
    expect(await screen.findByText('No frames published')).toBeInTheDocument();
    await screen.findByText('This person has not published any frames.');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('This person has not published any frames.')).toBeInTheDocument();
  });
});

describe('ScoutRoom — prior contact and the one outbound verb', () => {
  test('no prior contact is stated plainly', async () => {
    renderRoom();
    expect(await screen.findByText('No prior contact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite to apply' })).toBeEnabled();
  });

  test('once invited the verb is a state, inert, and dated', async () => {
    getProfilePreview.mockResolvedValue(preview({
      contact: { invited_at: '2026-06-02T00:00:00.000Z', applied_at: null, application_status: null },
    }));
    renderRoom();

    const invited = await screen.findByRole('button', { name: 'Invited' });
    expect(invited).toBeDisabled();
    expect(screen.getAllByText('2 June').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Invite to apply' })).not.toBeInTheDocument();
  });

  test('a prior application is reported with its date', async () => {
    getProfilePreview.mockResolvedValue(preview({
      contact: { invited_at: null, applied_at: '2026-03-14T00:00:00.000Z', application_status: 'submitted' },
    }));
    renderRoom();
    expect(await screen.findByText('Applied 14 March')).toBeInTheDocument();
  });

  test('no verdict vocabulary appears anywhere in the room', async () => {
    const { container } = renderRoom();
    await screen.findByText('3 frames');
    const text = container.textContent.toLowerCase();
    for (const word of ['shortlist', 'candidate', 'applicant', 'development offer', 'keep on file']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('ScoutRoom — not for us is private and reversible', () => {
  test('dismiss, then undo', async () => {
    renderRoom();
    const notForUs = await screen.findByRole('button', { name: 'Not for us' });

    fireEvent.click(notForUs);
    await waitFor(() => expect(dismissTalent).toHaveBeenCalledWith('p-1'));

    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(screen.queryByRole('button', { name: 'Not for us' })).not.toBeInTheDocument();

    fireEvent.click(undo);
    await waitFor(() => expect(undismissTalent).toHaveBeenCalledWith('p-1'));
    expect(await screen.findByRole('button', { name: 'Not for us' })).toBeInTheDocument();
  });
});

describe('ScoutRoom — movement', () => {
  test('left and right move through the result set, up and down through the book', async () => {
    const onNavigate = vi.fn();
    const { talents } = renderRoom({ onNavigate });
    await screen.findByText('3 frames');

    // The book starts on its first frame.
    expect(screen.getByRole('tab', { name: 'Frame 1' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');
    // Frame movement is not talent movement.
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Frame 1' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(talents[1]);

    // The first lead has nothing before it, so left does nothing.
    onNavigate.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test('clicking a frame in the strip raises it into the stage', async () => {
    renderRoom();
    const third = await screen.findByRole('tab', { name: 'Frame 3' });
    fireEvent.click(third);
    expect(third).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-label', 'Frame 3 of 3');
  });

  test('Esc closes the room', async () => {
    const onClose = vi.fn();
    renderRoom({ onClose });
    await screen.findByText('3 frames');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('the pager and the wordmark both exit', async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const { talents } = renderRoom({ onClose, onNavigate });
    await screen.findByText('3 frames');

    fireEvent.click(screen.getByRole('button', { name: 'Next talent' }));
    expect(onNavigate).toHaveBeenCalledWith(talents[1]);

    expect(screen.getByRole('button', { name: 'Previous talent' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ScoutRoom — the bans hold', () => {
  test('no badge, pill, chip, eyebrow, glass or side stripe class is present', async () => {
    const { container } = renderRoom();
    await screen.findByText('3 frames');

    const classes = Array.from(container.querySelectorAll('*'))
      .flatMap((el) => (typeof el.className === 'string' ? el.className.split(/\s+/) : []))
      .filter(Boolean);

    const banned = /(badge|pill|chip|eyebrow|kicker|glass|stripe|-count\b)/i;
    expect(classes.filter((c) => banned.test(c))).toEqual([]);
  });

  test('every string is free of em dashes and exclamation marks', async () => {
    const { container } = renderRoom();
    await screen.findByText('3 frames');
    expect(container.textContent).not.toMatch(/—/);
    expect(container.textContent).not.toMatch(/!/);
  });

  test('the talent artefacts are references, not competing actions', async () => {
    renderRoom();
    const comp = await screen.findByRole('link', { name: 'Comp card' });
    expect(comp).toHaveAttribute('href', '/pdf/ines-moreau');
    expect(screen.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('href', '/portfolio/ines-moreau');
  });

  test('the frame strip is a real tablist with visible roving focus', async () => {
    renderRoom();
    await screen.findByText('3 frames');
    const strip = screen.getByRole('tablist', { name: 'Frames' });
    const tabs = within(strip).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });
});
