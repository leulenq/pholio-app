"use strict";

const {
  resolveEffectivePermissionsFromSession,
} = require("../../src/domains/agency/services/permissions");
const {
  hasPermission,
} = require("../../src/domains/agency/lib/permissions");

function authorizationDb({ membershipRole = "VIEWER", active = true } = {}) {
  const db = jest.fn((table) => {
    if (table === "agency_memberships as membership") {
      const builder = {
        join: jest.fn(() => builder),
        where: jest.fn(() => builder),
        select: jest.fn(() => builder),
        first: jest.fn(async () =>
          active
            ? { id: "membership-1", membership_role: membershipRole }
            : undefined,
        ),
      };
      return builder;
    }

    if (table === "agency_membership_permissions") {
      const builder = {
        where: jest.fn(() => builder),
        select: jest.fn(async () => []),
      };
      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
  db.schema = { hasTable: jest.fn(async () => true) };
  return db;
}

function staleAdminSession() {
  return {
    role: "AGENCY",
    userId: "agency-1",
    agencyId: "agency-1",
    memberUserId: "user-1",
    agencyMembershipId: "membership-1",
    agencyMembershipRole: "ADMIN",
  };
}

describe("prelaunch agency authorization boundaries", () => {
  test("an old ADMIN cookie immediately uses the current VIEWER role", async () => {
    const session = staleAdminSession();
    const permissions = await resolveEffectivePermissionsFromSession(
      session,
      authorizationDb({ membershipRole: "VIEWER" }),
    );

    expect(session.agencyMembershipRole).toBe("VIEWER");
    expect(hasPermission(permissions, "applications.view_list")).toBe(true);
    expect(hasPermission(permissions, "org.export_data")).toBe(false);
  });

  test("a removed member cannot resolve permissions from an old cookie", async () => {
    await expect(
      resolveEffectivePermissionsFromSession(
        staleAdminSession(),
        authorizationDb({ active: false }),
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED" });
  });
});
