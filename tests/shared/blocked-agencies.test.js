const {
  parsePrivacyPreferences,
  normalizeBlockedTerms,
  getBlockedAgencyIds,
  isAgencyBlockedForTalent,
  validateHttpsAttachmentUrl,
} = require("../../src/shared/lib/blocked-agencies");

describe("blocked-agencies", () => {
  it("parsePrivacyPreferences reads JSON string blockedAgencies", () => {
    const prefs = parsePrivacyPreferences(
      '{"blockedAgencies":["Elite Models","test-agency"]}',
    );
    expect(prefs.blockedAgencies).toEqual(["Elite Models", "test-agency"]);
  });

  it("normalizeBlockedTerms dedupes case-insensitively", () => {
    expect(normalizeBlockedTerms(["Agency A", "agency a", "  B  "])).toEqual([
      "agency a",
      "b",
    ]);
  });

  it("getBlockedAgencyIds resolves names and slugs to agency IDs", async () => {
    const agenciesQuery = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ id: "agency-1" }, { id: "agency-2" }]),
    };
    const knex = jest.fn((table) => {
      if (table === "talent_user_settings") {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            privacy_preferences: { blockedAgencies: ["Elite Models", "test-slug"] },
          }),
        };
      }
      if (table === "agencies") return agenciesQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const ids = await getBlockedAgencyIds(knex, "talent-user-1");
    expect(ids).toEqual(new Set(["agency-1", "agency-2"]));
    expect(agenciesQuery.where).toHaveBeenCalled();
  });

  it("getBlockedAgencyIds resolves a stored stable agency ID", async () => {
    const agenciesQuery = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ id: "agency-stable-id" }]),
    };
    const knex = jest.fn((table) => {
      if (table === "talent_user_settings") {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            privacy_preferences: { blockedAgencies: ["agency-stable-id"] },
          }),
        };
      }
      if (table === "agencies") return agenciesQuery;
      throw new Error(`unexpected table ${table}`);
    });

    await expect(getBlockedAgencyIds(knex, "talent-user-1")).resolves.toEqual(
      new Set(["agency-stable-id"]),
    );
  });

  it("isAgencyBlockedForTalent returns true when agency is blocked", async () => {
    const knex = jest.fn((table) => {
      if (table === "talent_user_settings") {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            privacy_preferences: { blockedAgencies: ["Blocked Co"] },
          }),
        };
      }
      if (table === "agencies") {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([{ id: "blocked-agency-id" }]),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      isAgencyBlockedForTalent(knex, "talent-1", "blocked-agency-id"),
    ).resolves.toBe(true);
    await expect(
      isAgencyBlockedForTalent(knex, "talent-1", "other-agency-id"),
    ).resolves.toBe(false);
  });

  it("validateHttpsAttachmentUrl accepts https or null", () => {
    expect(validateHttpsAttachmentUrl(null)).toEqual({ ok: true, value: null });
    expect(validateHttpsAttachmentUrl("https://cdn.example.com/file.pdf")).toEqual({
      ok: true,
      value: "https://cdn.example.com/file.pdf",
    });
    expect(validateHttpsAttachmentUrl("http://insecure.example.com").ok).toBe(false);
    expect(validateHttpsAttachmentUrl("not-a-url").ok).toBe(false);
  });
});
