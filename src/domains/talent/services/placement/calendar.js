"use strict";

/**
 * Placement — the next six months (tasks/intel-placement.md §4).
 *
 * Dated facts only: verified walk-in open calls, the day an agency is worth
 * trying again, the day an open submission's review window closes, and the day
 * the talent's digitals go out of date. No invented "season" markers.
 */

const knex = require("../../../../shared/db/knex");

const HORIZON_DAYS = 182;
const DAY = 86_400_000;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

async function loadWindows() {
  try {
    if (!(await knex.schema.hasTable("agency_call_windows"))) return [];
    return await knex("agency_call_windows")
      .where({ active: true })
      .select(
        "id",
        "organization_id",
        "agency_id",
        "display_name",
        "label",
        "weekday",
        "start_minute",
        "end_minute",
        "timezone",
        "location",
        "source_url",
      );
  } catch {
    return [];
  }
}

/**
 * @param {object} args
 * @param {object[]} args.agencies  buildAgencies().agencies
 * @param {string|null} args.digitalsDueOn
 */
async function buildCalendar({ agencies, digitalsDueOn, now = new Date() }) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + HORIZON_DAYS * DAY);
  const inRange = (d) => d && d >= start && d < end;
  const events = [];

  // An agency whose published rules exclude the talent, or who said another
  // market suits them, does not get its open calls put on their calendar.
  const quiet = new Set(
    agencies.filter((a) => a.group === "not_now").map((a) => a.name.toLowerCase()),
  );
  for (const w of await loadWindows()) {
    if (quiet.has(String(w.display_name).toLowerCase())) continue;
    for (let t = start.getTime(); t < end.getTime(); t += DAY) {
      const d = new Date(t);
      if (d.getUTCDay() !== Number(w.weekday)) continue;
      events.push({
        date: dayKey(d),
        kind: "open_call",
        name: w.display_name,
        label: w.label,
        startMinute: w.start_minute == null ? null : Number(w.start_minute),
        endMinute: w.end_minute == null ? null : Number(w.end_minute),
        timezone: w.timezone,
        location: w.location || null,
        sourceUrl: w.source_url || null,
      });
    }
  }

  for (const a of agencies) {
    const h = a.history;
    if (!h) continue;
    if (h.againOn && a.group === "later" && inRange(new Date(h.againOn))) {
      events.push({ date: h.againOn.slice(0, 10), kind: "again", name: a.name });
    }
    if (h.closesAt && inRange(new Date(h.closesAt))) {
      events.push({ date: h.closesAt.slice(0, 10), kind: "closes", name: a.name });
    }
  }

  if (digitalsDueOn) {
    const d = new Date(`${String(digitalsDueOn).slice(0, 10)}T00:00:00Z`);
    if (inRange(d)) events.push({ date: dayKey(d), kind: "digitals", name: null });
  }

  const order = { closes: 0, again: 1, digitals: 2, open_call: 3 };
  events.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  return { from: dayKey(start), days: HORIZON_DAYS, events };
}

module.exports = { buildCalendar, HORIZON_DAYS };
