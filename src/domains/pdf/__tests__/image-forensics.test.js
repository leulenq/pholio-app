/**
 * Tests for the atelier image-forensics module. Fixtures are generated with
 * sharp at runtime; the whole suite skips gracefully when sharp is missing.
 */

const {
  measureImage,
  forensicsForImages,
  GRID_ROWS,
  GRID_COLS,
} = require("../composition/image-forensics");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const maybeDescribe = sharp ? describe : describe.skip;

async function solidImage(r, g, b, w = 200, h = 300) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/** Top half one color, bottom half another (horizontal split). */
async function splitTopBottom(top, bottom, w = 200, h = 300) {
  const half = await sharp({
    create: { width: w, height: h / 2, channels: 3, background: bottom },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: w, height: h, channels: 3, background: top },
  })
    .composite([{ input: half, top: h / 2, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Deterministic structured noise at the analysis resolution (48×72) so the
 * variation survives the forensics downsample — mimics busy photographic
 * detail rather than sub-pixel grain.
 */
async function noiseImage(w = 48, h = 72) {
  const raw = Buffer.alloc(w * h * 3);
  let state = 12345;
  for (let i = 0; i < raw.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (state >> 8) % 256; // high bits — low LCG bits barely vary
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

maybeDescribe("measureImage", () => {
  test("solid image: flat grids, quiet everywhere, dominant palette color", async () => {
    const f = await measureImage(await solidImage(40, 40, 40));
    expect(f).not.toBeNull();
    expect(f.luma.grid).toHaveLength(GRID_ROWS);
    expect(f.luma.grid[0]).toHaveLength(GRID_COLS);
    expect(f.luma.isDark).toBe(true);
    expect(f.luma.mean).toBeLessThan(0.25);
    expect(f.quiet.top.score).toBeGreaterThan(0.9);
    expect(f.quiet.bottom.score).toBeGreaterThan(0.9);
    expect(f.quiet.left.score).toBeGreaterThan(0.9);
    expect(f.palette[0].population).toBeGreaterThan(0.9);
    expect(f.contrast).toBeLessThan(0.1);
    expect(f.aspect).toBeCloseTo(200 / 300, 2);
  });

  test("grid orientation: dark top / light bottom reads top-dark", async () => {
    const f = await measureImage(
      await splitTopBottom({ r: 10, g: 10, b: 10 }, { r: 245, g: 245, b: 245 }),
    );
    expect(f).not.toBeNull();
    expect(f.luma.grid[0][0]).toBeLessThan(0.2); // top row dark
    expect(f.luma.grid[GRID_ROWS - 1][0]).toBeGreaterThan(0.8); // bottom light
    // top and bottom bands are individually flat → quiet; high contrast image
    expect(f.quiet.top.score).toBeGreaterThan(0.8);
    expect(f.quiet.bottom.score).toBeGreaterThan(0.8);
    expect(f.contrast).toBeGreaterThan(0.5);
  });

  test("noise image is not quiet", async () => {
    const f = await measureImage(await noiseImage());
    expect(f).not.toBeNull();
    expect(f.quiet.top.score).toBeLessThan(0.6);
    expect(f.quiet.bottom.score).toBeLessThan(0.6);
  });

  test("warmth sign: red image warm, blue image cool", async () => {
    const warm = await measureImage(await solidImage(200, 60, 30));
    const cool = await measureImage(await solidImage(30, 60, 200));
    expect(warm.warmth).toBeGreaterThan(0.3);
    expect(cool.warmth).toBeLessThan(-0.3);
    expect(warm.saturation).toBeGreaterThan(0.3);
  });

  test("palette dominant color approximates fixture color", async () => {
    const f = await measureImage(await solidImage(180, 30, 30));
    const [dom] = f.palette;
    const r = parseInt(dom.hex.slice(1, 3), 16);
    const g = parseInt(dom.hex.slice(3, 5), 16);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(80);
    expect(dom.sat).toBeGreaterThan(0.4);
  });

  test("deterministic for identical buffers", async () => {
    const buf = await splitTopBottom({ r: 9, g: 9, b: 9 }, { r: 240, g: 240, b: 240 });
    const a = await measureImage(buf);
    const b = await measureImage(buf);
    expect(a).toEqual(b);
  });

  test("fail-soft: garbage and empty buffers → null", async () => {
    expect(await measureImage(Buffer.from("not an image"))).toBeNull();
    expect(await measureImage(Buffer.alloc(0))).toBeNull();
    expect(await measureImage(null)).toBeNull();
    expect(await measureImage("string")).toBeNull();
  });
});

maybeDescribe("forensicsForImages", () => {
  test("maps results per image; failures isolated", async () => {
    const good = await solidImage(100, 100, 100);
    const images = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const map = await forensicsForImages(images, {
      fetchBuffer: async (img) => {
        if (img.id === "a") return good;
        if (img.id === "b") throw new Error("boom");
        return Buffer.from("garbage");
      },
    });
    expect(map.get("a")).not.toBeNull();
    expect(map.get("b")).toBeNull();
    expect(map.get("c")).toBeNull();
  });

  test("a hung fetch times out to null without delaying siblings", async () => {
    const good = await solidImage(100, 100, 100);
    const started = Date.now();
    const map = await forensicsForImages([{ id: "hung" }, { id: "ok" }], {
      timeoutMs: 300,
      fetchBuffer: (img) =>
        img.id === "hung" ? new Promise(() => {}) : Promise.resolve(good),
    });
    expect(map.get("hung")).toBeNull();
    expect(map.get("ok")).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2500);
  });

  test("no fetchBuffer → all null; empty input → empty map", async () => {
    const map = await forensicsForImages([{ id: "x" }], {});
    expect(map.get("x")).toBeNull();
    const empty = await forensicsForImages([], { fetchBuffer: async () => null });
    expect(empty.size).toBe(0);
  });
});

if (!sharp) {
  test("sharp unavailable — forensics suite skipped", () => {
    expect(sharp).toBeNull();
  });
}
