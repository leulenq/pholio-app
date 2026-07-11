/**
 * Reversed-type PRINT RULES (editions plan 2.5).
 *
 * Unit tests for the stroke-class minimums and per-cell verification
 * helpers, plus integration sweeps proving the sampler enforces them:
 *  - hairline/didone voices are never reversed below 24pt (knockout bands,
 *    color blocks, dark veils);
 *  - the forced-treatment minRatio carve-outs are dead — every on-photo
 *    choreography fill verifies worst-cell ≥ 3.0:1 even when pinned;
 *  - the translucent band veil is solved per-cell over its OWN rows;
 *  - photo-riding contact ink verifies per-cell ≥ 4.5:1 composited or the
 *    contact is dropped (the live 2.82:1 case class).
 */

const {
  strokeClass,
  reversedMinPt,
  reversedTypeOk,
  cellsUnderRect,
  worstCellRatio,
  worstCompositeInkRatio,
  solveVeilAlpha,
  gammaLuma,
  srgbLinear,
  linearLuminance,
  contrastOfLinear,
  isDarkSurface,
} = require("../composition/front-program/print-rules");
const { designFrontProgram } = require("../composition/front-program/synthesize");
const { studioForensics, locationForensics, baseCtx } = require("./__fixtures__/front-program-legacy-inputs");

describe("stroke classes and reversed minimums", () => {
  test("hairline/didone families → 24pt reversed floor regardless of weight", () => {
    for (const family of ["Italiana", "Bodoni Moda", "Cormorant Garamond", "Playfair Display"]) {
      expect(strokeClass({ family, weight: 700 })).toBe("hairline");
      expect(reversedMinPt({ family, weight: 700 })).toBe(24);
      expect(reversedMinPt({ family: family.toUpperCase(), weight: 400 })).toBe(24);
    }
  });

  test("weight ≥600 → 8pt; 400–500 grotesque → 10pt", () => {
    expect(reversedMinPt({ family: "Archivo", weight: 700 })).toBe(8);
    expect(reversedMinPt({ family: "Inter", weight: 600 })).toBe(8);
    expect(reversedMinPt({ family: "Inter", weight: 500 })).toBe(10);
    expect(reversedMinPt({ family: "Manrope", weight: 400 })).toBe(10);
    expect(reversedMinPt({})).toBe(10); // unknown voice → conservative 10
  });

  test("hairline at 15pt reversed is refused; grotesque 700 at 8pt is allowed", () => {
    expect(reversedTypeOk({ family: "Italiana", weight: 400, sizePt: 15 })).toBe(false);
    expect(reversedTypeOk({ family: "Playfair Display", weight: 500, sizePt: 23.9 })).toBe(false);
    expect(reversedTypeOk({ family: "Playfair Display", weight: 500, sizePt: 24 })).toBe(true);
    expect(reversedTypeOk({ family: "Archivo", weight: 700, sizePt: 8 })).toBe(true);
    expect(reversedTypeOk({ family: "Archivo", weight: 700, sizePt: 7.5 })).toBe(false);
    expect(reversedTypeOk({ family: "Inter", weight: 450, sizePt: 9.5 })).toBe(false);
    expect(reversedTypeOk({ family: "Inter", weight: 450, sizePt: 10 })).toBe(true);
  });

  test("dark surface detection", () => {
    expect(isDarkSurface("#141210")).toBe(true);
    expect(isDarkSurface("#FAF8F5")).toBe(false);
  });
});

