/**
 * Editions catalog + resolver contracts (v10).
 *
 * These are the anti-collapse mechanics from the red-team review:
 * - catalog integrity: every voice id real; the voice-pool overlap budget
 *   (a voice in ≤ 3 edition pools, every edition ≥ 2 voices) so editions
 *   cannot silently re-crowd one register;
 * - resolver: deterministic; the immediate predecessor is NEVER re-served
 *   when ≥ 2 candidates exist (no A→A), whatever avoid depth arrives;
 *   avoid depth clamps to pool−1 (avoidance never empties the pool);
 * - gates are capabilities: matte, pool size, pairable support, kids draw
 *   pool, and the photo-affinity gate (pixels that cannot carry a night
 *   card remove it, not down-weight it);
 * - palette programs stay verified (ink-field ≥ 7:1 under its ink).
 */

const {
  EDITIONS,
  EDITIONS_BY_ID,
  listEditions,
  isSuitable,
  resolveEdition,
  resolveEditionPalette,
  getEdition,
  contrastRatio,
  KIDS_POOL,
  AFFINITY_GATE,
  INK_FIELD_INK,
} = require("../composition/editions");
const { isVoice } = require("../composition/font-library");

const baseCtx = {
  toneVector: { formality: 0.55, energy: 0.45, warmth: 0.5, density: 0.45 },
  poolSize: 8,
  hasAlphaMatte: true,
  kids: false,
  hasPairableSupport: true,
};

