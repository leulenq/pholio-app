import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDayMonth, parseDateValue } from '../dossierModel';

/**
 * `date` columns (started_on, ends_on, …) arrive as bare "YYYY-MM-DD".
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which any US-zone
 * formatter then rolls back to the previous day — these pin the local-date
 * construction that fixes it.
 */
describe('parseDateValue / fmtDate / fmtDayMonth — bare date strings stay on their day', () => {
  it('reads the calendar day out of a bare "YYYY-MM-DD" as itself, not the day before', () => {
    expect(parseDateValue('2026-03-15').getDate()).toBe(15);
  });

  it('still parses a full timestamp', () => {
    const d = parseDateValue('2026-03-15T12:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it('fmtDayMonth does not roll a bare date back a day in a US zone', () => {
    // Under the old `new Date('2026-03-15')`, this reads "Mar 14" west of UTC.
    expect(fmtDayMonth('2026-03-15')).toBe('Mar 15');
  });

  it('fmtDate does not roll a bare date back a day in a US zone', () => {
    expect(fmtDate('2026-03-15')).toBe('Mar 15, 2026');
  });
});
