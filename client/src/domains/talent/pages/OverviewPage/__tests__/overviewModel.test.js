import { describe, expect, it } from 'vitest';
import {
  buildCirculation,
  buildMoves,
  buildNextAgencies,
  buildPackage,
  buildWeek,
  waitReading,
} from '../overviewModel';

const now = new Date('2026-10-04T12:00:00');

const app = (over) => ({
  id: over.id || 'a1',
  agency_id: over.agency_id || 'ag1',
  agency_name: 'Northbound Management',
  agency_location: 'London, UK',
  status: 'submitted',
  created_at: '2026-09-08T10:00:00Z',
  status_changed_at: '2026-09-08T10:00:00Z',
  ...over,
});

describe('buildMoves', () => {
  it('puts agency asks before package gaps and stats', () => {
    const moves = buildMoves({
      applications: [app({ id: 'm1', status: 'requested_more', status_changed_at: '2026-09-30T10:00:00Z' })],
      requiredGaps: [{ key: 'headshot', label: 'Smiling headshot', to: '/x' }],
      profile: { measurements_updated_at: '2026-03-10T10:00:00Z' },
      now,
    });
    expect(moves.map((m) => m.key)).toEqual(['more-m1', 'required', 'stats']);
    expect(moves[0].title).toBe('Northbound Management asked for more.');
  });

  it('does not repeat a thread whose submission is already a move', () => {
    const moves = buildMoves({
      applications: [app({ id: 'g1', status: 'meeting_requested' })],
      threads: [
        { id: 'g1', agencyName: 'Northbound Management', lastSenderType: 'AGENCY', preview: 'Thursday?', timestamp: now },
        { id: 't2', agencyName: 'Atlas', lastSenderType: 'AGENCY', preview: 'Hello', timestamp: now },
        { id: 't3', agencyName: 'Wilder', lastSenderType: 'TALENT', preview: 'Thanks', timestamp: now },
      ],
      now,
    });
    expect(moves.map((m) => m.key)).toEqual(['gosee-g1', 'thread-t2']);
  });

  it('leads with a slot offer and states its answer-by time', () => {
    const [move] = buildMoves({
      applications: [
        app({
          id: 'e1',
          status: 'accepted',
          call_purpose: 'event_casting',
          event: { name: 'SS27 Show' },
          offer_closes_at: '2026-10-06T16:00:00',
        }),
      ],
      now,
    });
    expect(move.title).toBe('Northbound Management offered you a slot in SS27 Show.');
    expect(move.context).toContain('Tue 6 Oct, 4 PM');
  });

  it('never claims undated digitals are current and stays silent on current ones', () => {
    const keys = (freshness) => buildMoves({ freshness, now }).map((m) => m.key);
    expect(keys({ hasDigitals: true, state: 'undated', currentSet: null })).toEqual(['digitals-undated']);
    expect(keys({ hasDigitals: true, state: 'current', currentSet: { capturedOn: '2026-09-20' } })).toEqual([]);
    expect(keys({ hasDigitals: false, state: 'undated' })).toEqual(['digitals-none']);
  });

  it('keeps stats and digitals out of a guardian-gated minor’s moves', () => {
    const keys = buildMoves({
      minorGated: true,
      freshness: { hasDigitals: false },
      profile: { measurements_updated_at: '2025-01-01' },
      now,
    }).map((m) => m.key);
    expect(keys).toEqual(['guardian']);
  });
});

describe('waitReading / buildCirculation', () => {
  it('reads the server close date as day N of the window', () => {
    const wait = waitReading(app({ review_closes_at: '2026-10-08T10:00:00Z' }), now);
    expect(wait).toMatchObject({ total: 30, elapsed: 26, closesOn: '8 Oct' });
  });

  it('draws no clock without a server close date', () => {
    expect(waitReading(app({ status: 'kept_on_file' }), now)).toBeNull();
  });

  it('orders what waits on the talent first and shelves closed rows', () => {
    const { live, closed } = buildCirculation(
      [
        app({ id: 's', status: 'submitted', review_closes_at: '2026-10-20T10:00:00Z' }),
        app({ id: 'k', status: 'kept_on_file' }),
        app({ id: 'r', status: 'requested_more' }),
        app({ id: 'x', status: 'closed_no_response' }),
      ],
      now,
    );
    expect(live.map((row) => row.id)).toEqual(['r', 'k', 's']);
    expect(live[0].waiting).toBe(true);
    expect(closed.map((row) => row.id)).toEqual(['x']);
  });
});

describe('buildWeek', () => {
  it('places open-call hours and closing windows on their day', () => {
    const { days, total } = buildWeek({
      callWindows: [{ id: 'w', displayName: 'Muse NYC', weekday: 2, startMinute: 900, endMinute: 960, timezone: 'America/New_York' }],
      applications: [app({ review_closes_at: '2026-10-08T10:00:00' })],
      now,
    });
    expect(total).toBe(2);
    expect(days[2].entries[0].title).toBe('Muse NYC open call');
    expect(days[4].entries[0].title).toBe('Northbound Management window closes');
  });

  it('is empty when nothing is dated this week', () => {
    expect(buildWeek({ now }).total).toBe(0);
  });
});

describe('buildPackage', () => {
  it('prints stats in convention order and withholds body stats for a gated minor', () => {
    const profile = { first_name: 'Mia', last_name: 'Voss', height_cm: 178, bust_cm: 81, waist_cm: 61, hips_cm: 88 };
    expect(buildPackage({ profile, now }).stats.map((s) => s.value)).toEqual(['5′10″ · 178 cm', '81–61–88']);
    const gated = buildPackage({ profile, minorGated: true, websiteUrl: 'https://pholio.studio/m', now });
    expect(gated.stats).toHaveLength(1);
    expect(gated.lines.map((l) => l.key)).toEqual(['stats', 'card']);
  });
});

describe('buildNextAgencies', () => {
  it('keeps agencies whose own ranges include the talent and skips those already sent', () => {
    const { agencies } = buildNextAgencies({
      agencies: [
        { id: 'fit', name: 'Atlas', min_height_female: 172, max_height_female: 182, min_age: 16, max_age: 30, open_boards: '["Women"]' },
        { id: 'short', name: 'Saint Clare', min_height_female: 180, max_height_female: 185 },
        { id: 'old', name: 'Young', min_age: 16, max_age: 24 },
        { id: 'sent', name: 'Northbound' },
        { id: 'open', name: 'Lumen' },
      ],
      applications: [app({ agency_id: 'sent' })],
      profile: { gender: 'Female', height_cm: 178, date_of_birth: '1997-04-12' },
      now,
    });
    expect(agencies.map((a) => a.id)).toEqual(['fit', 'open']);
    expect(agencies[0].range).toBe('172–182 cm');
  });
});
