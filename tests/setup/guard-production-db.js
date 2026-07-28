"use strict";

/**
 * Refuse to run the test suite against PostgreSQL.
 *
 * `npm test` goes through scripts/run-jest.js, which forces DB_CLIENT=sqlite3,
 * deletes DATABASE_URL and sets PHOLIO_SAFE_TEST_RUNNER=1 — knexfile.js then
 * skips loading `.env` entirely. That is the only safe path.
 *
 * Running `npx jest` directly skips run-jest.js. knexfile.js sees no safe-runner
 * flag, loads `.env`, and the destructive migration/seed/integration suites run
 * against whatever DATABASE_URL a developer happens to have there — which in
 * this project is the production Neon database. That has already destroyed
 * production data once.
 *
 * jest `setupFiles` run before each test module is imported, so this aborts
 * before any suite can open a connection. `.env` is parsed rather than loaded
 * so this check sees exactly what knexfile.js would, without itself polluting
 * process.env.
 */

const fs = require("fs");
const path = require("path");

if (process.env.PHOLIO_SAFE_TEST_RUNNER !== "1") {
  const envPath = path.join(__dirname, "..", "..", ".env");

  let fromEnvFile = {};
  if (fs.existsSync(envPath)) {
    try {
      fromEnvFile = require("dotenv").parse(fs.readFileSync(envPath));
    } catch {
      fromEnvFile = {};
    }
  }

  // Mirror knexfile.js resolution: real process env wins, `.env` fills the gaps.
  const databaseUrl = process.env.DATABASE_URL || fromEnvFile.DATABASE_URL || "";
  const dbClient = (
    process.env.DB_CLIENT ||
    fromEnvFile.DB_CLIENT ||
    "sqlite3"
  ).toLowerCase();

  const looksPostgres =
    dbClient === "pg" ||
    dbClient === "postgres" ||
    dbClient === "postgresql" ||
    /^postgres(ql)?:\/\//i.test(databaseUrl);

  if (looksPostgres) {
    let host = "(unparseable)";
    try {
      if (databaseUrl) host = new URL(databaseUrl).host;
    } catch {
      /* leave placeholder */
    }

    throw new Error(
      [
        "",
        "  Refusing to run tests against PostgreSQL.",
        "",
        `    resolved DB_CLIENT:   ${dbClient}`,
        `    resolved host:        ${host}`,
        "",
        "  The suite contains destructive migration, seed and integration tests.",
        "  Pointed at a real database they will delete its data.",
        "",
        "  Run the guarded entrypoint instead, which forces an isolated SQLite file:",
        "",
        "    npm test                          # whole suite",
        "    npm test -- path/to/file.test.js  # one file",
        "    npm test -- -t 'test name'        # one test",
        "",
      ].join("\n"),
    );
  }
}
