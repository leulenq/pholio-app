const {
  normalizePresetInput,
  mapPresetRow,
  mapPresetRevisionRow,
  snapshotFromPresetRow,
  toPresetQuery,
} = require("../presets");

describe("comp-card presets helpers", () => {
  test("normalizes preset payload tokens and lock grid ids", () => {
    const normalized = normalizePresetInput({
      name: "  Editorial Board A  ",
      seed: " seed-1 ",
      layoutFamily: "runway split",
      styleVariant: " dark-room ",
      lockHeroId: " hero@id ",
      lockGridIds: ["g-1", " g 2 ", "@@bad", ""],
    });

    expect(normalized).toEqual({
      name: "Editorial Board A",
      seed: "seed-1",
      layout_family: "runway-split",
      style_variant: "dark-room",
      lock_hero_id: "heroid",
      lock_grid_ids: ["g-1", "g-2", "bad", null],
    });
  });

  test("throws on empty preset name", () => {
    expect(() => normalizePresetInput({ name: "   " })).toThrow(
      "Preset name is required.",
    );
  });

  test("maps preset row and query payload", () => {
    const row = {
      id: "preset-1",
      name: "Board One",
      seed: "seed:abc",
      layout_family: "mosaic-horizontal",
      style_variant: "linework",
      lock_hero_id: "img-hero",
      lock_grid_ids: JSON.stringify(["img-1", "img-2", null, null]),
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      last_used_at: null,
    };

    const mapped = mapPresetRow(row);
    expect(mapped.lockGridIds).toEqual(["img-1", "img-2", null, null]);
    expect(mapped.query).toEqual({
      seed: "seed:abc",
      layoutFamily: "mosaic-horizontal",
      styleVariant: "linework",
      lockHeroId: "img-hero",
      lockGridIds: "img-1,img-2",
    });
    expect(toPresetQuery(row)).toEqual(mapped.query);
    expect(snapshotFromPresetRow(row)).toEqual({
      name: "Board One",
      seed: "seed:abc",
      layoutFamily: "mosaic-horizontal",
      styleVariant: "linework",
      lockHeroId: "img-hero",
      lockGridIds: ["img-1", "img-2", null, null],
    });
  });

  test("maps preset revision row snapshot shape", () => {
    const row = {
      id: "rev-1",
      preset_id: "preset-1",
      revision_number: 3,
      reason: "rollback",
      snapshot: JSON.stringify({
        name: "Board Previous",
        seed: "seed-prev",
        layoutFamily: "runway-split",
        styleVariant: "dark-room",
        lockHeroId: "hero-prev",
        lockGridIds: ["g1", null],
      }),
      created_at: "2026-01-02T00:00:00.000Z",
    };

    expect(mapPresetRevisionRow(row)).toEqual({
      id: "rev-1",
      presetId: "preset-1",
      revisionNumber: 3,
      reason: "rollback",
      snapshot: {
        name: "Board Previous",
        seed: "seed-prev",
        layoutFamily: "runway-split",
        styleVariant: "dark-room",
        lockHeroId: "hero-prev",
        lockGridIds: ["g1", null, null, null],
      },
      createdAt: "2026-01-02T00:00:00.000Z",
    });
  });
});
