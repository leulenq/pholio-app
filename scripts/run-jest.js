"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const generatedDatabasePath = path.join(
  "/tmp",
  `pholio-jest-${process.pid}.sqlite3`,
);
const requestedDatabase = process.env.TEST_DATABASE_URL || null;

if (requestedDatabase && !requestedDatabase.startsWith("sqlite://")) {
  console.error(
    "Refusing to run Jest against a non-SQLite database. Set TEST_DATABASE_URL to an isolated sqlite:// path.",
  );
  process.exit(1);
}

// Never let a developer's application .env leak into destructive migration,
// seed, or integration tests. Individual suites may choose another SQLite file
// before importing Knex, but PostgreSQL is intentionally unavailable here.
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.PHOLIO_SAFE_TEST_RUNNER = "1";
process.env.PHOLIO_SAFE_DEFAULT_DATABASE = generatedDatabasePath;
if (requestedDatabase) {
  process.env.DATABASE_URL = requestedDatabase;
} else {
  delete process.env.DATABASE_URL;
}
delete process.env.AGENCY_LEGAL_ENFORCE;
delete process.env.MINOR_SUBMISSION_ENFORCE;

// pdfjs-dist ships ESM only from v4 on, and `src/shared/lib/pdf-text.js` reaches
// it with a dynamic import. Jest's VM realm rejects that without this flag. The
// alternative — pinning pdfjs to the last CJS release, 3.11 — would mean parsing
// untrusted uploaded PDFs on a build that predates the CVE-2024-4367 fix.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--experimental-vm-modules"]
  .filter(Boolean)
  .join(" ");

const jestBin = path.join(
  __dirname,
  "..",
  "node_modules",
  "jest",
  "bin",
  "jest.js",
);
const result = spawnSync(process.execPath, [jestBin, ...process.argv.slice(2)], {
  cwd: path.join(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
});

if (!requestedDatabase) {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${generatedDatabasePath}${suffix}`, { force: true });
  }
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
