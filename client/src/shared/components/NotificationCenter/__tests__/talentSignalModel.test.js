import { describe, expect, it } from 'vitest';
import {
  BAND,
  buildSignalDigest,
  classifySignal,
  compactTime,
  splitTitle,
} from '../talentSignalModel';

const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const row = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  type: 'application_status',
  title: 'Something happened',
  body: 'Body copy.',
  isRead: false,
  occurrenceCount: 1,
  lastOccurredAt: ago(30),
  metadata: {},
  ...over,
});

describe('classifySignal', () => {
  it.each(['accepted', 'requested_more', 'meeting_requested', 'development'])(
    'puts application status %s in the action band',
    (status) => {
      expect(classifySignal(row({ metadata: { status } }))).toBe(BAND.ACTION);
    },
  );

  it('bands an event slot offer with the representation offers', () => {
    // The same `accepted` status means representation from an agency and a slot
    // from an organiser. Both are somebody waiting on an answer.
    expect(
      classifySignal(row({ metadata: { status: 'accepted', purpose: 'event_casting' } })),
    ).toBe(BAND.ACTION);
  });

  it.each([
    'shortlisted',
    'submitted',
    'represented',
    'passed',
    'declined',
    'closed_no_response',
    'kept_on_file',
    'archived',
  ])('leaves decided status %s as news', (status) => {
    expect(classifySignal(row({ metadata: { status } }))).toBe(BAND.NEWS);
  });

  it('treats a booker message and a broken profile as things owed', () => {
    expect(classifySignal(row({ type: 'message_received' }))).toBe(BAND.ACTION);
    expect(classifySignal(row({ type: 'profile_not_submission_ready' }))).toBe(BAND.ACTION);
  });

  it('files agency views as ambient interest and receipts as news', () => {
    expect(classifySignal(row({ type: 'agency_profile_view' }))).toBe(BAND.INTEREST);
    expect(classifySignal(row({ type: 'application_submitted' }))).toBe(BAND.NEWS);
    expect(classifySignal(row({ type: 'confirmation' }))).toBe(BAND.NEWS);
    expect(classifySignal(row({ type: 'something_new_the_server_added' }))).toBe(BAND.NEWS);
  });
});

describe('buildSignalDigest', () => {
  it('orders bands action → news → interest and drops empty ones', () => {
    const digest = buildSignalDigest([
      row({ type: 'agency_profile_view' }),
      row({ metadata: { status: 'accepted' } }),
    ]);
    expect(digest.bands.map((b) => b.id)).toEqual([BAND.ACTION, BAND.INTEREST]);
  });

  it('sorts unread ahead of read, then newest first', () => {
    const digest = buildSignalDigest([
      row({ id: 'read-recent', isRead: true, lastOccurredAt: ago(1), metadata: { status: 'accepted' } }),
      row({ id: 'unread-old', isRead: false, lastOccurredAt: ago(9000), metadata: { status: 'accepted' } }),
      row({ id: 'unread-recent', isRead: false, lastOccurredAt: ago(5), metadata: { status: 'accepted' } }),
    ]);
    expect(digest.bands[0].items.map((i) => i.id)).toEqual([
      'unread-recent',
      'unread-old',
      'read-recent',
    ]);
  });

  it('keeps a read offer in the action band — seeing it is not answering it', () => {
    const digest = buildSignalDigest([
      row({ isRead: true, metadata: { status: 'accepted' } }),
    ]);
    expect(digest.bands[0].id).toBe(BAND.ACTION);
    expect(digest.actionCount).toBe(1);
    expect(digest.unreadActionCount).toBe(0);
  });

  it('drops the restated body on a single agency view but keeps the grouped one', () => {
    const digest = buildSignalDigest([
      row({
        id: 'single',
        type: 'agency_profile_view',
        body: 'An agency opened your portfolio in Scout.',
      }),
      row({
        id: 'grouped',
        type: 'agency_profile_view',
        occurrenceCount: 4,
        body: 'This agency viewed your profile 4 times recently.',
        lastOccurredAt: ago(90),
      }),
    ]);
    const items = Object.fromEntries(digest.bands[0].items.map((i) => [i.id, i.detail]));
    expect(items.single).toBe('');
    expect(items.grouped).toBe('This agency viewed your profile 4 times recently.');
  });

  it('previews the quiet bands and never truncates the action band', () => {
    const digest = buildSignalDigest([
      ...Array.from({ length: 9 }, () => row({ metadata: { status: 'accepted' } })),
      ...Array.from({ length: 9 }, () => row({ type: 'agency_profile_view' })),
    ]);
    const [action, interest] = digest.bands;
    expect(action.previewLimit).toBe(Infinity);
    expect(action.items).toHaveLength(9);
    expect(interest.previewLimit).toBe(4);
    expect(interest.items).toHaveLength(9);
    expect(digest.bands.every((b) => b.label)).toBe(true);
  });
});

describe('compactTime', () => {
  it.each([
    [0, 'now'],
    [7, '7m'],
    [130, '2h'],
    [60 * 24 * 3, '3d'],
  ])('renders %i minutes ago as %s', (minutes, expected) => {
    expect(compactTime({ lastOccurredAt: ago(minutes) })).toBe(expected);
  });

  it('falls back to the server string when the date is unusable', () => {
    expect(compactTime({ lastOccurredAt: 'not-a-date', timeAgo: 'Yesterday' })).toBe('Yesterday');
    expect(compactTime({ timeAgo: 'Just now' })).toBe('Just now');
  });

  it('drops to a calendar date past a week', () => {
    expect(compactTime({ lastOccurredAt: ago(60 * 24 * 40) })).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('splitTitle', () => {
  it('isolates an agency name for emphasis', () => {
    expect(
      splitTitle({ title: 'Ford Models sent you a message', metadata: { agencyName: 'Ford Models' } }),
    ).toEqual({ before: '', name: 'Ford Models', after: ' sent you a message' });
  });

  it('leaves a title without a name whole', () => {
    expect(splitTitle({ title: 'Representation offer', metadata: { status: 'accepted' } })).toEqual({
      before: '',
      name: 'Representation offer',
      after: '',
    });
  });
});
