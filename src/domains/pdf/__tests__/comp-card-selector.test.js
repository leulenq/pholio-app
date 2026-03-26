const { selectCompCardImages } = require("../comp-card-selector");

function selectionIds(result) {
  const grid = result.gridImages.map((img) => (img ? img.id : null));
  return [result.heroImage ? result.heroImage.id : null, ...grid];
}

describe("selectCompCardImages", () => {
  test("same seed + same input => same selected IDs", () => {
    const images = [
      { id: "a", path: "/a", sort: 1, shot_type: "headshot" },
      { id: "b", path: "/b", sort: 2, shot_type: "headshot" },
      { id: "c", path: "/c", sort: 3, shot_type: "full_length" },
      { id: "d", path: "/d", sort: 4, style_type: "editorial" },
      { id: "e", path: "/e", sort: 5, style_type: "lifestyle" },
    ];
    const options = { seed: "repro-seed-42" };
    expect(selectionIds(selectCompCardImages(images, options))).toEqual(
      selectionIds(selectCompCardImages(images, options)),
    );
  });

  test("different seeds can produce different selection when ties exist", () => {
    const images = [
      { id: "h1", path: "/1", sort: 1, shot_type: "headshot" },
      { id: "h2", path: "/2", sort: 1, shot_type: "headshot" },
      { id: "f1", path: "/3", sort: 2, shot_type: "full_length" },
      { id: "ed1", path: "/4", sort: 3, style_type: "editorial" },
      { id: "ls1", path: "/5", sort: 4, style_type: "lifestyle" },
      { id: "x1", path: "/6", sort: 6 },
    ];
    const variants = new Set();
    for (let i = 0; i < 40; i++) {
      variants.add(
        selectionIds(selectCompCardImages(images, { seed: `tie-${i}` })).join(
          "|",
        ),
      );
    }
    expect(variants.size).toBeGreaterThan(1);
  });

  test("no duplicate IDs in hero + grid", () => {
    const images = [
      { id: "a", path: "/a", sort: 1, shot_type: "headshot" },
      { id: "b", path: "/b", sort: 2, shot_type: "full_length" },
      { id: "c", path: "/c", sort: 3, style_type: "editorial" },
      { id: "d", path: "/d", sort: 4, style_type: "lifestyle" },
      { id: "e", path: "/e", sort: 5 },
    ];
    const r = selectCompCardImages(images, { seed: "no-dup" });
    const chosen = [r.heroImage, ...r.gridImages].filter(Boolean);
    const ids = chosen.map((img) => img.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("fallback fills slots when no role metadata", () => {
    const images = [
      { id: "a", path: "/a", sort: 1 },
      { id: "b", path: "/b", sort: 2 },
      { id: "c", path: "/c", sort: 3 },
      { id: "d", path: "/d", sort: 4 },
      { id: "e", path: "/e", sort: 5 },
    ];
    const r = selectCompCardImages(images, { seed: "plain-list" });
    expect(r.heroImage).not.toBeNull();
    expect(r.gridImages.every((slot) => slot != null)).toBe(true);
    const ids = [r.heroImage, ...r.gridImages].map((img) => img.id);
    expect(new Set(ids).size).toBe(5);
  });

  test("status filtering prefers active; falls back when all would be excluded", () => {
    const onlyArchived = [
      {
        id: "a",
        path: "/a",
        sort: 1,
        status: "archived",
        shot_type: "headshot",
      },
      {
        id: "b",
        path: "/b",
        sort: 2,
        status: "retired",
        shot_type: "full_length",
      },
      { id: "c", path: "/c", sort: 3, status: "archived" },
      { id: "d", path: "/d", sort: 4, status: "archived" },
      { id: "e", path: "/e", sort: 5, status: "archived" },
    ];
    const r = selectCompCardImages(onlyArchived, { seed: "all-inactive" });
    expect(r.heroImage?.id).toBe("a");
    expect(r.gridImages.filter(Boolean)).toHaveLength(4);

    const mixed = [
      {
        id: "arc",
        path: "/y",
        sort: 1,
        status: "archived",
        shot_type: "headshot",
      },
      {
        id: "act",
        path: "/x",
        sort: 2,
        status: "active",
        shot_type: "headshot",
      },
      {
        id: "c",
        path: "/c",
        sort: 3,
        status: "active",
        shot_type: "full_length",
      },
      {
        id: "d",
        path: "/d",
        sort: 4,
        status: "active",
        style_type: "editorial",
      },
      {
        id: "e",
        path: "/e",
        sort: 5,
        status: "active",
        style_type: "lifestyle",
      },
    ];
    const r2 = selectCompCardImages(mixed, { seed: "prefer-active" });
    expect(r2.heroImage?.id).toBe("act");
  });

  test("without seed keeps legacy first-in-list tie break for duplicate roles", () => {
    const images = [
      { id: "first", path: "/1", sort: 1, shot_type: "headshot" },
      { id: "second", path: "/2", sort: 2, shot_type: "headshot" },
      { id: "c", path: "/c", sort: 3, shot_type: "full_length" },
      { id: "d", path: "/d", sort: 4, style_type: "editorial" },
      { id: "e", path: "/e", sort: 5, style_type: "lifestyle" },
    ];
    const r = selectCompCardImages(images);
    expect(r.heroImage?.id).toBe("first");
  });

  test("enforceActive: false includes archived images in pool", () => {
    const images = [
      {
        id: "arc",
        path: "/a",
        sort: 1,
        status: "archived",
        shot_type: "headshot",
      },
      {
        id: "act",
        path: "/b",
        sort: 2,
        status: "active",
        shot_type: "headshot",
      },
      { id: "c", path: "/c", sort: 3, shot_type: "full_length" },
      { id: "d", path: "/d", sort: 4, style_type: "editorial" },
      { id: "e", path: "/e", sort: 5, style_type: "lifestyle" },
    ];
    const r = selectCompCardImages(images, { enforceActive: false });
    expect(r.heroImage?.id).toBe("arc");
  });
});
