"use strict";

const {
  computeEffectivePermissions,
  hasPermission,
  normalizePresetRole,
  canAssignRole,
  PRESET_ROLES,
  ALL_PERMISSIONS,
} = require("../../src/domains/agency/lib/permissions");

describe("agency RBAC permissions", () => {
  test("normalizes legacy MEMBER to SCOUT", () => {
    expect(normalizePresetRole("MEMBER")).toBe("SCOUT");
  });

  test("OWNER receives full catalog", () => {
    const effective = computeEffectivePermissions("OWNER", []);
    expect(effective.size).toBe(ALL_PERMISSIONS.length);
    expect(hasPermission(effective, "org.transfer_ownership")).toBe(true);
  });

  test("SCOUT cannot accept applications by default", () => {
    const effective = computeEffectivePermissions("SCOUT", []);
    expect(hasPermission(effective, "applications.accept")).toBe(false);
    expect(hasPermission(effective, "discover.invite")).toBe(true);
    expect(hasPermission(effective, "applications.update_status")).toBe(true);
  });

  test("AGENT can accept but not edit org settings", () => {
    const effective = computeEffectivePermissions("AGENT", []);
    expect(hasPermission(effective, "applications.accept")).toBe(true);
    expect(hasPermission(effective, "org.edit_settings")).toBe(false);
  });

  test("VIEWER is read-only", () => {
    const effective = computeEffectivePermissions("VIEWER", []);
    expect(hasPermission(effective, "applications.view_list")).toBe(true);
    expect(hasPermission(effective, "notes.create")).toBe(false);
    expect(hasPermission(effective, "messages.send")).toBe(false);
  });

  test("ALLOW grant adds permission to SCOUT", () => {
    const effective = computeEffectivePermissions("SCOUT", [
      { permission_key: "applications.accept", effect: "ALLOW" },
    ]);
    expect(hasPermission(effective, "applications.accept")).toBe(true);
  });

  test("DENY grant removes preset permission", () => {
    const effective = computeEffectivePermissions("AGENT", [
      { permission_key: "applications.accept", effect: "DENY" },
    ]);
    expect(hasPermission(effective, "applications.accept")).toBe(false);
    expect(hasPermission(effective, "applications.decline")).toBe(true);
  });

  test("DENY wins over ALLOW", () => {
    const effective = computeEffectivePermissions("AGENT", [
      { permission_key: "applications.accept", effect: "ALLOW" },
      { permission_key: "applications.accept", effect: "DENY" },
    ]);
    expect(hasPermission(effective, "applications.accept")).toBe(false);
  });

  test("OWNER ignores deny grants", () => {
    const effective = computeEffectivePermissions("OWNER", [
      { permission_key: "applications.accept", effect: "DENY" },
    ]);
    expect(hasPermission(effective, "applications.accept")).toBe(true);
  });

  test("role assignment rules", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "AGENT")).toBe(true);
    expect(canAssignRole("AGENT", "SCOUT")).toBe(false);
    expect(canAssignRole("OWNER", "OWNER")).toBe(false);
  });

  test("all preset roles are defined", () => {
    for (const role of PRESET_ROLES) {
      const effective = computeEffectivePermissions(role, []);
      expect(effective.size).toBeGreaterThan(0);
    }
  });
});
