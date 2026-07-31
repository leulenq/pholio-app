"use strict";

const knex = require("knex");
const config = require("../../../knexfile");

const db = knex(config);

/**
 * Memoized schema introspection on the ROOT knex instance.
 *
 * WHY THIS EXISTS
 * ---------------
 * Roughly 90 `knex.schema.hasTable(...)` / `knex.schema.hasColumn(...)` calls
 * live in request-path code (feature guards for tables added by later
 * migrations) — e.g. src/shared/lib/data-export.js, the agency
 * minor-submission access checks, and the talent media upload route. They are
 * not free: each one is a live `information_schema` round-trip that checks out
 * a pooled connection for its duration.
 *
 * On Netlify Lambda the Postgres pool is `max: 5` (knexfile.js). A single
 * request that fans out several of these guards alongside its real queries can
 * hold every connection at once, so the next acquisition waits out
 * `acquireTimeoutMillis` and throws:
 *
 *     KnexTimeoutError: Knex: Timeout acquiring a connection.
 *                       The pool is probably full.
 *
 * That rejection frequently escapes an unawaited guard, AWS's own
 * `unhandledRejection` listener turns it into `Runtime.UnhandledPromiseRejection`,
 * and the container is killed — surfacing to users as random 500s on unrelated
 * requests. Removing these queries from the hot path removes the pressure that
 * starts the cascade.
 *
 * WHY CACHING IS SAFE
 * -------------------
 * Schema shape cannot change during a Lambda container's lifetime: migrations
 * run at deploy time, and a deploy recycles containers. So "does this table
 * exist?" is a constant for the life of this module. We cache the PROMISE, not
 * the value, so concurrent callers in the same tick share one in-flight query
 * instead of stampeding the pool — which is the exact moment the timeout would
 * otherwise fire. A rejected lookup is evicted so a transient connection blip
 * is never cached permanently.
 *
 * Outside production (local dev) entries carry a short TTL, because a developer
 * can run `npm run migrate` while the dev server is still up; without it the
 * server would keep reporting a pre-migration schema until restarted.
 *
 * Scope: the root instance's `.schema` only. Transaction-scoped calls
 * (`trx.schema.hasTable`) get their own builder from knex and are untouched.
 */

// Tests create and drop tables constantly, so a cache would go stale mid-suite.
// `scripts/run-jest.js` — the only sanctioned entrypoint (`npm test`) — sets
// both NODE_ENV=test and PHOLIO_SAFE_TEST_RUNNER=1 before spawning jest. We
// also honour JEST_WORKER_ID so that a bare `npx jest`, which sets neither, is
// still uncached rather than mysteriously broken.
const CACHE_DISABLED =
  process.env.NODE_ENV === "test" ||
  process.env.PHOLIO_SAFE_TEST_RUNNER === "1" ||
  process.env.JEST_WORKER_ID !== undefined;

// In production a container never outlives its schema, so entries are immortal.
const CACHE_TTL_MS = process.env.NODE_ENV === "production" ? Infinity : 30_000;

/** @type {Map<string, { promise: Promise<boolean>, expiresAt: number }>} */
const schemaCache = new Map();

// `schema` is a getter that returns a FRESH SchemaBuilder on every access, so
// each cached lookup must build its own — reusing one builder would queue
// multiple statements onto the same sequence.
const originalSchemaGetter = Object.getOwnPropertyDescriptor(db, "schema").get;
const freshSchema = () => originalSchemaGetter.call(db);

function memoizeSchemaLookup(key, run) {
  const cached = schemaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  // Promise.resolve() collapses the thenable SchemaBuilder into a real promise,
  // so callers awaiting or `.then`-ing the result behave exactly as before.
  const promise = Promise.resolve(run()).catch((error) => {
    // Evict on failure: a pool timeout or dropped connection must not become a
    // permanently cached "this table does not exist".
    const current = schemaCache.get(key);
    if (current && current.promise === promise) schemaCache.delete(key);
    throw error;
  });

  schemaCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  return promise;
}

function clearSchemaCache() {
  schemaCache.clear();
}

if (!CACHE_DISABLED) {
  // Redefine the `schema` getter (knex declares it `configurable: true`) so the
  // builder it hands out has memoizing `hasTable` / `hasColumn` shadowing the
  // prototype versions. Every other builder method is left completely alone,
  // so `knex.schema.createTable(...)` and friends are unaffected.
  Object.defineProperty(db, "schema", {
    configurable: true,
    get() {
      const builder = freshSchema();

      builder.hasTable = (tableName) =>
        memoizeSchemaLookup(`table:${tableName}`, () =>
          freshSchema().hasTable(tableName),
        );

      builder.hasColumn = (tableName, columnName) =>
        memoizeSchemaLookup(`column:${tableName}.${columnName}`, () =>
          freshSchema().hasColumn(tableName, columnName),
        );

      return builder;
    },
  });
}

/* ============================================================
   Pool teardown under the test runner

   57 test files call `knex.destroy()` in afterAll. Plenty of application
   code keeps working slightly past the end of a test — the PDF matte
   precompute queue, moderation column checks, session-store writes — and
   those in-flight queries then hit a destroyed pool and reject with
   "Unable to acquire a connection".

   Nothing awaits those rejections, so Node's default unhandled-rejection
   behaviour KILLED THE WHOLE PROCESS partway through `npm test`. Running
   the suite in one go was impossible: it died mid-run with no summary,
   regardless of which tests passed. Running by directory worked only
   because fewer files meant fewer chances to lose the race.

   The pool's real lifetime under the test runner is the process, which is
   what `--forceExit` in scripts/run-jest.js already assumes. So `destroy()`
   becomes a no-op there: the handle is reclaimed on exit, in-flight work
   completes harmlessly, and suites keep their existing afterAll hooks.

   Deliberately gated on the safe runner's own flag AND NODE_ENV, so this
   can never change behaviour in dev or production, where destroy() must
   genuinely close the pool.
   ============================================================ */
const UNDER_SAFE_TEST_RUNNER =
  process.env.NODE_ENV === "test" && process.env.PHOLIO_SAFE_TEST_RUNNER === "1";

if (UNDER_SAFE_TEST_RUNNER) {
  const realDestroy = db.destroy.bind(db);
  // knex defines `destroy` as non-writable on the callable, so plain
  // assignment throws in strict mode. Redefine it instead.
  Object.defineProperty(db, "destroy", {
    configurable: true,
    writable: true,
    // Resolves like the real thing, so `await knex.destroy()` still works.
    value: async () => undefined,
  });
  // Kept reachable for anything that genuinely must close the pool.
  Object.defineProperty(db, "destroyForReal", {
    configurable: true,
    writable: true,
    value: realDestroy,
  });
}

// The export stays the knex instance itself — a callable function carrying all
// of knex's properties — so `knex(...)`, `knex.raw`, `knex.transaction`, and
// every existing require() call site keep working unchanged.
module.exports = db;
module.exports.clearSchemaCache = clearSchemaCache;
