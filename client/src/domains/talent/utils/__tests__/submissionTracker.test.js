import { describe, expect, it } from 'vitest';
import {
  TRACKER_CHANNEL_OPTIONS,
  formatTrackerDate,
  isTrackerLapsed,
  trackerBucketCounts,
  trackerChannelLine,
  trackerMatchesFilter,
  trackerStatusConfig,
  todayTrackerDate,
  validateTrackerLogForm,
} from '../submissionTracker';

const awaiting = {
  id: 'row-1',
  status: 'awaiting',
  submittedOn: '2026-08-01',
  reviewWindowDays: 30,
  isLapsed: false,
  lapseDate: '2026-08-31',
  reapplyOpensOn: '2027-02-01',
};

const lapsed = { ...awaiting, id: 'row-2', isLapsed: true };

describe('tracker status display', () => {
  it('keeps an open review window in the in-review group', () => {
    expect(trackerStatusConfig(awaiting)).toMatchObject({
      label: 'Awaiting reply',
      group: 'inReview',
      tone: 'pending',
    });
    expect(trackerStatusConfig(awaiting).next).toBe(
      'Their review window runs to Aug 31, 2026. Nothing is expected of you until then.',
    );
  });

  it('names the silence and dates the re-apply window once a row lapses', () => {
    const config = trackerStatusConfig(lapsed);
    expect(config).toMatchObject({ label: 'No response', short: 'Closed', group: 'closed' });
    expect(config.next).toBe(
      'Industry convention says treat this as a pass. Re-apply window opens Feb 1, 2027.',
    );
  });

  it('drops the date rather than inventing one when the server sent none', () => {
    expect(trackerStatusConfig({ ...lapsed, reapplyOpensOn: null }).next).toBe(
      'Industry convention says treat this as a pass.',
    );
  });

  it('trusts the server for lapse and never recomputes it', () => {
    // Submitted years ago, but the server says the window is open: the client
    // does no date math of its own (ruling R1).
    const stale = { ...awaiting, submittedOn: '2020-01-01', isLapsed: false };
    expect(isTrackerLapsed(stale)).toBe(false);
    expect(trackerStatusConfig(stale).group).toBe('inReview');
  });

  it('a reply keeps the row live; the talent closing it does not', () => {
    expect(trackerStatusConfig({ ...awaiting, status: 'heard_back' })).toMatchObject({
      label: 'Heard back',
      group: 'inReview',
    });
    expect(trackerStatusConfig({ ...awaiting, status: 'closed_by_talent' })).toMatchObject({
      label: 'Closed',
      group: 'closed',
    });
  });

  it('a lapsed row the talent already answered is not treated as silence', () => {
    expect(isTrackerLapsed({ ...lapsed, status: 'heard_back' })).toBe(false);
    expect(trackerStatusConfig({ ...lapsed, status: 'heard_back' }).label).toBe('Heard back');
  });

  it('buckets rows into the same standing groups the filter tabs use', () => {
    expect(trackerBucketCounts([awaiting, lapsed, { ...awaiting, status: 'closed_by_talent' }])).toEqual(
      { inReview: 1, advancing: 0, represented: 0, closed: 2 },
    );
  });

  it('matches the ledger filters', () => {
    expect(trackerMatchesFilter(awaiting, 'all')).toBe(true);
    expect(trackerMatchesFilter(awaiting, 'inReview')).toBe(true);
    expect(trackerMatchesFilter(awaiting, 'closed')).toBe(false);
    expect(trackerMatchesFilter(lapsed, 'closed')).toBe(true);
  });
});

describe('channel copy', () => {
  it('states where a submission went as a plain line', () => {
    expect(trackerChannelLine('official_web_form')).toBe('Submitted on their site');
    expect(trackerChannelLine('official_email')).toBe('Submitted by email');
    expect(trackerChannelLine('official_walk_in')).toBe('Submitted in person');
    expect(trackerChannelLine('other')).toBe('Submitted off Pholio');
    expect(trackerChannelLine(undefined)).toBe('Submitted on their site');
  });

  it('offers honest channel names in the log form', () => {
    expect(TRACKER_CHANNEL_OPTIONS).toEqual([
      { value: 'official_web_form', label: 'Their website form' },
      { value: 'official_email', label: 'Email' },
      { value: 'official_walk_in', label: 'Walk-in' },
      { value: 'agency_branded_third_party_form', label: 'Third-party form' },
      { value: 'other', label: 'Other' },
    ]);
  });
});

describe('date-only formatting', () => {
  it('reads a date-only value at UTC midnight so it never slips a day', () => {
    expect(formatTrackerDate('2026-08-15')).toBe('Aug 15, 2026');
    expect(formatTrackerDate(null)).toBeNull();
    expect(formatTrackerDate('not-a-date')).toBeNull();
  });
});

describe('log form validation', () => {
  const today = '2026-08-15';

  it('requires an agency and a date that has already happened', () => {
    expect(validateTrackerLogForm({ agencyName: '  ', submittedOn: '' }, { today })).toMatchObject({
      agencyName: 'Name the agency you submitted to.',
      submittedOn: 'Pick the date you sent it.',
    });
    expect(
      validateTrackerLogForm({ agencyName: 'Muse', submittedOn: '2026-08-16' }, { today }),
    ).toMatchObject({ submittedOn: 'That date is still ahead of you.' });
  });

  it('accepts a complete entry', () => {
    expect(
      validateTrackerLogForm(
        {
          agencyName: 'Muse Management',
          submittedOn: today,
          destinationUrl: 'https://musenyc.com/scouting',
          note: 'Sent the digitals set.',
        },
        { today },
      ),
    ).toEqual({});
  });

  it('rejects a link that is not an http address', () => {
    expect(
      validateTrackerLogForm(
        { agencyName: 'Muse', submittedOn: today, destinationUrl: 'musenyc.com' },
        { today },
      ),
    ).toMatchObject({ destinationUrl: 'Use the full address, starting with https://' });
  });

  it('caps the agency name and the note at the lengths the server stores', () => {
    const errors = validateTrackerLogForm(
      { agencyName: 'a'.repeat(161), submittedOn: today, note: 'n'.repeat(501) },
      { today },
    );
    expect(errors.agencyName).toMatch(/160 characters/);
    expect(errors.note).toMatch(/500 characters/);
  });

  it("defaults the date to the talent's own calendar day", () => {
    expect(todayTrackerDate(new Date('2026-08-15T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
