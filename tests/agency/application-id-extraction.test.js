"use strict";

/**
 * A collection route is not an application id.
 *
 * `extractApplicationIds` fed whatever followed `/applications/` into a lookup
 * against `applications.id`. On PostgreSQL that column is a real `uuid`, so a
 * path segment like `compare` produced `invalid input syntax for type uuid` and
 * a 500 — for a route that was otherwise correct. SQLite is untyped and matches
 * nothing, which is why the whole class of failure was invisible in the suite
 * and only appeared against production.
 *
 * The old guard was a denylist of one (`bulk-`). These tests hold the inverted
 * rule: an id is recognised by having the shape of one.
 */

const {
  extractApplicationIds: extract,
} = require("../../src/domains/agency/services/minor-submission-access");

const UUID = "3f8ab87e-97db-4215-854c-24df8b3b3930";
const OTHER = "c94945f4-7e3e-4ba0-ae8a-4a1b1a98a7ca";

const req = (url, body = null) => ({ originalUrl: url, url, body });

describe("collection routes are never mistaken for ids", () => {
  test.each([
    ["/api/agency/applications/compare"],
    ["/api/agency/applications/bulk-decline"],
    ["/api/agency/applications/bulk-archive"],
    ["/api/agency/applications/export"],
  ])("%s yields no application id", (url) => {
    expect(extract(req(url))).toEqual([]);
  });
});

describe("real ids are still found", () => {
  test("from the path", () => {
    expect(extract(req(`/api/agency/applications/${UUID}/details`))).toEqual([UUID]);
  });

  test("from the body, both spellings", () => {
    expect(
      extract(req("/api/agency/applications/compare", { applicationIds: [UUID, OTHER] })),
    ).toEqual([UUID, OTHER]);
    expect(
      extract(req("/api/agency/applications/bulk-decline", { application_ids: [UUID] })),
    ).toEqual([UUID]);
  });

  test("path and body ids are merged without duplicates", () => {
    expect(
      extract(req(`/api/agency/applications/${UUID}/decline`, { applicationIds: [UUID, OTHER] })),
    ).toEqual([UUID, OTHER]);
  });
});

describe("junk in the body cannot reach a uuid column", () => {
  test("non-uuid body entries are dropped rather than queried", () => {
    expect(
      extract(req("/api/agency/applications/compare", {
        applicationIds: [UUID, "compare", "", "1; DROP TABLE applications", null],
      })),
    ).toEqual([UUID]);
  });

  test("a body that is not an array is ignored", () => {
    expect(extract(req("/api/agency/applications/compare", { applicationIds: UUID }))).toEqual([]);
  });
});
