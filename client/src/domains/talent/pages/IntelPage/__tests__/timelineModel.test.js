import { describe, test, expect } from 'vitest';
import { axis, thisWeek, timelineRows } from '../timelineModel';

const now = new Date('2026-10-05T12:00:00Z');

describe('axis', () => {
  test('today sits a month in, and positions clamp to the axis', () => {
    const ax = axis(now);
    expect(ax.today).toBeCloseTo(30 / 212, 3);
    expect(ax.at('2020-01-01')).toBe(0);
    expect(ax.at('2030-01-01')).toBe(1);
    expect(ax.months.length).toBeGreaterThanOrEqual(5);
    // No label under the Today mark, none hanging off the right edge.
    for (const m of ax.months) {
      expect(Math.abs(m.x - ax.today)).toBeGreaterThan(0.035);
      expect(m.x).toBeLessThan(0.95);
    }
  });
});

describe('timelineRows', () => {
  const placement = {
    agencies: [
      { key: 'a', name: 'North', group: 'waiting', history: { standing: 'waiting', submittedAt: '2026-09-26T00:00:00Z', closesAt: '2026-10-26T00:00:00Z' } },
      { key: 'b', name: 'Arden', group: 'later', history: { standing: 'closed', againOn: '2026-11-24T00:00:00Z' } },
      { key: 'c', name: 'Vale', group: 'later', history: { standing: 'closed', againOn: '2027-09-01T00:00:00Z' } },
      { key: 'd', name: 'Ford', group: 'go' },
    ],
    calendar: { events: [
      { date: '2026-10-08', kind: 'open_call', name: 'Muse', label: 'Walk-in open call' },
      { date: '2026-10-15', kind: 'open_call', name: 'Muse', label: 'Walk-in open call' },
    ] },
    digitals: { has: true, capturedOn: '2026-06-09', dueOn: '2026-09-07' },
  };

  test('places each dated thing on one axis', () => {
    const rows = timelineRows(placement, now);
    expect(rows.waiting).toHaveLength(1);
    expect(rows.waiting[0].from).toBeLessThan(rows.axis.today);
    expect(rows.waiting[0].to).toBeGreaterThan(rows.axis.today);
    expect(rows.again.map((a) => a.name)).toEqual(['Arden', 'Vale']);
    expect(rows.again[1].beyond).toBe(true);
    expect(rows.calls).toHaveLength(1);
    expect(rows.calls[0].ticks).toHaveLength(2);
    expect(rows.digitals.overdue).toBe(true);
  });

  test('this week: overdue digitals lead, then dated events inside seven days', () => {
    const items = thisWeek(placement, now);
    expect(items[0]).toEqual(expect.objectContaining({ kind: 'digitals', overdue: true, when: null }));
    expect(items.filter((i) => i.kind === 'open_call')).toHaveLength(1);
  });
});
