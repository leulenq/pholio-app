// tests/unit/agency-route-coverage.test.js
"use strict";

/**
 * SEC-0.5 / audit P0-6..P0-8 coverage guard.
 *
 * Walks the ACTUAL agency router stack (src/domains/agency/routes/index.js) and
 * asserts that every registered unsafe-method (POST/PUT/PATCH/DELETE)
 * `/api/agency/*` endpoint resolves to a non-null permission via
 * resolveRoutePermission. Because enforceAgencyRoutePermissions now FAILS CLOSED
 * for unmapped unsafe methods, an unmapped write route would 403 in production —
 * this test catches that coverage gap at build time instead.
 *
 * Safe methods (GET/HEAD) are reported but not required (they fail *open* during
 * the transition), so a missing GET mapping is surfaced without failing CI.
 */

const agencyRoutes = require("../../src/domains/agency/routes/index");
const {
  resolveRoutePermission,
  ROUTE_PERMISSION_RULES,
} = require("../../src/domains/agency/lib/route-permissions");
const { ALL_PERMISSIONS } = require("../../src/domains/agency/lib/permissions");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Recursively collect { method, path } for every route in an Express router
// tree. Sub-routers (router.use(subRouter)) are nested layers whose handle has
// its own .stack; guard middleware layers (router.use("/api/agency", ...)) have
// no .route and are skipped.
function collectRoutes(stack, acc = []) {
  for (const layer of stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const methods = layer.route.methods || {};
      for (const method of Object.keys(methods)) {
        if (methods[method]) {
          acc.push({ method: method.toUpperCase(), path: routePath });
        }
      }
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      collectRoutes(layer.handle.stack, acc);
    }
  }
  return acc;
}

// Turn an Express path pattern into a concrete URL by substituting a token for
// each `:param` segment (tokens never contain a slash, matching [^/]+ patterns).
function concretize(routePath) {
  return routePath
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "sample" : seg))
    .join("/");
}

const allRoutes = collectRoutes(agencyRoutes.stack);
const agencyApiRoutes = allRoutes.filter((r) =>
  r.path.startsWith("/api/agency"),
);
const unsafeApiRoutes = agencyApiRoutes.filter((r) =>
  UNSAFE_METHODS.has(r.method),
);

describe("agency route permission coverage", () => {
  test("router stack introspection actually found agency API routes", () => {
    // Guard against a silent walker failure yielding an empty (vacuously
    // passing) set.
    expect(agencyApiRoutes.length).toBeGreaterThan(30);
    expect(unsafeApiRoutes.length).toBeGreaterThan(10);
  });

  test("every unsafe-method /api/agency route maps to a permission", () => {
    const unmapped = [];
    for (const { method, path } of unsafeApiRoutes) {
      const url = concretize(path);
      const permission = resolveRoutePermission(method, url);
      if (!permission) {
        unmapped.push(`${method} ${path} (as ${url})`);
      }
    }

    expect(unmapped).toEqual([]);
  });

  test("every mapped rule references a known permission key", () => {
    const known = new Set(ALL_PERMISSIONS);
    const unknown = ROUTE_PERMISSION_RULES.filter(
      (rule) => !known.has(rule.permission),
    ).map((rule) => `${rule.method} ${rule.pattern} -> ${rule.permission}`);

    expect(unknown).toEqual([]);
  });

  test("known write endpoints resolve to their expected permissions", () => {
    // A hardcoded backstop that does not depend on stack introspection, so the
    // newly-guarded families can never silently regress to unmapped.
    const expectations = [
      ["POST", "/api/agency/open-call/links", "open_call.manage"],
      ["PATCH", "/api/agency/open-call/links/abc", "open_call.manage"],
      ["POST", "/api/agency/boards/abc/rank", "matching.rank"],
      [
        "POST",
        "/api/agency/boards/abc/candidates/def/decision",
        "matching.decide",
      ],
      ["POST", "/api/agency/roster/abc/measured", "roster.manage_status"],
      ["DELETE", "/api/agency/roster/abc/measured", "roster.manage_status"],
      ["PATCH", "/api/agency/setup/profile", "org.complete_onboarding"],
      ["POST", "/api/agency/setup/complete", "org.complete_onboarding"],
      ["POST", "/api/agency/import-jobs", "org.complete_onboarding"],
      ["POST", "/api/agency/messages/read-all", "messages.mark_read"],
    ];

    for (const [method, url, expected] of expectations) {
      expect(resolveRoutePermission(method, url)).toBe(expected);
    }
  });

  test("safe /api/agency reads resolve where a fairness/open-call view exists", () => {
    expect(
      resolveRoutePermission("GET", "/api/agency/boards/abc/fairness"),
    ).toBe("matching.view_fairness");
    expect(resolveRoutePermission("GET", "/api/agency/open-call/links")).toBe(
      "open_call.view",
    );
  });
});
