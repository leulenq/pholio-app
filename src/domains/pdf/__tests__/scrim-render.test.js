/**
 * Rasterized scrim regression (audit P0-2).
 *
 * The composed front renders program scrims as siblings of a z-positioned
 * photo plane. Without an explicit z-index the scrim paints at level 0
 * UNDER the photo and contributes zero pixels — the solved contrast never
 * materializes. This test renders the REAL structural pattern from
 * compcard-composed.ejs in a headless browser and asserts, at the pixel
 * level, that the scrim materially darkens the photo band it covers.
 *
 * It is the first rasterized gate in the suite: template z-order bugs
 * cannot be seen by any plan-level test, only by sampled pixels.
 */

const fs = require("fs");
const path = require("path");

const CHROMIUM_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.PLAYWRIGHT_BROWSERS_PATH
    ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")
    : null,
  "/opt/pw-browsers/chromium",
].filter(Boolean);

function resolveExecutablePath() {
  for (const p of CHROMIUM_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* keep looking */
    }
  }
  return null; // let puppeteer use its own download if present
}

// Mid-gray photo stand-in: the worst band for both inks, and the case the
// scrim exists to rescue. Encoded as a data URI so the test needs no
// network and no fixture files.
const GRAY_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#B0B0B0"/></svg>',
).toString("base64");

/** The template's exact structural pattern (page > photo z10, scrim, name z40). */
function pageHtml({ scrimZIndex }) {
  const scrimZ = scrimZIndex == null ? "" : `z-index:${scrimZIndex};`;
  return `<!DOCTYPE html><html><head><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    .comp-card-page { position:relative; width:396px; height:612px; overflow:hidden; background:#fff; }
    .abs { position:absolute; }
    .hero img { width:100%; height:100%; object-fit:cover; display:block; }
  </style></head><body>
  <div class="comp-card-page">
    <div class="abs hero" style="left:0;top:0;width:396px;height:612px;z-index:10;">
      <img src="data:image/svg+xml;base64,${GRAY_SVG}">
    </div>
    <div class="abs" data-scrim style="left:0;right:0;bottom:0;height:160px;pointer-events:none;${scrimZ}background:linear-gradient(to top, rgba(10,9,8,0.62), rgba(10,9,8,0));"></div>
    <div class="abs" style="left:40px;top:560px;z-index:40;color:#fff;font:20px sans-serif;">NAME</div>
  </div>
  </body></html>`;
}

const describeMaybe = (() => {
  try {
    require.resolve("puppeteer");
    return describe;
  } catch {
    return describe.skip;
  }
})();

describeMaybe("composed-front scrim rasterization", () => {
  jest.setTimeout(60000);
  let browser;
  let sharp;

  beforeAll(async () => {
    const puppeteer = require("puppeteer");
    sharp = require("sharp");
    const executablePath = resolveExecutablePath();
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  async function renderAndSample(html) {
    const page = await browser.newPage();
    await page.setViewport({ width: 396, height: 612 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    const shot = await page.screenshot({ type: "png" });
    await page.close();
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    const sample = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return (data[i] + data[i + 1] + data[i + 2]) / 3;
    };
    return {
      // inside the scrim band (near bottom), and far above it (raw photo)
      inScrim: sample(198, 600),
      abovePhoto: sample(198, 100),
    };
  }

  test("the template's scrim (explicit z-index) materially darkens the band", async () => {
    // Read the real template and assert the fix is present, so a revert of
    // the z-index in compcard-composed.ejs fails THIS test even before the
    // pixel assertion runs.
    const tpl = fs.readFileSync(
      path.join(__dirname, "..", "templates", "compcard-composed.ejs"),
      "utf8",
    );
    const scrimLine = tpl.match(/data-scrim[^`]*`/)?.[0] || "";
    expect(scrimLine).toContain("z-index:12");

    const { inScrim, abovePhoto } = await renderAndSample(pageHtml({ scrimZIndex: 12 }));
    // raw photo gray ≈ 176; under a 0.62 dark scrim ≈ 70–90
    expect(abovePhoto).toBeGreaterThan(160);
    expect(inScrim).toBeLessThan(abovePhoto - 50);
  });

  test("regression shape: WITHOUT a z-index the scrim is occluded (the bug)", async () => {
    const { inScrim, abovePhoto } = await renderAndSample(pageHtml({ scrimZIndex: null }));
    // Documents the failure mode this suite guards against: sibling scrim
    // with z-auto paints under the z-10 photo → pixels identical.
    expect(Math.abs(inScrim - abovePhoto)).toBeLessThan(6);
  });
});
