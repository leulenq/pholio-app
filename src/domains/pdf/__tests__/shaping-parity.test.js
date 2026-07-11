/**
 * Shaping-parity regression suite (comp-card editions plan, item 0.3).
 *
 * The PDF renderer is Chromium, which shapes text with HarfBuzz. The
 * measurement layer (perception/text-metrics.js) therefore shapes with
 * HarfBuzz too — parity by construction. This suite pins that down three
 * ways:
 *
 *  1. SNAPSHOT: shaped em widths for every vendored family (×2 weights,
 *     ×upper/title kern-torture strings) against values captured at
 *     test-authoring time. Those values were validated against headless
 *     Chromium rendering the same vendored TTFs: worst observed divergence
 *     was 0.001% (snapshot rounding), far inside the 0.5% gate.
 *  2. ROOT CAUSES: the two opentype.js failure modes this layer replaced —
 *     silently-dropped class-based GPOS kerning (Bodoni Moda, Playfair,
 *     Noto Serif Display) and getAdvanceWidth throwing on GSUB
 *     lookup-type-6 fonts (Inter, Archivo) — are each proven fixed.
 *  3. BROWSER PARITY (scaffold): a live Puppeteer comparison, run only when
 *     SHAPING_PARITY_BROWSER=1 (headless Chromium launch is ~25s in bare
 *     environments, too heavy for the default unit run).
 *
 * If a snapshot assertion fails here, the vendored TTFs changed (re-run
 * scripts/fetch-compcard-fonts.js drift) or the shaper regressed — do NOT
 * loosen the tolerance; re-validate against Chromium and re-capture.
 */

const fs = require("fs");

const { FAMILIES } = require("../composition/font-library");
const { fontPathFor, nameAdvanceEm } = require("../composition/perception/font-files");
const textMetrics = require("../composition/perception/text-metrics");

const UPPER = "TAYA WAVERLY AVAT."; // kern-torture: TA / AY / YA / WA / AV / VA / AVA / T.
const TITLE = "Taya Waverly Avat.";

// At sizePt=72 and trackingEm=0, measureLine's widthIn IS the total shaped
// advance in em (widthPt/72 = totalEm·72/72).
const emWidth = (fontPath, text) => {
  const m = textMetrics.measureLine({ fontPath, text, sizePt: 72 });
  return m ? m.widthIn : null;
};

// HarfBuzz-shaped widths (em) captured at authoring time from the vendored
// TTFs and cross-checked against headless Chromium (max divergence 0.001%).
const SHAPED_EM = {
  "Inter:400": { upper: 10.4775, title: 8.9644 },
  "Inter:700": { upper: 10.9331, title: 9.3804 },
  "Archivo:400": { upper: 10.138, title: 8.34 },
  "Archivo:800": { upper: 11.01, title: 9.385 },
  "Manrope:400": { upper: 9.2495, title: 8.416 },
  "Manrope:700": { upper: 9.797, title: 8.9245 },
  "Playfair Display:400": { upper: 9.695, title: 8.254 },
  "Playfair Display:700": { upper: 10.151, title: 8.508 },
  "Bodoni Moda:400": { upper: 10.6805, title: 8.8165 },
  "Bodoni Moda:700": { upper: 11.2175, title: 9.552 },
  "Cormorant Garamond:400": { upper: 9.989, title: 7.497 },
  "Cormorant Garamond:700": { upper: 10.092, title: 7.552 },
  "Fraunces:400": { upper: 10.8585, title: 8.906 },
  "Fraunces:700": { upper: 11.614, title: 9.541 },
  "Marcellus:400": { upper: 9.9126, title: 8.4961 },
  "Italiana:400": { upper: 8.686, title: 7.709 },
  "Noto Serif Display:400": { upper: 10.28, title: 9.073 },
  "Noto Serif Display:600": { upper: 10.701, title: 9.432 },
};

const TOLERANCE = 0.005; // ±0.5% — the plan's parity gate

// family × [400, heaviest] — every vendored family in the library.
const CASES = Object.keys(FAMILIES).flatMap((family) =>
  [...new Set([400, Math.max(...FAMILIES[family].weights)])].map((weight) => [family, weight]),
);

describe("shaping parity: vendored families × kern-torture strings", () => {
  test("every library family resolves to a vendored TTF at both probed weights", () => {
    for (const [family, weight] of CASES) {
      expect(fontPathFor(family, weight)).toBeTruthy();
    }
  });

  test.each(CASES)("%s w%i shapes finite positive widths matching Chromium-validated snapshot", (family, weight) => {
    const fontPath = fontPathFor(family, weight);
    const expected = SHAPED_EM[`${family}:${weight}`];
    expect(expected).toBeDefined(); // new family/weight ⇒ extend the snapshot
    for (const [label, text] of [["upper", UPPER], ["title", TITLE]]) {
      const em = emWidth(fontPath, text);
      expect(Number.isFinite(em)).toBe(true);
      expect(em).toBeGreaterThan(0);
      const ratio = em / expected[label];
      expect(ratio).toBeGreaterThan(1 - TOLERANCE);
      expect(ratio).toBeLessThan(1 + TOLERANCE);
    }
  });
});

