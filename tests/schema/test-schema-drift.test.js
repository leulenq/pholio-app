"use strict";

/**
 * Hand-built test schemas must not invent columns.
 *
 * Most suites here build their tables by hand rather than running migrations —
 * it is fast and keeps a suite's fixtures readable. The cost is that a test
 * schema can drift from the real one, and when it does the drift is *invisible
 * in the direction that matters*: a query naming a column the production table
 * does not have passes against the invented schema and throws in the running
 * app.
 *
 * That has now happened twice in one feature. `tests/integration/
 * digitals-freshness-route.test.js` declared `images.file_path` (the real column
 * is `path`) and `images.updated_at` (there is no such column — only
 * `created_at`). Both suites were green; both endpoints 500'd against a real
 * database, one of them on the write path of a feature that had been
 * demonstrated in a browser.
 *
 * So: for every table a test creates that *also* exists in the migrated schema,
 * every column it declares must exist there too. Declaring a subset is fine and
 * expected — a suite only needs the columns it touches. Declaring something the
 * real table lacks is the failure.
 *
 * Tables with no migrated counterpart are skipped: a suite is free to invent a
 * fixture table wholesale, since no production query will ever read it.
 *
 * This is a static scan rather than an execution: the schemas live inside test
 * files that cannot be imported without running them.
 */

const fs = require("fs");
const path = require("path");
const knex = require("../../src/shared/db/knex");

const TESTS_DIR = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

/** Knex builders that declare a column. Everything else (index, unique, primary, foreign) does not. */
const COLUMN_METHODS = new Set([
  "string", "text", "integer", "bigInteger", "bigint", "boolean", "timestamp",
  "datetime", "date", "time", "decimal", "float", "double", "uuid", "json",
  "jsonb", "binary", "enum", "enu", "increments", "bigIncrements",
  "specificType", "tinyint", "smallint",
]);

/**
 * Columns a suite may legitimately declare that the migrated schema lacks.
 *
 * Each entry is a column a migration has since dropped, kept by a suite that
 * still exercises the older shape. They are listed rather than fixed so the
 * guard can go in now; removing one means updating that suite to the current
 * schema. Nothing may be added here without the same justification.
 */
const KNOWN_DRIFT = {
  // Dropped when profile AI analysis was removed; these suites assert the
  // fail-closed behaviour around the columns' historical presence.
  // (image_analysis / image_analyzed_at / image_analysis_model left this list
  // when 20260902090000 finally created them — the vision write path had been
  // throwing into a swallowed catch because they existed nowhere.)
  "profiles.look_descriptor": true,
  "profiles.look_descriptor_generated_at": true,
  "profiles.booking_lanes": true,
  // Dropped by migrations/20260820110000_drop_profiles_archetype.js (dead
  // legacy archetype/vibe/market-fit column, always null in production).
  // tests/security/ai-launch-fail-closed.test.js still asserts fail-closed
  // nulling behaviour around its historical presence.
  "profiles.archetype": true,
  // Image retirement moved to `status`; two spec-registry suites still model it.
  "images.retired_at": true,
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Pull `createTable` declarations out of a test file.
 *
 * A block runs from one `createTable(` to the next, which over-reads slightly —
 * harmless, because a column attributed to the wrong table is still checked
 * against a real table, and the guard only fails on columns no table has.
 */
function extractDeclarations(file) {
  const source = fs.readFileSync(file, "utf8");
  const opens = [];
  const openRe = /createTable\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;
  let match;
  while ((match = openRe.exec(source)) !== null) {
    opens.push({ table: match[1], index: match.index });
  }

  return opens.map((open, i) => {
    const block = source.slice(open.index, i + 1 < opens.length ? opens[i + 1].index : source.length);
    const columns = new Set();
    const colRe = /\btable\.([A-Za-z]+)\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;
    let col;
    while ((col = colRe.exec(block)) !== null) {
      if (COLUMN_METHODS.has(col[1])) columns.add(col[2]);
    }
    return { file, table: open.table, columns: [...columns] };
  });
}

let realSchema;

beforeAll(async () => {
  // The migrated schema is the truth. `run-jest.js` has already pointed knex at
  // an isolated SQLite file, so this migrates that file rather than anything real.
  await knex.migrate.latest({ directory: MIGRATIONS_DIR });

  realSchema = new Map();
  const tables = new Set(
    walk(TESTS_DIR).flatMap((file) => extractDeclarations(file).map((d) => d.table)),
  );
  for (const table of tables) {
    if (await knex.schema.hasTable(table)) {
      const info = await knex.raw(`PRAGMA table_info('${table}')`);
      realSchema.set(table, new Set(info.map((column) => column.name)));
    }
  }
}, 120000);

afterAll(async () => {
  await knex.destroy();
});

test("the scan actually finds the hand-built schemas", () => {
  // A guard that silently matches nothing is worse than no guard.
  const declarations = walk(TESTS_DIR).flatMap(extractDeclarations);
  expect(declarations.length).toBeGreaterThan(100);
  expect(realSchema.size).toBeGreaterThan(20);
});

test("no test schema declares a column the real table does not have", () => {
  const offences = [];

  for (const declaration of walk(TESTS_DIR).flatMap(extractDeclarations)) {
    const real = realSchema.get(declaration.table);
    // A table with no migrated counterpart is a pure fixture — nothing in
    // production will ever query it, so it cannot hide a bad column name.
    if (!real) continue;

    for (const column of declaration.columns) {
      if (real.has(column)) continue;
      if (KNOWN_DRIFT[`${declaration.table}.${column}`]) continue;
      offences.push(
        `${path.relative(TESTS_DIR, declaration.file)} — ${declaration.table}.${column}`,
      );
    }
  }

  expect(offences).toEqual([]);
});

test("every known-drift entry is still drifting", () => {
  // Otherwise the allowlist outlives the problem and starts hiding new ones.
  const stale = Object.keys(KNOWN_DRIFT).filter((key) => {
    const [table, column] = key.split(".");
    const real = realSchema.get(table);
    return real && real.has(column);
  });

  expect(stale).toEqual([]);
});
