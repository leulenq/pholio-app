import { describe, it, expect } from 'vitest';
import {
  SECTIONS, sectionOf, standingOf, groupCandidates, inPlayOrder, boardOrder, legalActions,
} from '../boardModel';
import { BOARD_VOCAB } from '../../../lib/board-identity';

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

const candidate = (overrides) => ({
  applicationId: overrides.applicationId || overrides.name,
  name: overrides.name || 'Someone',
  backendStatus: 'submitted',
  ...overrides,
});

describe('SECTIONS', () => {
  it('runs in decision order with the shelves last', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'decide', 'waiting', 'offer', 'represented', 'file', 'passed', 'closed',
    ]);
    expect(SECTIONS.filter((s) => s.shelf).map((s) => s.key)).toEqual(['file', 'passed', 'closed']);
  });

  it('titles the settled section from the board vocabulary', () => {
    const represented = SECTIONS.find((s) => s.key === 'represented');
    expect(represented.title(BOARD_VOCAB.division)).toBe('Represented');
    expect(represented.title(BOARD_VOCAB.package)).toBe('Confirmed');
  });
});

describe('sectionOf', () => {
  it.each([
    ['shortlisted', 'decide'],
    ['submitted', 'decide'],
    ['pending', 'decide'],
    ['requested_more', 'waiting'],
    ['meeting_requested', 'waiting'],
    ['accepted', 'offer'],
    ['development', 'offer'],
    ['represented', 'represented'],
    ['kept_on_file', 'file'],
    ['passed', 'passed'],
    ['declined', 'passed'],
    ['archived', 'passed'],
    ['withdrawn', 'closed'],
    ['closed_no_response', 'closed'],
    ['declined_by_talent', 'closed'],
  ])('maps %s to %s', (status, section) => {
    expect(sectionOf(status)).toBe(section);
  });

  it('keeps an unknown status visible rather than dropping it', () => {
    expect(sectionOf('something_new')).toBe('decide');
    expect(sectionOf(null)).toBe('decide');
  });
});

describe('standingOf', () => {
  it('prints the spec vocabulary for every standing', () => {
    const text = (status) => standingOf(
      candidate({ backendStatus: status, statusChangedAt: daysAgo(1) }),
      BOARD_VOCAB.division,
      NOW,
    ).text;

    expect(text('submitted')).toBe('Filed');
    expect(text('shortlisted')).toBe('Shortlisted');
    expect(text('requested_more')).toBe('Digitals requested');
    expect(text('meeting_requested')).toBe('Meeting requested');
    expect(text('accepted')).toBe('Offer out');
    expect(text('development')).toBe('Development offer');
    expect(text('represented')).toBe('Represented');
    expect(text('kept_on_file')).toBe('On file');
    expect(text('passed')).toBe('Passed');
    expect(text('withdrawn')).toBe('Withdrawn');
    expect(text('closed_no_response')).toBe('No response');
    expect(text('declined_by_talent')).toBe('Declined by talent');
  });

  it('says Confirmed on a package board', () => {
    const s = standingOf(candidate({ backendStatus: 'represented' }), BOARD_VOCAB.package, NOW);
    expect(s.text).toBe('Confirmed');
  });

  it('never lets a talent-confirmed event slot read as representation', () => {
    const division = standingOf(candidate({ backendStatus: 'confirmed' }), BOARD_VOCAB.division, NOW);
    const pkg = standingOf(candidate({ backendStatus: 'confirmed' }), BOARD_VOCAB.package, NOW);
    expect(division.text).toBe('Confirmed');
    expect(pkg.text).toBe('Confirmed');
    expect(sectionOf('confirmed')).toBe('represented');
  });

  it('counts elapsed time in days, then weeks, then months', () => {
    const since = (days) => standingOf(
      candidate({ backendStatus: 'requested_more', statusChangedAt: daysAgo(days) }),
      BOARD_VOCAB.division,
      NOW,
    ).since;

    // Something filed this morning is not "0d" old; it is today.
    expect(since(0)).toBe('today');
    expect(since(1)).toBe('1d');
    expect(since(6)).toBe('6d');
    expect(since(21)).toBe('3w');
    expect(since(90)).toBe('3mo');
  });

  it('falls back to the submission date when the status never moved', () => {
    const s = standingOf(
      candidate({ backendStatus: 'submitted', submittedAt: daysAgo(4) }),
      BOARD_VOCAB.division,
      NOW,
    );
    expect(s.since).toBe('4d');
    expect(s.settled).toBe(false);
  });

  it('gives a settled outcome a calendar date, not a stopwatch', () => {
    const s = standingOf(
      candidate({ backendStatus: 'kept_on_file', statusChangedAt: daysAgo(60) }),
      BOARD_VOCAB.division,
      NOW,
    );
    expect(s.settled).toBe(true);
    expect(s.since).toMatch(/\d/);
    expect(s.since).not.toMatch(/^\d+(d|w|mo)$/);
  });

  it('never claims a since it does not have', () => {
    const s = standingOf(candidate({ backendStatus: 'submitted' }), BOARD_VOCAB.division, NOW);
    expect(s.since).toBeNull();
  });
});

