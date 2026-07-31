"use strict";

/**
 * Isolated, migrated + seeded database for suites that exercise real
 * application queries end to end.
 *
 * WHY THIS EXISTS
 *
 * A handful of suites were written to run against a developer's own dev
 * database and said so out loud: their beforeAll threw
 * "talent@example.com not found in DB — run `npm run seed` first". Under
 * scripts/run-jest.js each run gets a fresh, empty SQLite file, so those
 * suites could never pass — they failed 100% with either that message or
 * "no such table: users". They were effectively dead tests.
 *
 * They cannot simply migrate the shared run database: many other suites
 * hand-build their own `users`, `boards` and `profiles` tables on it
 * WITHOUT dropping first, so a migrated schema would collide and break
 * them instead. Each of these suites therefore gets its own file, which is
 * the pattern tests/agency-overview.test.js already uses.
 *
 * ORDER MATTERS: call `useIsolatedDatabase()` BEFORE requiring
 * src/shared/db/knex — the connection is resolved when that module loads.
 */

const fs = require("fs");
const path = require("path");

/**
 * Point this test file at its own SQLite database.
 *
 * @param {string} name Unique per suite; becomes the filename.
 * @returns {string} Absolute path, for cleanup in afterAll.
 */
function useIsolatedDatabase(name) {
  const file = path.resolve(__dirname, "..", "..", `test-${name}.sqlite3`);
  // Start from a clean slate so a crashed previous run cannot leave a
  // half-migrated file behind and make failures look intermittent.
  if (fs.existsSync(file)) fs.unlinkSync(file);

  process.env.DATABASE_URL = `sqlite://${file}`;
  process.env.DB_CLIENT = "sqlite3";
  return file;
}

/** Schema only. Use when a suite inserts its own fixtures — seeding the full
 *  demo dataset takes seconds and is pure waste for those. */
async function migrate(knex) {
  await knex.migrate.latest();
}

/**
 * Bring the isolated database up to the real schema and load seed data, so
 * `talent@example.com` and friends exist exactly as the suites expect.
 *
 * Slow enough to exceed Jest's 5s default hook timeout — callers must pass a
 * longer timeout as the second argument to beforeAll.
 */
async function migrateAndSeed(knex) {
  await migrate(knex);
  await knex.seed.run();
}

/** Remove the file. Safe to call when it was never created. */
function dropIsolatedDatabase(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // A lingering handle on Windows is not worth failing a suite over.
  }
}

module.exports = {
  useIsolatedDatabase,
  migrate,
  migrateAndSeed,
  dropIsolatedDatabase,
};
