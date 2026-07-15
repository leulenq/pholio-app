"use strict";

process.env.MINOR_SUBMISSION_ENFORCE = "1";

const {
  MINOR_SUBMISSION_ENDPOINT_MATRIX,
  MINOR_SUBMISSION_PERMISSION,
  extractApplicationIds,
  isGrantCurrent,
} = require("../../src/domains/agency/services/minor-submission-access");
const {
  getPresetPermissions,
  DANGEROUS_PERMISSIONS,
} = require("../../src/domains/agency/lib/permissions");

describe("minor submission endpoint access matrix", () => {
  test.each(
    MINOR_SUBMISSION_ENDPOINT_MATRIX.filter(
      ([, , strategy]) => strategy === "application_guard",
    ),
  )("%s %s is covered by the central application guard", (method, template) => {
    const id = "4af326df-49fc-4f3c-8b7e-71065fb8d5d1";
    const path = template.replace(":applicationId", id);
    expect(
      extractApplicationIds({ method, originalUrl: path, body: {} }),
    ).toEqual([id]);
  });

  test("every audited endpoint has one explicit enforcement strategy", () => {
    const keys = MINOR_SUBMISSION_ENDPOINT_MATRIX.map(
      ([method, path]) => `${method} ${path}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(MINOR_SUBMISSION_ENDPOINT_MATRIX.length).toBeGreaterThanOrEqual(25);
    for (const [, , strategy] of MINOR_SUBMISSION_ENDPOINT_MATRIX) {
      expect([
        "application_guard",
        "filtered_collection",
        "source_application_guard",
        "admin_permission_and_filter",
      ]).toContain(strategy);
    }
  });

  test("minor access is owner/admin-only by default and dangerous to delegate", () => {
    expect(getPresetPermissions("OWNER").has(MINOR_SUBMISSION_PERMISSION)).toBe(true);
    expect(getPresetPermissions("ADMIN").has(MINOR_SUBMISSION_PERMISSION)).toBe(true);
    expect(getPresetPermissions("AGENT").has(MINOR_SUBMISSION_PERMISSION)).toBe(false);
    expect(getPresetPermissions("SCOUT").has(MINOR_SUBMISSION_PERMISSION)).toBe(false);
    expect(getPresetPermissions("VIEWER").has(MINOR_SUBMISSION_PERMISSION)).toBe(false);
    expect(DANGEROUS_PERMISSIONS.has(MINOR_SUBMISSION_PERMISSION)).toBe(true);
  });

  test("bound grants fail closed on missing, expired, or revoked authorization", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isGrantCurrent({ minor_at_submission: false })).toBe(true);
    expect(
      isGrantCurrent({
        minor_at_submission: true,
        guardian_consent_expires_at: future,
      }),
    ).toBe(true);
    expect(
      isGrantCurrent({
        minor_at_submission: true,
        guardian_consent_expires_at: past,
      }),
    ).toBe(false);
    expect(
      isGrantCurrent({
        minor_at_submission: true,
        guardian_consent_expires_at: future,
        grant_revoked_at: new Date().toISOString(),
      }),
    ).toBe(false);
    expect(isGrantCurrent({ minor_at_submission: true })).toBe(false);
  });
});