describe('groupCandidates', () => {
  it('buckets and sorts longest waiting first in play', () => {
    const groups = groupCandidates([
      candidate({ name: 'new', backendStatus: 'submitted', statusChangedAt: daysAgo(1) }),
      candidate({ name: 'old', backendStatus: 'shortlisted', statusChangedAt: daysAgo(30) }),
      candidate({ name: 'mid', backendStatus: 'submitted', statusChangedAt: daysAgo(9) }),
    ], BOARD_VOCAB.division, NOW);

    expect(groups.decide.map((c) => c.name)).toEqual(['old', 'mid', 'new']);
  });

  it('sorts the settled section newest first', () => {
    const groups = groupCandidates([
      candidate({ name: 'earlier', backendStatus: 'represented', statusChangedAt: daysAgo(40) }),
      candidate({ name: 'latest', backendStatus: 'represented', statusChangedAt: daysAgo(3) }),
    ], BOARD_VOCAB.division, NOW);

    expect(groups.represented.map((c) => c.name)).toEqual(['latest', 'earlier']);
  });

  it('returns every section even when empty', () => {
    const groups = groupCandidates([], BOARD_VOCAB.division, NOW);
    expect(Object.keys(groups).sort()).toEqual(
      ['closed', 'decide', 'file', 'offer', 'passed', 'represented', 'waiting'],
    );
  });

  it('survives a null candidate list', () => {
    expect(groupCandidates(null, BOARD_VOCAB.division, NOW).decide).toEqual([]);
  });
});

describe('inPlayOrder / boardOrder', () => {
  const groups = groupCandidates([
    candidate({ name: 'd', backendStatus: 'submitted', statusChangedAt: daysAgo(5) }),
    candidate({ name: 'w', backendStatus: 'requested_more', statusChangedAt: daysAgo(5) }),
    candidate({ name: 'o', backendStatus: 'accepted', statusChangedAt: daysAgo(5) }),
    candidate({ name: 'r', backendStatus: 'represented', statusChangedAt: daysAgo(5) }),
    candidate({ name: 'f', backendStatus: 'kept_on_file', statusChangedAt: daysAgo(5) }),
  ], BOARD_VOCAB.division, NOW);

  it('walks decide, waiting, offer, represented', () => {
    expect(inPlayOrder(groups).map((c) => c.name)).toEqual(['d', 'w', 'o', 'r']);
  });

  it('leaves the shelves out of the review queue but in the board order', () => {
    expect(inPlayOrder(groups).map((c) => c.name)).not.toContain('f');
    expect(boardOrder(groups).map((c) => c.name)).toEqual(['d', 'w', 'o', 'r', 'f']);
  });
});

describe('legalActions', () => {
  it('offers nothing on an empty selection', () => {
    expect(legalActions([]).size).toBe(0);
  });

  it('opens and lines up anyone', () => {
    ['submitted', 'represented', 'passed', 'withdrawn'].forEach((status) => {
      const legal = legalActions([status]);
      expect(legal.has('open')).toBe(true);
      expect(legal.has('lineup')).toBe(true);
    });
  });

  it('does not re-offer a status that already carries the action', () => {
    expect(legalActions(['shortlisted']).has('shortlist')).toBe(false);
    expect(legalActions(['requested_more']).has('request_digitals')).toBe(false);
    expect(legalActions(['meeting_requested']).has('invite_meeting')).toBe(false);
  });

  it('allows Mark represented only once an offer is out', () => {
    expect(legalActions(['accepted']).has('represent')).toBe(true);
    expect(legalActions(['development']).has('represent')).toBe(true);
    expect(legalActions(['shortlisted']).has('represent')).toBe(false);
    expect(legalActions(['submitted']).has('represent')).toBe(false);
  });

  it('offers Reopen only on the shelves', () => {
    expect(legalActions(['kept_on_file']).has('reopen')).toBe(true);
    expect(legalActions(['passed']).has('reopen')).toBe(true);
    expect(legalActions(['withdrawn']).has('reopen')).toBe(true);
    expect(legalActions(['submitted']).has('reopen')).toBe(false);
  });

  it('never passes or re-decides someone already represented', () => {
    const legal = legalActions(['represented']);
    expect(legal.has('pass')).toBe(false);
    expect(legal.has('keep_on_file')).toBe(false);
    expect(legal.has('offer')).toBe(false);
  });

  it('intersects across a mixed selection', () => {
    const legal = legalActions(['submitted', 'accepted']);
    expect(legal.has('pass')).toBe(true);
    expect(legal.has('keep_on_file')).toBe(true);
    expect(legal.has('shortlist')).toBe(false);
    expect(legal.has('represent')).toBe(false);
  });

  it('leaves a selection spanning the wall and a shelf with only open and lineup', () => {
    expect([...legalActions(['submitted', 'passed'])].sort()).toEqual(['lineup', 'open']);
  });
});
