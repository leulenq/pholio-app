"use strict";

/**
 * `GET /api/agency/activity` (src/domains/agency/routes/activity.js).
 *
 * Regression: `application_activities.metadata` is a jsonb column, and
 * PostgreSQL's driver hands it back to Knex already parsed into a plain
 * object — SQLite (and MySQL) hand it back as a JSON string. The old code
 * always ran `JSON.parse(row.metadata)` unconditionally. On Postgres that
 * meant `JSON.parse(anObject)`, which coerces the object to the string
 * `"[object Object]"`, throws a SyntaxError, is swallowed by the bare
 * `catch (_) {}`, and silently resets every activity row's metadata to
 * `{}` in production — the exact environment this table actually runs on.
 * The fix checks `typeof row.metadata === "object"` first and passes it
 * through unchanged.
 *
 * SQLite cannot itself hand back an object for a text column, so this
 * exercises the route's real logic against a stubbed `knex` whose rows
 * simulate the pg-jsonb shape directly (an object, not a string) rather
 * than a live SQLite integration test. The route handler is invoked
 * directly (bypassing the requireRole/onboarding/legal-acceptance guard
 * chain mounted via mountAgencyApiGuard, which is not under test here).
 */

jest.mock("../../src/shared/db/knex", () => {
  function makeBuilder() {
    let isCount = false;
    const builder = {
      join: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orWhere: () => builder,
      select: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      count: () => {
        isCount = true;
        return builder;
      },
      then: (resolve, reject) => {
        try {
          if (isCount) {
            resolve([{ total: 1 }]);
          } else {
            resolve([
              {
                id: "activity-1",
                created_at: new Date().toISOString(),
                activity_type: "status_change",
                description: "Not moving forward",
                // Simulates what node-postgres hands back for a jsonb
                // column: an already-parsed plain object, never a string.
                metadata: { old_status: "pending", new_status: "declined" },
                application_id: "application-1",
                profile_id: "profile-1",
                talentName: "Ada Test",
                talentImage: null,
                board_name: null,
                board_id: null,
              },
            ]);
          }
        } catch (err) {
          reject(err);
        }
      },
      catch: () => builder,
    };
    return builder;
  }

  const knexMock = jest.fn(() => makeBuilder());
  knexMock.raw = jest.fn((sql) => sql);
  knexMock.schema = {
    hasTable: jest.fn().mockResolvedValue(false),
    hasColumn: jest.fn().mockResolvedValue(false),
  };
  return knexMock;
});

const activityRouter = require("../../src/domains/agency/routes/activity");

function findRouteHandler(router, routePath, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method],
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route for ${routePath}`);
  }
  const handlers = layer.route.stack.map((s) => s.handle);
  // The route's own handler is the last middleware in its stack (after
  // requireRole, which we deliberately bypass here).
  return handlers[handlers.length - 1];
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("GET /api/agency/activity", () => {
  test("an already-parsed jsonb-shaped metadata object passes through unchanged", async () => {
    const handler = findRouteHandler(
      activityRouter,
      "/api/agency/activity",
      "get",
    );

    const req = { session: { agencyId: "agency-1" }, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].metadata).toEqual({
      old_status: "pending",
      new_status: "declined",
    });
  });
});
