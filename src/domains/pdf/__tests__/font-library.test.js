/**
 * Tests for the curated font library + typography pairing voices.
 */

const {
  FAMILIES,
  VOICES,
  isVoice,
  resolveVoice,
  advanceEm,
  resolveWeight,
  fontsCssUrl,
} = require("../composition/font-library");

describe("manifest integrity", () => {
  test("every voice references real library families with real weights", () => {
    for (const [id, voice] of Object.entries(VOICES)) {
      expect(FAMILIES[voice.display]).toBeTruthy();
      expect(FAMILIES[voice.body]).toBeTruthy();
      for (const w of voice.weights.name) {
        expect(FAMILIES[voice.display].weights).toContain(w);
      }
      expect(voice.tracking.min).toBeLessThan(voice.tracking.max);
      expect(["upper", "title"]).toContain(voice.nameCase);
      expect(isVoice(id)).toBe(true);
    }
  });

  test("every family carries glyph metrics", () => {
    for (const meta of Object.values(FAMILIES)) {
      expect(meta.capAdvanceEm).toBeGreaterThan(0.4);
      expect(meta.capAdvanceEm).toBeLessThan(0.75);
      expect(meta.titleAdvanceEm).toBeLessThan(meta.capAdvanceEm);
      expect(meta.weights.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveVoice", () => {
  test("requested valid voice wins", () => {
    const { voiceId, because } = resolveVoice({}, { requested: "romantic-didone" });
    expect(voiceId).toBe("romantic-didone");
    expect(because).toMatch(/requested/);
  });

  test("kids veto hairline/didone voices even when requested", () => {
    const { voiceId, because } = resolveVoice(
      { formality: 0.9 },
      { requested: "hairline-fashion", kids: true },
    );
    expect(voiceId).toBe("modern-warm");
    expect(because).toMatch(/vetoed/);
  });

  test("tone affinity casts sensible voices", () => {
    const severe = resolveVoice(
      { formality: 0.95, warmth: 0.25, energy: 0.2, density: 0.3 },
      { seed: "s1" },
    );
    expect(["hairline-fashion", "stark-grotesque", "romantic-didone"]).toContain(severe.voiceId);

    const athletic = resolveVoice(
      { formality: 0.4, warmth: 0.4, energy: 0.95, density: 0.7 },
      { seed: "s1" },
    );
    expect(["bold-grotesque", "modern-warm"]).toContain(athletic.voiceId);
  });

  test("deterministic per seed; varies across seeds", () => {
    const tone = { formality: 0.6, warmth: 0.5, energy: 0.45, density: 0.5 };
    expect(resolveVoice(tone, { seed: "x" })).toEqual(resolveVoice(tone, { seed: "x" }));
    const ids = new Set();
    for (let i = 0; i < 16; i++) ids.add(resolveVoice(tone, { seed: `v-${i}` }).voiceId);
    expect(ids.size).toBeGreaterThan(1);
  });

  test("kids casting never lands a vetoed voice", () => {
    for (let i = 0; i < 20; i++) {
      const { voiceId } = resolveVoice(
        { formality: 0.95, warmth: 0.2, energy: 0.2, density: 0.3 },
        { seed: `k-${i}`, kids: true },
      );
      expect(["hairline-fashion", "romantic-didone"]).not.toContain(voiceId);
    }
  });
});

describe("metrics + url helpers", () => {
  test("advanceEm respects case and family", () => {
    expect(advanceEm("Marcellus", "upper")).toBe(FAMILIES.Marcellus.capAdvanceEm);
    expect(advanceEm("Cormorant Garamond", "title")).toBe(
      FAMILIES["Cormorant Garamond"].titleAdvanceEm,
    );
    expect(advanceEm("Unknown Family", "upper")).toBe(FAMILIES.Inter.capAdvanceEm);
  });

  test("resolveWeight snaps to available weights", () => {
    expect(resolveWeight("Marcellus", 700)).toBe(400); // single-weight family
    expect(resolveWeight("Archivo", 750)).toBe(700);
    expect(resolveWeight("Inter", 450)).toBe(400);
  });

  test("fontsCssUrl includes Inter, dedupes, encodes spaces, lists weights", () => {
    const url = fontsCssUrl(["Bodoni Moda", "Bodoni Moda", "Inter"]);
    expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(url).toContain("family=Bodoni+Moda:wght@400;500;600;700");
    expect((url.match(/Bodoni\+Moda/g) || []).length).toBe(1);
    expect(url).toContain("family=Inter:wght@300;400;500;600;700");
    expect(url).toContain("display=swap");
  });

  test("fontsCssUrl drops unknown families", () => {
    expect(fontsCssUrl(["Comic Sans MS"])).not.toContain("Comic");
  });
});

describe("resolveVoice — edition voice pool (editions phase 2)", () => {
  const tone = { formality: 0.6, energy: 0.4, warmth: 0.45, density: 0.45 };

  test("pool restricts the cast to the edition's voices", () => {
    const pool = ["stark-grotesque", "bold-grotesque"];
    for (let i = 0; i < 40; i++) {
      const { voiceId, because } = resolveVoice(tone, { seed: `p${i}`, pool });
      expect(pool).toContain(voiceId);
      expect(because).toMatch(/edition pool/);
    }
  });

  test("kids vetoes apply on top of the pool", () => {
    const pool = ["hairline-fashion", "romantic-didone", "quiet-classic"];
    for (let i = 0; i < 40; i++) {
      const { voiceId } = resolveVoice(tone, { seed: `k${i}`, pool, kids: true });
      expect(voiceId).toBe("quiet-classic"); // the only pool member kids may use
    }
  });

  test("a pool the kids veto would empty is ignored rather than obeyed", () => {
    const pool = ["hairline-fashion", "romantic-didone"];
    for (let i = 0; i < 20; i++) {
      const { voiceId } = resolveVoice(tone, { seed: `e${i}`, pool, kids: true });
      expect(isVoice(voiceId)).toBe(true);
      expect(["hairline-fashion", "romantic-didone"]).not.toContain(voiceId);
    }
  });

  test("unknown pool ids are dropped; an all-unknown pool is ignored", () => {
    const { voiceId } = resolveVoice(tone, { seed: "u", pool: ["comic-sans-voice"] });
    expect(isVoice(voiceId)).toBe(true);
    const mixed = resolveVoice(tone, { seed: "u2", pool: ["comic-sans-voice", "quiet-classic"] });
    expect(mixed.voiceId).toBe("quiet-classic");
  });

  test("avoid still applies inside the pool (unless it is the only voice left)", () => {
    const pool = ["stark-grotesque", "bold-grotesque"];
    for (let i = 0; i < 30; i++) {
      const { voiceId } = resolveVoice(tone, { seed: `a${i}`, pool, avoid: "stark-grotesque" });
      expect(voiceId).toBe("bold-grotesque");
    }
    const only = resolveVoice(tone, { seed: "a", pool: ["quiet-classic"], avoid: "quiet-classic" });
    expect(only.voiceId).toBe("quiet-classic"); // sole survivor is never eliminated
  });

  test("no pool ⇒ legacy cast unchanged", () => {
    const a = resolveVoice(tone, { seed: "legacy-1" });
    const b = resolveVoice(tone, { seed: "legacy-1", pool: null });
    expect(a).toEqual(b);
  });
});
