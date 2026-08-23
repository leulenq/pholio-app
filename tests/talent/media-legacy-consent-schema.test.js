"use strict";

const mediaRouter = require("../../src/domains/talent/routes/media");

describe("media ownership query schema compatibility", () => {
  test("does not select the optional AI consent column when it is absent", async () => {
    const first = jest.fn().mockResolvedValue({ id: "image-1" });
    const where = jest.fn().mockReturnThis();
    const leftJoin = jest.fn().mockReturnThis();
    const select = jest.fn().mockReturnThis();
    const query = { select, leftJoin, where, first };
    const db = jest.fn(() => query);
    db.schema = { hasColumn: jest.fn().mockResolvedValue(false) };

    await mediaRouter.__testables.selectOwnedImageWithProfile(
      "image-1",
      "talent-1",
      ["profiles.date_of_birth"],
      db,
    );

    expect(select).toHaveBeenCalledWith([
      "images.*",
      "profiles.date_of_birth",
    ]);
    expect(where).toHaveBeenCalledWith("images.id", "image-1");
    expect(where).toHaveBeenCalledWith("profiles.user_id", "talent-1");
  });

  test("includes AI consent when the later consent migration is present", async () => {
    const first = jest.fn().mockResolvedValue({ id: "image-1" });
    const where = jest.fn().mockReturnThis();
    const leftJoin = jest.fn().mockReturnThis();
    const select = jest.fn().mockReturnThis();
    const query = { select, leftJoin, where, first };
    const db = jest.fn(() => query);
    db.schema = { hasColumn: jest.fn().mockResolvedValue(true) };

    await mediaRouter.__testables.selectOwnedImageWithProfile(
      "image-1",
      "talent-1",
      [],
      db,
    );

    expect(select).toHaveBeenCalledWith([
      "images.*",
      "profiles.ai_processing_consent",
    ]);
  });
});
