const dimensions = require("../../shared/comp-card-dimensions.json");

describe("comp-card dimensions", () => {
  test("keeps render pixels derived from trim inches at CSS DPI", () => {
    expect(dimensions.render.widthPixels).toBe(
      dimensions.trim.widthInches * dimensions.render.cssDpi,
    );
    expect(dimensions.render.heightPixels).toBe(
      dimensions.trim.heightInches * dimensions.render.cssDpi,
    );
  });

  test("defines a two-sided portrait card", () => {
    expect(dimensions.trim.widthInches).toBeLessThan(
      dimensions.trim.heightInches,
    );
    expect(dimensions.sides).toBe(2);
  });
});
