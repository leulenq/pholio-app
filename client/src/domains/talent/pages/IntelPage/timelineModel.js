/**
 * The placement timeline: everything in Placement that has a date, on one
 * axis from a month ago to six months out.
 *
 *   waiting   a submission, as a bar from the day it was sent to the day its
 *             review window closes
 *   again     an agency that passed, at the day it is worth trying again
 *   calls     a recurring walk-in open call, as one tick per week
 *   digitals  the current set, from the day it was shot to the day it goes
 *             out of date, then overdue to the end of the axis
 *
 * Pure: positions are fractions of the axis (0..1), so the component only
 * multiplies by its width.
 */

const DAY = 86_400_000;
export const BEFORE_DAYS = 30;
export const AFTER_DAYS = 182;

function toDate(value) {
  if (!value) return null;
  const d = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function axis(now = new Date()) {
  const start = new Date(now.getTime() - BEFORE_DAYS * DAY);
  const end = new Date(now.getTime() + AFTER_DAYS * DAY);
  const span = end - start;
  const at = (date) => {
    const d = toDate(date);
    if (!d) return null;
    return Math.min(1, Math.max(0, (d - start) / span));
  };
  const months = [];
  const m = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (m < end) {
    months.push({ x: at(m), label: m.toLocaleDateString(undefined, { month: 'short' }), key: m.toISOString() });
    m.setMonth(m.getMonth() + 1);
  }
  // A month label right at today would sit under the Today mark; drop it.
  const today = at(now);
  return { start, end, at, today, months: months.filter((mo) => Math.abs(mo.x - today) > 0.035 && mo.x < 0.95) };
}

export function timelineRows(placement, now = new Date()) {
  const ax = axis(now);
  const agencies = placement?.agencies || [];

  const waiting = agencies
    .filter((a) => a.group === 'waiting' && a.history)
    .map((a) => ({
      key: a.key,
      name: a.name,
      from: ax.at(a.history.submittedAt || a.history.decidedAt) ?? ax.today,
      to: ax.at(a.history.closesAt) ?? ax.today,
      closesAt: a.history.closesAt || null,
      yourMove: a.history.standing === 'your_move',
    }));

  const again = agencies
    .filter((a) => a.group === 'later' && a.history?.againOn)
    .map((a) => ({ key: a.key, name: a.name, x: ax.at(a.history.againOn), on: a.history.againOn, beyond: toDate(a.history.againOn) > ax.end }))
    .sort((a, b) => a.x - b.x);

  const callMap = new Map();
  for (const e of placement?.calendar?.events || []) {
    if (e.kind !== 'open_call') continue;
    const id = `${e.name}|${e.label}`;
    const row = callMap.get(id) || { key: id, name: e.name, label: e.label, event: e, ticks: [] };
    row.ticks.push({ x: ax.at(e.date), date: e.date });
    callMap.set(id, row);
  }
  const calls = [...callMap.values()];

  const d = placement?.digitals;
  let digitals = null;
  if (d?.has && d.capturedOn) {
    digitals = {
      from: ax.at(d.capturedOn),
      due: d.dueOn ? ax.at(d.dueOn) : null,
      overdue: d.dueOn ? toDate(d.dueOn) < now : false,
      dueOn: d.dueOn,
    };
  }

  return { axis: ax, waiting, again, calls, digitals };
}

/** What is dated in the next seven days, plus anything waiting on the talent now. */
export function thisWeek(placement, now = new Date()) {
  const horizon = now.getTime() + 7 * DAY;
  const out = [];
  for (const a of placement?.agencies || []) {
    if (a.history?.standing === 'your_move') out.push({ when: null, kind: 'your_move', name: a.name });
  }
  const d = placement?.digitals;
  if (d?.has && d.dueOn && toDate(d.dueOn) <= new Date(horizon)) {
    out.push({ when: toDate(d.dueOn) < now ? null : d.dueOn, kind: 'digitals', name: null, overdue: toDate(d.dueOn) < now });
  }
  if (d && !d.has) out.push({ when: null, kind: 'no_digitals', name: null });
  for (const e of placement?.calendar?.events || []) {
    const t = toDate(e.date);
    if (!t || t.getTime() > horizon) continue;
    out.push({ when: e.date, kind: e.kind, name: e.name, event: e });
  }
  return out;
}
