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
  resolveOperators,
  allowedRegisters,
  resolveEditionPalette,
  getEdition,
  contrastRatio,
  KIDS_POOL,
  AFFINITY_GATE,
  INK_FIELD_INK,
  REGISTER_QUIET_MAX_MIN_PT,
  REGISTER_DISPLAY_MIN_MAX_PT,
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

// ── compositional operators (plan 2.2) ──────────────────────────────────────

const darkHeroForensics = { luma: { mean: 0.25 }, palette: [{ hex: "#3B2E52", sat: 0.4, luma: 0.2 }] };
const brightHeroForensics = { luma: { mean: 0.75 }, palette: [{ hex: "#E8C9A0", sat: 0.3, luma: 0.7 }] };

describe("catalog field allowlists (operator axis)", () => {
  const EXPECTED_FIELDS = {
    "house-classic": ["paper", "warm"],
    "the-strip": ["warm", "paper"],
    "gallery-monograph": ["paper", "warm", "dark"],
    "editorial-masthead": ["paper", "warm"],
    "swiss-modernist": ["paper", "dark"],
    "cover-story": ["paper", "plane"],
    "ink-noir": ["dark"],
    duet: ["paper", "warm"],
    "studio-cutout": ["plane", "paper"],
  };

  test("every edition carries the contract's fields allowlist", () => {
    for (const e of EDITIONS) {
      expect({ id: e.id, fields: e.fields }).toEqual({ id: e.id, fields: EXPECTED_FIELDS[e.id] });
      for (const f of e.fields) expect(["paper", "warm", "plane", "dark"]).toContain(f);
    }
  });

  test("hero re-curation preferences: monograph prefers the figure, the-strip the headshot", () => {
    expect(getEdition("gallery-monograph").heroPreference).toEqual(
      expect.arrayContaining(["three_quarter", "full_length"]),
    );
    expect(getEdition("the-strip").heroPreference).toEqual(
      expect.arrayContaining(["headshot"]),
    );
    expect(getEdition("house-classic").heroPreference).toBeUndefined();
  });
});

describe("resolveOperators — field gates", () => {
  test("deterministic for identical inputs", () => {
    const input = {
      edition: getEdition("gallery-monograph"),
      seed: "op-1",
      identity: "t",
      heroForensics: darkHeroForensics,
    };
    expect(resolveOperators(input)).toEqual(resolveOperators(input));
  });

  test("fields drawn only from the edition allowlist", () => {
    for (const edition of EDITIONS) {
      for (let i = 0; i < 20; i++) {
        const { field } = resolveOperators({
          edition,
          seed: `f${i}`,
          identity: "t",
          heroForensics: darkHeroForensics, // every gate satisfiable
        });
        expect([...edition.fields, "paper"]).toContain(field);
      }
    }
  });

  test("dark is gated on kids — a kid never gets a dark field, whatever the edition", () => {
    for (let i = 0; i < 40; i++) {
      const { field } = resolveOperators({
        edition: getEdition("gallery-monograph"),
        seed: `k${i}`,
        identity: "kid",
        heroForensics: darkHeroForensics,
        kids: true,
      });
      expect(field).not.toBe("dark");
    }
    // noir's only field is dark — kids-gated it falls back to paper
    const noir = resolveOperators({
      edition: getEdition("ink-noir"),
      seed: "k",
      identity: "kid",
      heroForensics: darkHeroForensics,
      kids: true,
    });
    expect(noir.field).toBe("paper");
    expect(noir.because).toMatch(/kids/);
  });

  test("dark is gated on hero luma — a bright hero never carries a night field", () => {
    for (let i = 0; i < 40; i++) {
      const { field } = resolveOperators({
        edition: getEdition("gallery-monograph"),
        seed: `b${i}`,
        identity: "sunny",
        heroForensics: brightHeroForensics, // mean 0.75 ⇒ affinity 0.55 < gate
      });
      expect(field).not.toBe("dark");
    }
    // a dark hero keeps the dark Monograph reachable
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      seen.add(
        resolveOperators({
          edition: getEdition("gallery-monograph"),
          seed: `d${i}`,
          identity: "moody",
          heroForensics: darkHeroForensics,
        }).field,
      );
    }
    expect(seen.has("dark")).toBe(true);
  });

  test("plane requires a derivable plane tone (no forensics ⇒ no plane)", () => {
    for (let i = 0; i < 40; i++) {
      const { field } = resolveOperators({
        edition: getEdition("studio-cutout"),
        seed: `p${i}`,
        identity: "t",
        heroForensics: null,
      });
      expect(field).not.toBe("plane");
    }
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      seen.add(
        resolveOperators({
          edition: getEdition("studio-cutout"),
          seed: `q${i}`,
          identity: "t",
          heroForensics: brightHeroForensics,
        }).field,
      );
    }
    expect(seen.has("plane")).toBe(true);
  });

  test("avoid.field is honored when the gated pool keeps ≥ 2 members", () => {
    for (let i = 0; i < 40; i++) {
      const { field } = resolveOperators({
        edition: getEdition("house-classic"), // fields [paper, warm]
        seed: `a${i}`,
        identity: "t",
        avoid: { field: "paper" },
      });
      expect(field).toBe("warm");
    }
    // avoidance never empties a pool: noir has only dark
    const pinnedDark = resolveOperators({
      edition: getEdition("ink-noir"),
      seed: "a",
      identity: "t",
      heroForensics: darkHeroForensics,
      avoid: { field: "dark" },
    });
    expect(pinnedDark.field).toBe("dark");
  });
});

describe("resolveOperators — register subranges", () => {
  test("allowedRegisters reflects the documented thresholds", () => {
    expect(REGISTER_QUIET_MAX_MIN_PT).toBe(22);
    expect(REGISTER_DISPLAY_MIN_MAX_PT).toBe(56);
    expect(allowedRegisters(getEdition("gallery-monograph")).sort()).toEqual(["quiet", "standard"]); // 15–22
    expect(allowedRegisters(getEdition("cover-story")).sort()).toEqual(["display", "standard"]); // 56–110
    expect(allowedRegisters(getEdition("editorial-masthead")).sort()).toEqual(["display", "standard"]); // 40–76
    expect(allowedRegisters(getEdition("house-classic")).sort()).toEqual(["quiet", "standard"]); // 20–38
  });

  test("registers drawn only from the edition's honest subranges", () => {
    for (const edition of EDITIONS) {
      const allowed = allowedRegisters(edition);
      for (let i = 0; i < 25; i++) {
        const { register } = resolveOperators({
          edition,
          seed: `r${i}`,
          identity: "t",
          heroForensics: darkHeroForensics,
        });
        expect(allowed).toContain(register);
      }
    }
  });

  test("avoid.register is honored when ≥ 2 registers remain", () => {
    for (let i = 0; i < 40; i++) {
      const { register } = resolveOperators({
        edition: getEdition("gallery-monograph"), // {standard, quiet}
        seed: `ar${i}`,
        identity: "t",
        avoid: { register: "standard" },
      });
      expect(register).toBe("quiet");
    }
  });

  test("no edition ⇒ neutral operators", () => {
    expect(resolveOperators({ seed: "x", identity: "t" })).toEqual({
      field: "paper",
      register: "standard",
      because: "no edition — neutral operators",
    });
  });
});
