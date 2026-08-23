"use strict";

const {
  loadAuthoritativeProfile,
} = require("../../src/domains/talent/services/run-image-classification");
const {
  loadImageAiProfile,
} = require("../../src/domains/ai/analyzeProfileImage");

function makeProfileDb({ hasConsentColumn }) {
  const first = jest.fn().mockResolvedValue({ id: "profile-1" });
  const forUpdate = jest.fn().mockReturnThis();
  const select = jest.fn().mockReturnThis();
  const where = jest.fn().mockReturnThis();
  const query = { where, select, forUpdate, first };
  const db = jest.fn(() => query);
  db.schema = { hasColumn: jest.fn().mockResolvedValue(hasConsentColumn) };
  db.client = { config: { client: "sqlite3" } };
  return { db, select };
}

describe("AI consent schema compatibility", () => {
  test.each([
    ["classification", loadAuthoritativeProfile, ["id", "date_of_birth", "guardian_consent_at"]],
    ["vision", loadImageAiProfile, ["id", "date_of_birth"]],
  ])("%s loader fails closed without the optional consent column", async (_name, loader, expectedColumns) => {
    const { db, select } = makeProfileDb({ hasConsentColumn: false });

    await loader(db, "profile-1");

    expect(select).toHaveBeenCalledWith(expectedColumns);
  });

  test.each([
    ["classification", loadAuthoritativeProfile, ["id", "date_of_birth", "guardian_consent_at", "ai_processing_consent"]],
    ["vision", loadImageAiProfile, ["id", "date_of_birth", "ai_processing_consent"]],
  ])("%s loader reads consent when its migration is present", async (_name, loader, expectedColumns) => {
    const { db, select } = makeProfileDb({ hasConsentColumn: true });

    await loader(db, "profile-1");

    expect(select).toHaveBeenCalledWith(expectedColumns);
  });
});
