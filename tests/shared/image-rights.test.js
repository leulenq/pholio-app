const {
  RIGHTS_CLEARED_STATUSES,
  RIGHTS_DENIED_STATUSES,
  loadImageRightsMap,
  imageHasDistributionRights,
  validateImagesForDistribution,
} = require("../../src/shared/lib/image-rights");

describe("image-rights", () => {
  it("uses expected cleared and denied status sets", () => {
    expect([...RIGHTS_CLEARED_STATUSES].sort()).toEqual([
      "approved",
      "cleared",
      "licensed",
      "owned",
    ]);
    expect([...RIGHTS_DENIED_STATUSES].sort()).toEqual([
      "blocked",
      "denied",
      "forbidden",
      "restricted",
      "unlicensed",
    ]);
  });

  it("treats cleared status as distributable", () => {
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        { rights_status: "cleared", license_type: null },
      ),
    ).toBe(true);
  });

  it("treats license_type + non-denied status as distributable", () => {
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        { rights_status: "pending", license_type: "editorial_release" },
      ),
    ).toBe(true);
  });

  it("fails distribution when status is denied", () => {
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        { rights_status: "denied", license_type: "editorial_release" },
      ),
    ).toBe(false);
  });

  it("validates image lists and returns per-image errors", () => {
    const images = [{ id: "a" }, { id: "b" }];
    const rightsMap = new Map([
      ["a", { image_id: "a", rights_status: "cleared" }],
      ["b", { image_id: "b", rights_status: null, license_type: null }],
    ]);
    const result = validateImagesForDistribution(images, rightsMap);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].imageId).toBe("b");
  });

  it("loads rights rows into a map by image_id", async () => {
    const whereIn = jest.fn().mockReturnThis();
    const select = jest.fn().mockResolvedValue([
      { image_id: "img-1", rights_status: "cleared", license_type: "owned" },
      { image_id: "img-2", rights_status: null, license_type: null },
    ]);
    const knex = jest.fn(() => ({ whereIn, select }));

    const result = await loadImageRightsMap(knex, ["img-1", "img-2", "img-1"]);

    expect(whereIn).toHaveBeenCalledWith("image_id", ["img-1", "img-2"]);
    expect(result.get("img-1").rights_status).toBe("cleared");
    expect(result.has("img-2")).toBe(true);
  });
});