describe("root cause 1: class-based GPOS kerning is applied (opentype.js returned 0)", () => {
  // Shaped pair width must be tighter than the two glyphs side by side.
  // Ground truth (hb, Bodoni Moda 400, upem 2000): TA kerns -171 units
  // (-0.0855em), AV kerns -272 units (-0.136em).
  const KERN_CASES = [
    ["Bodoni Moda", "TA", 0.05],
    ["Bodoni Moda", "AV", 0.1],
    ["Playfair Display", "TA", 0.02],
    ["Noto Serif Display", "AV", 0.02],
  ];

  test.each(KERN_CASES)("%s kerns '%s' by at least %fem", (family, pair, minKernEm) => {
    const fontPath = fontPathFor(family, 400);
    const pairEm = emWidth(fontPath, pair);
    const soloEm = emWidth(fontPath, pair[0]) + emWidth(fontPath, pair[1]);
    expect(Number.isFinite(pairEm)).toBe(true);
    expect(soloEm - pairEm).toBeGreaterThanOrEqual(minKernEm);
  });
});

describe("root cause 2: GSUB lookup-type-6 fonts measure (opentype.js getAdvanceWidth threw)", () => {
  test.each([
    ["Inter", 700],
    ["Archivo", 700],
  ])("%s w%i measures without throwing and reports measured metrics", (family, weight) => {
    const fontPath = fontPathFor(family, weight);
    expect(() => textMetrics.measureLine({ fontPath, text: UPPER, sizePt: 24 })).not.toThrow();
    const m = textMetrics.measureLine({ fontPath, text: UPPER, sizePt: 24 });
    expect(m).not.toBeNull();
    expect(m.widthIn).toBeGreaterThan(0);
    expect(m.version).toBe(textMetrics.METRICS_VERSION);

    const { advanceEm, measured } = nameAdvanceEm({ family, weight, text: UPPER, nameCase: "upper" });
    expect(measured).toBe(true); // measured means harfbuzz-shaped, not estimate
    expect(advanceEm).toBeGreaterThan(0);
  });
});

describe("measured flag honesty", () => {
  test("unknown family falls back to the calibrated estimate with measured:false", () => {
    const r = nameAdvanceEm({ family: "No Such Family", text: UPPER, nameCase: "upper" });
    expect(r.measured).toBe(false);
    expect(r.advanceEm).toBeGreaterThan(0);
  });

  test("old opentype overestimates are gone: Bodoni Moda 400 upper is below the opentype value", () => {
    // opentype.js measured 11.8695em for the torture string (no kerning);
    // harfbuzz/Chromium truth is 10.6805em (-10.0%). Guard the direction so a
    // regression back to unkerned math fails loudly.
    const em = emWidth(fontPathFor("Bodoni Moda", 400), UPPER);
    expect(em).toBeLessThan(11.0);
  });
});

// ── Browser parity scaffold ────────────────────────────────────────────────
// Full live comparison against headless Chromium. Costs a browser launch
// (~25s), so it only runs when explicitly requested:
//   SHAPING_PARITY_BROWSER=1 npx jest src/domains/pdf/__tests__/shaping-parity.test.js
const describeBrowser = process.env.SHAPING_PARITY_BROWSER === "1" ? describe : describe.skip;
describeBrowser("SKIPPED unless SHAPING_PARITY_BROWSER=1: live Puppeteer parity (needs headless Chromium)", () => {
  jest.setTimeout(300000);

  test("harfbuzz-shaped width matches Chromium-rendered width within 0.5% for every case", async () => {
    // eslint-disable-next-line global-require
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      for (const [family, weight] of CASES) {
        const fontPath = fontPathFor(family, weight);
        const b64 = fs.readFileSync(fontPath).toString("base64");
        for (const text of [UPPER, TITLE]) {
          const hbEm = emWidth(fontPath, text);
          await page.setContent(
            `<style>
               @font-face { font-family:'T'; src:url(data:font/ttf;base64,${b64}) format('truetype'); }
               #x { font-family:'T'; font-size:100px; font-weight:${weight}; letter-spacing:0;
                    white-space:pre; font-kerning:normal; display:inline-block; }
             </style><span id="x">${text}</span>`,
          );
          await page.evaluate(() => document.fonts.ready);
          const px = await page.evaluate(() => document.getElementById("x").getBoundingClientRect().width);
          const chromeEm = px / 100;
          const drift = Math.abs(hbEm - chromeEm) / chromeEm;
          if (drift >= TOLERANCE) {
            throw new Error(
              `${family} w${weight} "${text}": hb=${hbEm.toFixed(4)}em chrome=${chromeEm.toFixed(4)}em drift=${(drift * 100).toFixed(3)}%`,
            );
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