describe("per-cell verification helpers", () => {
  const frame = { x: 0, y: 0, w: 5.5, h: 8.5 };

  test("cellsUnderRect maps a page rect onto the grid rows/cols it covers", () => {
    const grid = Array.from({ length: 4 }, (_, r) => new Array(4).fill(r / 10));
    // bottom quarter of the frame → row 3 only
    const cells = cellsUnderRect(grid, { x: 0, y: 8.5 * 0.75 + 0.1, w: 5.5, h: 8.5 * 0.25 - 0.1 }, frame);
    expect(cells).toHaveLength(4);
    expect(cells.every((v) => v === 0.3)).toBe(true);
    // degenerate inputs are empty, never throw
    expect(cellsUnderRect(null, { x: 0, y: 0, w: 1, h: 1 }, frame)).toEqual([]);
    expect(cellsUnderRect(grid, { x: 9, y: 9, w: 1, h: 1 }, frame)).toEqual([]);
  });

  test("worstCellRatio takes the WORST cell, not the mean", () => {
    const dark = 0.05;
    const mid = 0.5;
    const grid = [[dark, dark, mid, dark]];
    const worst = worstCellRatio(grid[0], "#FFFFFF");
    const midRatio = contrastOfLinear(1, srgbLinear(mid));
    expect(worst).toBeCloseTo(midRatio, 6);
    expect(worst).toBeLessThan(contrastOfLinear(1, srgbLinear(dark)));
  });

  test("solveVeilAlpha steps the veil up until the worst cell clears, else null", () => {
    const darkCells = [0.1, 0.15, 0.2];
    const easy = solveVeilAlpha({
      cells: darkCells, veilGamma: gammaLuma("#0C0B0A"), inkHex: "#FFFFFF", startAlpha: 0.55,
    });
    expect(easy).toBe(0.55); // already clears at the start alpha

    const busyCells = [0.1, 0.55, 1.0]; // a blown-out cell fights the dark veil
    const solved = solveVeilAlpha({
      cells: busyCells, veilGamma: gammaLuma("#0C0B0A"), inkHex: "#FFFFFF", startAlpha: 0.55,
    });
    expect(solved).toBeGreaterThan(0.55);
    // verify the solved alpha actually clears the worst cell composited
    const worst = Math.max(...busyCells);
    const bg = solved * gammaLuma("#0C0B0A") + (1 - solved) * worst;
    expect(contrastOfLinear(linearLuminance("#FFFFFF"), srgbLinear(bg))).toBeGreaterThanOrEqual(4.5);

    // an impossible field refuses instead of shipping a weak veil
    const impossible = solveVeilAlpha({
      cells: [0.5], veilGamma: 0.5, inkHex: "#808080", startAlpha: 0.55,
    });
    expect(impossible).toBeNull();
  });

  test("worstCompositeInkRatio models translucent ink over the cell", () => {
    // white @0.82 over a mid cell is much weaker than over a dark cell
    const overMid = worstCompositeInkRatio([0.5], { inkGamma: 1, alpha: 0.82 });
    const overDark = worstCompositeInkRatio([0.1], { inkGamma: 1, alpha: 0.82 });
    expect(overDark).toBeGreaterThan(overMid);
    expect(overMid).toBeLessThan(4.5); // the 2.82:1 class of failure
  });
});

// ── integration sweeps against the sampler ──────────────────────────────────

function busyForensics() {
  // alternating bright / dark / mid cells: the bright cells kill white
  // (<3.0), the dark cells kill ink, the mid cells kill the accent — no
  // solid fill verifies worst-cell, and no translucent contact ink reaches
  // 4.5 composited. The refusal fixture.
  const rows = 9;
  const cols = 6;
  const vals = [0.75, 0.25, 0.55];
  return {
    aspect: 2 / 3,
    luma: {
      rows, cols,
      grid: Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => vals[(r + c) % 3])),
      mean: 0.52, isDark: false,
    },
    detail: { grid: Array.from({ length: rows }, () => new Array(cols).fill(0.05)) },
    quiet: {
      top: { score: 0.9, bandRows: 3 },
      bottom: { score: 0.8, bandRows: 2 },
      left: { score: 0.5, bandCols: 2 },
      right: { score: 0.5, bandCols: 2 },
    },
    focal: { x: 0.5, y: 0.22 },
    palette: [{ hex: "#8A6A52", population: 0.4, sat: 0.3, luma: 0.45 }],
    warmth: 0.2, saturation: 0.25, contrast: 0.3,
  };
}

