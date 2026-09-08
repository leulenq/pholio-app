const {
  RIGHTS_CLEARED_STATUSES,
  RIGHTS_DENIED_STATUSES,
  RIGHTS_LICENSE_BASES,
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
    expect([...RIGHTS_LICENSE_BASES].sort()).toEqual([
      "agency_permission",
      "editorial_release",
      "licensed",
      "model_release",
      "owned",
    ]);
  });

  it("does not require a rights basis or ownership credit", () => {
    expect(imageHasDistributionRights({ id: "img-1" }, null)).toBe(true);
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        { rights_status: "cleared", license_type: null },
      ),
    ).toBe(true);
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        {
          rights_status: "cleared",
          license_type: "owned",
          copyright_owner: "Talent",
        },
      ),
    ).toBe(true);
  });

  it("accepts pending status and arbitrary license values", () => {
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        {
          rights_status: "pending",
          license_type: "editorial_release",
          photographer_name: "Photographer",
        },
      ),
    ).toBe(true);
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        {
          rights_status: "cleared",
          license_type: "x",
          photographer_name: "Photographer",
        },
      ),
    ).toBe(true);
  });

  it("reads a denial from every rights carrier", () => {
    for (const token of RIGHTS_DENIED_STATUSES) {
      expect(
        imageHasDistributionRights({ id: "img-1" }, { rights_status: token }),
      ).toBe(false);
      expect(
        imageHasDistributionRights({ id: "img-1", usage_rights: token }, null),
      ).toBe(false);
      expect(
        imageHasDistributionRights(
          { id: "img-1", metadata: JSON.stringify({ license_status: token }) },
          null,
        ),
      ).toBe(false);
    }
  });

  it("fails distribution when status is denied", () => {
    expect(
      imageHasDistributionRights(
        { id: "img-1" },
        {
          rights_status: "denied",
          license_type: "editorial_release",
          photographer_name: "Photographer",
        },
      ),
    ).toBe(false);
  });

  it("passes image lists that carry no rights metadata at all", () => {
    const images = [{ id: "a" }, { id: "b" }];
    const rightsMap = new Map([
      [
        "a",
        {
          image_id: "a",
          rights_status: "cleared",
          license_type: "owned",
          copyright_owner: "Talent",
        },
      ],
      ["b", { image_id: "b", rights_status: null, license_type: null }],
    ]);
    const result = validateImagesForDistribution(images, rightsMap);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates image lists and returns per-image errors for denials", () => {
    const images = [{ id: "a" }, { id: "b" }];
    const rightsMap = new Map([
      ["a", { image_id: "a", rights_status: "cleared" }],
      ["b", { image_id: "b", rights_status: "denied" }],
    ]);
    const result = validateImagesForDistribution(images, rightsMap);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].imageId).toBe("b");
    expect(result.errors[0].code).toBe("distribution_rights_denied");
  });

  it("loads rights rows into a map by image_id", async () => {
    const whereIn = jest.fn().mockReturnThis();
    const select = jest.fn().mockResolvedValue([
      { image_id: "img-1", rights_status: "cleared", license_type: "owned" },
      { image_id: "img-2", rights_status: null, license_type: null },
    ]);
    const knex = jest.fn(() => ({ whereIn, select }));
    knex.schema = {
      hasTable: jest.fn().mockResolvedValue(false),
    };

    const result = await loadImageRightsMap(knex, ["img-1", "img-2", "img-1"]);

    expect(whereIn).toHaveBeenCalledWith("image_id", ["img-1", "img-2"]);
    expect(result.get("img-1").rights_status).toBe("cleared");
    expect(result.has("img-2")).toBe(true);
  });

  // Guardian-consent coverage now lives in tests/talent/send-readiness.test.js.
});