describe("catalog integrity", () => {
  test("ids unique, labels/tone present, structures non-empty", () => {
    const ids = new Set();
    for (const e of EDITIONS) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(typeof e.label).toBe("string");
      expect(e.label.length).toBeGreaterThan(2);
      expect(typeof e.tone).toBe("string");
      expect(Object.keys(e.structures).length).toBeGreaterThan(0);
    }
  });

  test("every pooled voice exists in the font library", () => {
    for (const e of EDITIONS) {
      for (const v of e.voices) expect(isVoice(v)).toBe(true);
    }
  });

  test("voice-pool overlap budget: each voice in ≤ 3 editions, each edition ≥ 2 voices", () => {
    const usage = new Map();
    for (const e of EDITIONS) {
      expect(e.voices.length).toBeGreaterThanOrEqual(2);
      for (const v of e.voices) usage.set(v, (usage.get(v) || 0) + 1);
    }
    for (const [voice, count] of usage) {
      expect({ voice, count }).toEqual({ voice, count: expect.any(Number) });
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  test("kids pool members exist and never require notKids", () => {
    for (const id of KIDS_POOL) {
      const e = EDITIONS_BY_ID[id];
      expect(e).toBeTruthy();
      expect(e.needs.notKids).toBeUndefined();
    }
  });

  test("house-classic remains the ungated anchor", () => {
    expect(getEdition("house-classic").needs).toEqual({});
  });
});

describe("suitability gates (capabilities, never taste)", () => {
  test("matte gates cover-story and studio-cutout", () => {
    const ctx = { ...baseCtx, hasAlphaMatte: false };
    expect(isSuitable(getEdition("cover-story"), ctx)).toBe(false);
    expect(isSuitable(getEdition("studio-cutout"), ctx)).toBe(false);
    expect(isSuitable(getEdition("house-classic"), ctx)).toBe(true);
  });

  test("pool size gates the-strip and gallery-monograph", () => {
    const ctx = { ...baseCtx, poolSize: 2 };
    expect(isSuitable(getEdition("the-strip"), ctx)).toBe(false);
    expect(isSuitable(getEdition("gallery-monograph"), ctx)).toBe(false);
  });

  test("kids restricts to the kids draw pool (noir and non-pool editions excluded)", () => {
    const ctx = { ...baseCtx, kids: true };
    const avail = listEditions(ctx).filter((e) => e.available).map((e) => e.id);
    expect(avail.sort()).toEqual([...KIDS_POOL].sort());
    for (let i = 0; i < 60; i++) {
      const { edition } = resolveEdition({ ...baseCtx, kids: true, seed: `k${i}`, identity: "kid" });
      expect(KIDS_POOL).toContain(edition.id);
    }
  });

  test("duet requires a pairable support", () => {
    expect(isSuitable(getEdition("duet"), { ...baseCtx, hasPairableSupport: false })).toBe(false);
  });
});

describe("resolver contracts", () => {
  test("deterministic for identical inputs", () => {
    const a = resolveEdition({ ...baseCtx, seed: "same", identity: "t" });
    const b = resolveEdition({ ...baseCtx, seed: "same", identity: "t" });
    expect(a.edition.id).toBe(b.edition.id);
  });

  test("the immediate predecessor is never re-served (no A→A) across seeds and pool sizes", () => {
    const scenarios = [
      baseCtx, // full pool
      { ...baseCtx, hasAlphaMatte: false }, // typical
      { ...baseCtx, kids: true }, // small pool
      // true 2-member pool: kids ∧ no matte ∧ 3 images → {house-classic, duet}
      { ...baseCtx, kids: true, hasAlphaMatte: false, poolSize: 3 },
    ];
    for (const ctx of scenarios) {
      let prev = null;
      for (let i = 0; i < 40; i++) {
        const { edition } = resolveEdition({
          ...ctx,
          seed: `s${i}`,
          identity: "cycle",
          avoidEditions: prev ? [prev] : [],
        });
        if (prev) expect(edition.id).not.toBe(prev);
        prev = edition.id;
      }
    }
  });

  test("deep avoid lists clamp instead of emptying the pool", () => {
    const all = EDITIONS.map((e) => e.id);
    const { edition } = resolveEdition({
      ...baseCtx,
      seed: "deep",
      identity: "t",
      avoidEditions: all, // avoid everything — must still serve something
    });
    expect(edition).toBeTruthy();
    // and with ≥2 candidates the most-recent avoid still holds
    expect(edition.id).not.toBe(all[0]);
  });

  test("pinning a suitable edition wins; pinning an unsuitable one falls to the draw", () => {
    const pinned = resolveEdition({ ...baseCtx, seed: "p", identity: "t", force: "ink-noir" });
    expect(pinned.edition.id).toBe("ink-noir");
    const kidsPin = resolveEdition({ ...baseCtx, kids: true, seed: "p", identity: "t", force: "ink-noir" });
    expect(kidsPin.edition.id).not.toBe("ink-noir");
  });

  test("photo-affinity gates: a bright warm hero never draws the night edition", () => {
    for (let i = 0; i < 80; i++) {
      const { edition } = resolveEdition({
        ...baseCtx,
        seed: `bright${i}`,
        identity: "sunny",
        heroLuma: 0.75, // bright location hero — affinity 0.55 < gate 0.6
      });
      expect(edition.id).not.toBe("ink-noir");
    }
    // a dark hero keeps noir in the pool (affinity 1.5)
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      seen.add(
        resolveEdition({ ...baseCtx, seed: `dark${i}`, identity: "moody", heroLuma: 0.3 }).edition.id,
      );
    }
    expect(seen.has("ink-noir")).toBe(true);
  });

  test("cross-seed spread: 24 seeds reach ≥ 5 distinct editions on a typical pool", () => {
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      seen.add(
        resolveEdition({ ...baseCtx, hasAlphaMatte: false, seed: `v${i}`, identity: "t" }).edition.id,
      );
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  test("AFFINITY_GATE is the documented 0.6 capability threshold", () => {
    expect(AFFINITY_GATE).toBe(0.6);
  });
});

describe("palette programs", () => {
  test("ink-field paper always clears 7:1 under its ink (house and hero-pulled)", () => {
    const noir = getEdition("ink-noir");
    const house = resolveEditionPalette(noir, {});
    expect(contrastRatio(INK_FIELD_INK, house.paper)).toBeGreaterThanOrEqual(7);
    const pulled = resolveEditionPalette(noir, {
      heroForensics: { palette: [{ hex: "#3B2E52", sat: 0.4, luma: 0.2 }] },
    });
    expect(contrastRatio(INK_FIELD_INK, pulled.paper)).toBeGreaterThanOrEqual(7);
    expect(pulled.dark).toBe(true);
  });

  test("auto palettes return null (design-language default preserved)", () => {
    expect(resolveEditionPalette(getEdition("house-classic"), {})).toBeNull();
  });
});