function splitMetricsCtx(overrides = {}) {
  return {
    ...baseCtx(),
    heroForensics: locationForensics(),
    nameMetrics: {
      advanceEm: 0.6, advanceLongestEm: 0.62, trackingEm: 0.12,
      first: { advanceEm: 0.64, weight: 700 },
      last: { advanceEm: 0.6, weight: 500 },
      lastBody: { advanceEm: 0.55, weight: 600 },
    },
    language: { toneVector: { formality: 0.3, energy: 0.9, warmth: 0.5, density: 0.5 } },
    ...overrides,
  };
}

describe("sampler integration: reversed-type + verification rules", () => {
  test("knockout bands never reverse a hairline display below 24pt (120 seeds)", () => {
    // Matte fixture → on-photo names → knockout candidates. Playfair
    // Display (hairline class) drives the fixture; any knockout that
    // survives must be ≥ 24pt.
    const mg = (() => {
      const rows = 18; const cols = 12;
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (c >= 4 && c <= 7 && r >= 4 ? 0.9 : 0.0)));
    })();
    const ctx = {
      ...baseCtx(),
      heroForensics: studioForensics(),
      matteGrid: mg,
      language: { toneVector: { formality: 0.4, energy: 0.95, warmth: 0.5, density: 0.6 } },
    };
    let knockouts = 0;
    let onPhotoNames = 0;
    for (let i = 0; i < 120; i++) {
      const { program } = designFrontProgram(ctx, { seed: `ko-rule-${i}`, candidates: 1 });
      const hasSplit = program.elements.some((e) => e.role === "split-first");
      const band = program.elements.find((e) => e.type === "band");
      const name = program.elements.find((e) => e.type === "name");
      if (hasSplit || !name || !name.onPhoto) continue;
      onPhotoNames += 1;
      if (!band) continue;
      knockouts += 1;
      expect(name.sizePt).toBeGreaterThanOrEqual(24);
    }
    // the rule must be exercised, not vacuous: on-photo names occurred and
    // at least one knockout survived at ≥24pt
    expect(onPhotoNames).toBeGreaterThan(0);
    expect(knockouts).toBeGreaterThan(0);
  });

  test("palette-pulled color blocks never carry reversed micro contact below 10pt (200 seeds)", () => {
    let planeCards = 0;
    for (let i = 0; i < 200; i++) {
      const { program } = designFrontProgram(splitMetricsCtx(), { seed: `plane-${i}`, candidates: 1 });
      const plane = program.elements.find(
        (e) => e.type === "colorPlane" && e.fill !== "#FAF8F5" && e.fill !== "#FFFFFF",
      );
      if (!plane) continue;
      planeCards += 1;
      const contact = program.elements.find((e) => e.type === "contact");
      if (contact && contact.color && contact.color.startsWith("#FFFFFFC0".slice(0, 4)) === false) {
        // reversed contact on the block (mutedInk) — floor applies
      }
      if (contact && String(contact.color).toUpperCase().includes("FFFFFF")) {
        expect(contact.sizePt).toBeGreaterThanOrEqual(10);
      }
      // a solo name reversed on the block obeys the hairline floor
      const name = program.elements.find((e) => e.type === "name" && !e.role);
      if (name && !name.onPhoto && name.color === "#FFFFFF") {
        expect(name.sizePt).toBeGreaterThanOrEqual(24);
      }
    }
    expect(planeCards).toBeGreaterThan(0);
  });

  test("forced treatments never relax the fill floor: unverifiable pixels refuse even when pinned", () => {
    // On the busy checker NO fill (white/ink/accent) clears 3.0 worst-cell
    // — the old carve-out shipped 1.0-verified fills when pinned; now the
    // pinned treatment must refuse instead.
    for (const treatment of ["straddle", "over", "inset"]) {
      for (const seed of ["f-1", "f-2", "f-3"]) {
        const { program } = designFrontProgram(
          splitMetricsCtx({ heroForensics: busyForensics() }),
          { seed, candidates: 3, forceTreatment: treatment },
        );
        const splits = program.elements.filter((e) => e.role === "split-first" && e.onPhoto);
        expect(splits).toEqual([]);
      }
    }
  });

  test("forced treatments still land when the pixels verify (dark-bottom fixture)", () => {
    let landed = 0;
    for (const treatment of ["straddle", "over", "inset"]) {
      for (const seed of ["ok-1", "ok-2", "ok-3", "ok-4"]) {
        const { program } = designFrontProgram(
          splitMetricsCtx(),
          { seed, candidates: 3, forceTreatment: treatment },
        );
        if (program.elements.some((e) => e.role === "split-first")) landed += 1;
      }
    }
    expect(landed).toBeGreaterThan(0);
  });

  test("translucent band veils are per-cell solved: emitted alpha clears the worst band cell (150 seeds)", () => {
    const { cropForensics, visibleCropWindow } = require("../composition/crop-space");
    let bands = 0;
    for (let i = 0; i < 150; i++) {
      const ctx = splitMetricsCtx();
      const { program } = designFrontProgram(ctx, { seed: `veil-${i}`, candidates: 1 });
      const bandEl = program.elements.find(
        (e) => e.type === "band" && typeof e.fill === "string" && e.fill.startsWith("rgba("),
      );
      if (!bandEl) continue;
      const nameOnBand = program.elements.find((e) => e.variant === "band");
      if (!nameOnBand) continue; // knockouts / panels are solid fills
      bands += 1;
      const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(bandEl.fill);
      expect(m).toBeTruthy();
      const alpha = Number(m[4]);
      const veilGamma = (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
      const photo = program.elements.find((e) => e.type === "photo");
      const win = visibleCropWindow({
        imageAspect: ctx.heroAspect,
        cellAspect: photo.rect.w / photo.rect.h,
        objectPosition: "50% 50%",
      });
      const eff = cropForensics(ctx.heroForensics, win);
      const cells = cellsUnderRect(eff.luma.grid, bandEl.rect, photo.rect);
      expect(cells.length).toBeGreaterThan(0);
      const inkLin = linearLuminance(nameOnBand.color === "#FFFFFF" ? "#FFFFFF" : "#1A1815");
      const worst = Math.min(
        ...cells.map((c) => contrastOfLinear(inkLin, srgbLinear(alpha * veilGamma + (1 - alpha) * c))),
      );
      expect(worst).toBeGreaterThanOrEqual(4.5 - 1e-9);
    }
    expect(bands).toBeGreaterThan(0);
  });

  test("photo-riding contact is dropped when no ink verifies per-cell (busy bleed)", () => {
    // Busy checker hero: neither translucent white nor translucent ink can
    // reach 4.5:1 composited anywhere — a bottom-bleed card must ship
    // WITHOUT its contact rather than with an unverified one.
    for (let i = 0; i < 150; i++) {
      const { program } = designFrontProgram(
        splitMetricsCtx({ heroForensics: busyForensics() }),
        { seed: `drop-${i}`, candidates: 1 },
      );
      const contact = program.elements.find((e) => e.type === "contact");
      // photo-riding contacts use the translucent rgba inks — none can
      // verify on this fixture, so none may ship
      if (contact && String(contact.color).startsWith("rgba(")) {
        throw new Error(`seed drop-${i}: unverifiable photo-riding contact shipped (${contact.color})`);
      }
    }
  });

  test("verified photo-riding contact still ships on honest pixels", () => {
    // dark-bottom studio fixture: white @0.82 clears 4.5 per-cell
    let riding = 0;
    for (let i = 0; i < 150; i++) {
      const { program } = designFrontProgram(
        { ...baseCtx(), heroForensics: studioForensics(), matteGrid: undefined, language: { toneVector: { formality: 0.3, energy: 0.9, warmth: 0.5, density: 0.5 } } },
        { seed: `ride-${i}`, candidates: 1 },
      );
      const contact = program.elements.find(
        (e) => e.type === "contact" && String(e.color).startsWith("rgba("),
      );
      if (contact) riding += 1;
    }
    expect(riding).toBeGreaterThan(0);
  });
});
