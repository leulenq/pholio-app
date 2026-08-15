"use strict";

/**
 * Two new application statuses for event casting: `confirmed` and
 * `declined_by_talent` (design §(c), ruling R5).
 *
 * An event slot offer is bilateral. The organizer offers (`accepted`), and
 * then the applicant has to answer — which no existing status can record.
 * `represented` is refused because it drives the roster and the represented
 * counter; `withdrawn` is refused because it redacts the package and hides the
 * row from the organizer who still has a slot to refill; `declined` is refused
 * because its notification copy makes the agency the actor.
 *
 * SQLITE, THE HARD PART (ruling R2)
 *
 * Three CHECK shapes exist in the wild because several status migrations ran
 * on PostgreSQL only. On a fresh SQLite schema the CHECK today is whatever
 * `20260701111000` last rebuilt — which predates `closed_no_response`, so
 * SQLite currently rejects a status the auto-close job writes. This migration
 * rebuilds from the canonical constant and repairs that divergence in passing.
 *
 * The rebuild is INTROSPECTIVE. It reads the live `CREATE TABLE` text out of
 * `sqlite_master`, rewrites only the status CHECK clause inside it, and copies
 * rows through the column list from `PRAGMA table_info`. It never states a
 * column list of its own: `20260701111000` hardcoded one, and every column
 * added to `applications` after it was written would have been silently
 * dropped had it run late. Index DDL is likewise replayed verbatim from
 * `sqlite_master` (enumerated via `PRAGMA index_list`, explicit indexes only)
 * rather than reconstructed, so partial indexes keep their WHERE clause.
 *
 * Transactions are off: the rebuild toggles `PRAGMA foreign_keys`, which is a
 * no-op inside a transaction, so it manages its own.
 */

exports.config = { transaction: false };

const {
  ALL_APPLICATION_STATUSES,
  TALENT_WRITABLE_APPLICATION_STATUSES,
} = require("../src/shared/constants/application-status");

/**
 * Generated from the constants module rather than restated here, so the
 * database vocabulary cannot drift from the code's (ruling R2). Exported for
 * the drift guard in `tests/migrations/event-casting-schema.test.js`.
 */
const ALLOWED = Object.freeze([...ALL_APPLICATION_STATUSES]);
const PRIOR = Object.freeze(
  ALLOWED.filter((status) => !TALENT_WRITABLE_APPLICATION_STATUSES.includes(status)),
);

exports.STATUS_CHECK_ALLOWED = ALLOWED;
exports.STATUS_CHECK_PRIOR = PRIOR;

const TABLE = "applications";

/* ------------------------------------------------------------------ PostgreSQL */

async function replacePgStatusCheck(knex, allowed) {
  await knex.raw(`
    DO $$
    DECLARE _cname TEXT;
    BEGIN
      SELECT conname INTO _cname
      FROM pg_constraint
      WHERE conrelid = 'applications'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
      LIMIT 1;
      IF _cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE applications DROP CONSTRAINT ' || quote_ident(_cname);
      END IF;
    END $$;
  `);
  const list = allowed.map((status) => `'${status}'`).join(", ");
  await knex.raw(`
    ALTER TABLE applications
      ADD CONSTRAINT applications_status_check
      CHECK (status IN (${list}))
  `);
}

/* ---------------------------------------------------------------------- SQLite */

/** Index of the closing quote that matches the opener at `start`. */
function skipQuoted(sql, start, quote) {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2; // doubled quote = escaped, keep going
        continue;
      }
      return i;
    }
    i += 1;
  }
  return sql.length - 1;
}

