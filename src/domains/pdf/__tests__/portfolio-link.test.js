/**
 * Tests for the premium portfolio link system: pdf-lib annotation stamping
 * with correct inch→point coordinate conversion, metadata, merge-not-replace
 * behavior, fail-soft guarantees, subtle-QR ink enforcement, short URLs.
 */

const { PDFDocument, PDFName, PDFArray } = require("pdf-lib");
const {
  shortPortfolioUrl,
  embedPortfolioLink,
  buildSubtleQrSvg,
  hexLuminance,
} = require("../composition/portfolio-link");

const PAGE_W_PT = 5.5 * 72; // 396
const PAGE_H_PT = 8.5 * 72; // 612

async function twoPagePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([PAGE_W_PT, PAGE_H_PT]);
  doc.addPage([PAGE_W_PT, PAGE_H_PT]);
  return Buffer.from(await doc.save());
}

async function annotsOfPage(buffer, pageIndex) {
  const doc = await PDFDocument.load(buffer);
  const page = doc.getPage(pageIndex);
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (!(annots instanceof PDFArray)) return [];
  const out = [];
  for (let i = 0; i < annots.size(); i++) {
    out.push(annots.lookup(i));
  }
  return out;
}

describe("embedPortfolioLink", () => {
  test("stamps one annotation per wordmark with converted coordinates", async () => {
    const input = await twoPagePdf();
    const out = await embedPortfolioLink(input, {
      url: "https://app.pholio.studio/p/elara-k",
      title: "Elara Keats — Comp Card",
      subject: "https://app.pholio.studio/p/elara-k",
      wordmarks: [
        { pageIndex: 0, xIn: 4.35, yIn: 8.07, wIn: 0.9, hIn: 0.18 },
        { pageIndex: 1, xIn: 4.25, yIn: 7.98, wIn: 1.0, hIn: 0.22 },
      ],
    });
    expect(out).not.toEqual(input);

    const front = await annotsOfPage(out, 0);
    const back = await annotsOfPage(out, 1);
    expect(front).toHaveLength(1);
    expect(back).toHaveLength(1);

    // Hand-computed: x1 = 4.35·72 = 313.2 ; y1 = 612 − (8.07+0.18)·72 = 18
    // x2 = (4.35+0.9)·72 = 378 ; y2 = 612 − 8.07·72 = 30.96
    const rect = front[0].lookup(PDFName.of("Rect"));
    const nums = [0, 1, 2, 3].map((i) => rect.lookup(i).asNumber());
    expect(nums[0]).toBeCloseTo(313.2, 1);
    expect(nums[1]).toBeCloseTo(18, 1);
    expect(nums[2]).toBeCloseTo(378, 1);
    expect(nums[3]).toBeCloseTo(30.96, 1);

    const action = front[0].lookup(PDFName.of("A"));
    expect(action.lookup(PDFName.of("URI")).decodeText()).toBe(
      "https://app.pholio.studio/p/elara-k",
    );

    const doc = await PDFDocument.load(out);
    expect(doc.getTitle()).toBe("Elara Keats — Comp Card");
    expect(doc.getAuthor()).toBe("Pholio");
  });

  test("merges with existing annotations instead of replacing", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([PAGE_W_PT, PAGE_H_PT]);
    const existing = doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [0, 0, 10, 10],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: "https://example.com/existing" },
    });
    page.node.set(
      PDFName.of("Annots"),
      doc.context.obj([doc.context.register(existing)]),
    );
    const input = Buffer.from(await doc.save());

    const out = await embedPortfolioLink(input, {
      url: "https://app.pholio.studio/p/x",
      wordmarks: [{ pageIndex: 0, xIn: 4, yIn: 8, wIn: 1, hIn: 0.2 }],
    });
    expect(await annotsOfPage(out, 0)).toHaveLength(2);
  });

  test("out-of-range pageIndex is skipped, valid ones still applied", async () => {
    const out = await embedPortfolioLink(await twoPagePdf(), {
      url: "https://x.test/p/a",
      wordmarks: [
        { pageIndex: 0, xIn: 4, yIn: 8, wIn: 1, hIn: 0.2 },
        { pageIndex: 7, xIn: 4, yIn: 8, wIn: 1, hIn: 0.2 },
      ],
    });
    expect(await annotsOfPage(out, 0)).toHaveLength(1);
  });

  test("fail-soft: garbage buffer returns the identical buffer", async () => {
    const garbage = Buffer.from("definitely not a pdf");
    const out = await embedPortfolioLink(garbage, {
      url: "https://x.test",
      wordmarks: [{ pageIndex: 0, xIn: 0, yIn: 0, wIn: 1, hIn: 1 }],
    });
    expect(out).toBe(garbage);
  });

  test("missing url or empty buffer → original input back", async () => {
    const pdf = await twoPagePdf();
    expect(await embedPortfolioLink(pdf, { wordmarks: [] })).toBe(pdf);
    expect(await embedPortfolioLink(null, { url: "https://x.test" })).toBeNull();
  });
});

describe("buildSubtleQrSvg", () => {
  test("produces an SVG using the requested dark ink", async () => {
    const svg = await buildSubtleQrSvg({
      url: "https://app.pholio.studio/p/elara-k",
      ink: "#1A1815",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("#1A1815");
  });

  test("light/gold ink is rejected in favor of house ink", async () => {
    const svg = await buildSubtleQrSvg({
      url: "https://app.pholio.studio/p/elara-k",
      ink: "#C9A55A", // brand gold — too light to scan
    });
    expect(svg).toContain("#1A1815");
    expect(svg).not.toContain("#C9A55A");
  });

  test("no url → null", async () => {
    expect(await buildSubtleQrSvg({})).toBeNull();
  });
});

describe("shortPortfolioUrl + hexLuminance", () => {
  test("builds the /p/ short link and trims trailing slashes", () => {
    expect(
      shortPortfolioUrl({ slug: "elara-k" }, "https://app.pholio.studio/"),
    ).toBe("https://app.pholio.studio/p/elara-k");
    expect(shortPortfolioUrl({ slug: "" }, "https://x.test")).toBeNull();
    expect(shortPortfolioUrl({ slug: "a b" }, "https://x.test")).toBe(
      "https://x.test/p/a%20b",
    );
  });

  test("hexLuminance orders dark < light", () => {
    expect(hexLuminance("#1A1815")).toBeLessThan(0.05);
    expect(hexLuminance("#C9A55A")).toBeGreaterThan(0.35);
    expect(hexLuminance("not-a-color")).toBeNull();
  });
});
