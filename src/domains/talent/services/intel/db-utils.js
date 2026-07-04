/**
 * Dialect-safe helpers for intel aggregation queries.
 *
 * SQLite stores `knex.fn.now()` as 'YYYY-MM-DD HH:MM:SS' while seeds and some
 * writers store ISO strings — naive string/Date comparisons silently miss rows
 * (see the 2026-06-27 website-analytics fix). All range predicates here go
 * through `datetime()` on SQLite and native timestamps on Postgres.
 */

const knex = require("../../../../shared/db/knex");

const isPg = () => knex.client.config.client === "pg";

function whereSince(qb, column, date) {
  if (isPg()) return qb.where(column, ">=", date);
  return qb.whereRaw(`datetime(${column}) >= datetime(?)`, [
    date.toISOString(),
  ]);
}

function whereBefore(qb, column, date) {
  if (isPg()) return qb.where(column, "<", date);
  return qb.whereRaw(`datetime(${column}) < datetime(?)`, [date.toISOString()]);
}

/** Parse a timestamp column value from either dialect into a Date. */
function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  // SQLite CURRENT_TIMESTAMP is UTC without timezone marker.
  if (!s.includes("T")) return new Date(`${s.replace(" ", "T")}Z`);
  return new Date(s);
}

/** UTC day key 'YYYY-MM-DD'. */
function dayKey(date) {
  const d = parseDbDate(date);
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/** List of UTC day keys for the window [start, start + days). */
function dayRange(start, days) {
  const out = [];
  const base = new Date(start);
  for (let i = 0; i < days; i += 1) {
    out.push(
      new Date(base.getTime() + i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    );
  }
  return out;
}

function daysAgo(n, from = new Date()) {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
}

module.exports = { whereSince, whereBefore, parseDbDate, dayKey, dayRange, daysAgo, isPg };