/** Index of the `)` matching the `(` at `openIndex`, skipping quoted text. */
function matchingParen(sql, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i, ch);
      continue;
    }
    if (ch === "[") {
      while (i < sql.length && sql[i] !== "]") i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Locate the `CHECK (...)` clause that constrains `status`.
 * @returns {{start:number,end:number,body:string}|null}
 */
function findStatusCheckClause(ddl) {
  const re = /\bCHECK\s*\(/gi;
  let match;
  while ((match = re.exec(ddl)) !== null) {
    const open = match.index + match[0].length - 1;
    const close = matchingParen(ddl, open);
    if (close === -1) continue;
    const body = ddl.slice(open + 1, close);
    if (/\bstatus\b/i.test(body)) {
      return { start: match.index, end: close + 1, body };
    }
    re.lastIndex = close + 1;
  }
  return null;
}

/** The literals a CHECK body already permits. */
function literalsIn(body) {
  return new Set((body.match(/'((?:[^']|'')*)'/g) || []).map((raw) => raw.slice(1, -1)));
}

/** Rewrite `CREATE TABLE applications` to create `applications_new` instead. */
function retargetCreateTable(ddl, newName) {
  const re = /^(\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)("applications"|`applications`|\[applications\]|applications)/i;
  if (!re.test(ddl)) {
    throw new Error(
      "Cannot locate the CREATE TABLE header for `applications` in sqlite_master; refusing to rebuild.",
    );
  }
  return ddl.replace(re, (_all, head) => `${head}"${newName}"`);
}

/**
 * Rebuild `applications` with a new status CHECK list.
 *
 * @param {import('knex').Knex} knex
 * @param {readonly string[]} allowed
 * @param {(present: Set<string>) => boolean} needsRebuild
 *   Decides from the CHECK the table already carries whether there is work to
 *   do — the up and down paths want opposite answers, and folding it in here
 *   keeps one copy of the procedure.
 */
async function rebuildSqliteStatusCheck(knex, allowed, needsRebuild) {
  const tableRow = await knex("sqlite_master")
    .select("sql")
    .where({ type: "table", name: TABLE })
    .first();
  const ddl = tableRow && tableRow.sql;
  if (!ddl) return;

  const clause = findStatusCheckClause(ddl);
  // No CHECK on this database — the column is free-form text and there is
  // nothing to widen. Adding one here would be a new constraint, not this
  // migration's job.
  if (!clause) return;

  if (!needsRebuild(literalsIn(clause.body))) return;

  const list = allowed.map((status) => `'${status}'`).join(", ");
  const rewritten = `${ddl.slice(0, clause.start)}check ("status" in (${list}))${ddl.slice(clause.end)}`;
  const createNew = retargetCreateTable(rewritten, `${TABLE}_new`);

  // Column list comes from the live table, never from this file.
  const columnInfo = await knex.raw(`PRAGMA table_info('${TABLE}')`);
  const columns = columnInfo.map((column) => `"${column.name}"`).join(", ");
  if (!columns) throw new Error("PRAGMA table_info returned no columns for applications.");

  // Explicit indexes only: origin 'pk'/'u' indexes are implied by the table
  // DDL we are carrying over, and re-creating them by hand would duplicate.
  const indexList = await knex.raw(`PRAGMA index_list('${TABLE}')`);
  const explicit = new Set(
    indexList.filter((index) => index.origin === "c").map((index) => index.name),
  );
  const objects = await knex("sqlite_master")
    .select("type", "name", "sql")
    .whereIn("type", ["index", "trigger"])
    .andWhere({ tbl_name: TABLE });
  const replay = objects
    .filter((row) => row.sql && (row.type === "trigger" || explicit.has(row.name)))
    .map((row) => row.sql);

  // Restored rather than forced back ON: this migration has no business
  // changing a setting it did not set, and a stray ON is what makes knex's own
  // SQLite column-drop rebuild cascade in later migrations.
  const [{ foreign_keys: wasEnabled }] = await knex.raw("PRAGMA foreign_keys");
  await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await knex.transaction(async (trx) => {
      await trx.raw(createNew);
      await trx.raw(
        `INSERT INTO "${TABLE}_new" (${columns}) SELECT ${columns} FROM "${TABLE}"`,
      );
      await trx.raw(`DROP TABLE "${TABLE}"`);
      await trx.raw(`ALTER TABLE "${TABLE}_new" RENAME TO "${TABLE}"`);
      for (const sql of replay) await trx.raw(sql);
    });
  } finally {
    if (wasEnabled) await knex.raw("PRAGMA foreign_keys = ON");
  }
}

/* ------------------------------------------------------------------------ up/down */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  if (knex.client.config.client === "pg") {
    await replacePgStatusCheck(knex, ALLOWED);
    return;
  }
  await rebuildSqliteStatusCheck(
    knex,
    ALLOWED,
    (present) => !ALLOWED.every((status) => present.has(status)),
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // Lossy but constraint-satisfying. A confirmation collapses back to the
  // offer that produced it; a decline collapses to the talent-side exit the
  // old vocabulary had. Neither round-trips, which is why the note is here.
  await knex(TABLE).where({ status: "confirmed" }).update({ status: "accepted" });
  await knex(TABLE)
    .where({ status: "declined_by_talent" })
    .update({ status: "withdrawn" });

  if (knex.client.config.client === "pg") {
    await replacePgStatusCheck(knex, PRIOR);
    return;
  }

  await rebuildSqliteStatusCheck(knex, PRIOR, (present) =>
    TALENT_WRITABLE_APPLICATION_STATUSES.some((status) => present.has(status)),
  );
};
