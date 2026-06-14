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
