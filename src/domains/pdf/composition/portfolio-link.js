/**
 * Premium portfolio link & NFC workflow (atelier engine v2).
 *
 * The mechanism that connects a comp card to the talent's live portfolio,
 * tiered by medium (spec: tasks/comp-card-atelier-spec.md §D):
 *
 * 1. DIGITAL PDF (primary): the Pholio wordmark printed on the card becomes
 *    a clickable PDF link annotation, added by post-processing the Puppeteer
 *    buffer with pdf-lib (headless Chromium emits no link annotations —
 *    verified empirically). Document metadata (Title/Author/Subject) is set
 *    at the same time. Zero visual addition.
 * 2. PRINT (primary): NFC — the short URL from shortPortfolioUrl() is what
 *    gets encoded as an NDEF URI on NTAG213-class ultra-thin inlays applied
 *    to the printed card. iPhone XS+ and modern Android read NDEF tags
 *    natively (no app). This is a physical add-on workflow; nothing changes
 *    in the PDF.
 * 3. PRINT FALLBACK (opt-in only): a small dot-matrix QR for the same short
 *    URL. QR codes need strong dark-on-light contrast to scan — light/gold
 *    inks fail, so the ink is forced dark. Keep ≥ 0.45in at 300dpi with the
 *    standard 4-module quiet zone so version-1/2 codes stay reliable at
 *    arm's length.
 *
 * Coordinate conversion: card geometry is specified in inches from a
 * TOP-LEFT origin (CSS space); PDF rectangles are in points (72/in) from a
 * BOTTOM-LEFT origin. For a wordmark at (xIn, yIn, wIn, hIn) on a page of
 * height Hpt:  x1 = xIn·72, y1 = Hpt − (yIn + hIn)·72,
 *              x2 = (xIn + wIn)·72, y2 = Hpt − yIn·72.
 *
 * Every function is fail-soft: embedPortfolioLink returns the ORIGINAL
 * buffer on any failure; buildSubtleQrSvg returns null.
 */

const QR_MIN_PRINT_IN = 0.45;

/** Relative luminance (sRGB) of a #RRGGBB hex, 0..1. */
function hexLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)
  );
}

/**
 * Canonical short URL for a profile — the value encoded on NFC tags and QR
 * codes, and annotated onto digital PDFs (redirects via GET /p/:slug).
 */
function shortPortfolioUrl(profile, baseUrl) {
  const slug = profile && profile.slug ? String(profile.slug).trim() : "";
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!slug || !base) return null;
  return `${base}/p/${encodeURIComponent(slug)}`;
}

/**
 * Add wordmark link annotations + document metadata to a finished PDF.
 *
 * @param {Buffer} pdfBuffer — Puppeteer output
 * @param {object} options
 * @param {string} options.url
 * @param {string} [options.title]
 * @param {string} [options.author='Pholio']
 * @param {string} [options.subject]
 * @param {Array<{pageIndex:number, xIn:number, yIn:number, wIn:number, hIn:number}>} options.wordmarks
 * @returns {Promise<Buffer>} new buffer, or the ORIGINAL buffer on failure
 */
async function embedPortfolioLink(pdfBuffer, options = {}) {
  const { url, title, author = "Pholio", subject, wordmarks = [] } = options;
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0 || !url) {
    return pdfBuffer;
  }
  try {
    // eslint-disable-next-line global-require
    const { PDFDocument, PDFName, PDFArray } = require("pdf-lib");
    const doc = await PDFDocument.load(pdfBuffer);
    const pageCount = doc.getPageCount();
    const { context } = doc;

    for (const mark of wordmarks) {
      if (!mark || !Number.isInteger(mark.pageIndex)) continue;
      if (mark.pageIndex < 0 || mark.pageIndex >= pageCount) continue;
      const page = doc.getPage(mark.pageIndex);
      const pageHpt = page.getHeight();
      const x1 = mark.xIn * 72;
      const y1 = pageHpt - (mark.yIn + mark.hIn) * 72;
      const x2 = (mark.xIn + mark.wIn) * 72;
      const y2 = pageHpt - mark.yIn * 72;

      const annot = context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [x1, y1, x2, y2],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: String(url) },
      });
      const ref = context.register(annot);

      // Merge with any existing annotations — never replace.
      const annotsKey = PDFName.of("Annots");
      const existing = page.node.lookup(annotsKey);
      if (existing instanceof PDFArray) {
        existing.push(ref);
      } else {
        page.node.set(annotsKey, context.obj([ref]));
      }
    }

    if (title) doc.setTitle(String(title));
    if (author) doc.setAuthor(String(author));
    if (subject) doc.setSubject(String(subject));
    doc.setCreator("Pholio Comp Card Engine");

    const out = await doc.save({ useObjectStreams: false });
    return Buffer.from(out);
  } catch (err) {
    console.warn("[portfolio-link] embed failed, returning original buffer:", err.message);
    return pdfBuffer;
  }
}

/**
 * Small, brand-restrained QR as an SVG string (opt-in print fallback only).
 * Ink is forced dark: codes lighter than ~0.3 relative luminance (gold,
 * pastels, mid-tones) fail scanner contrast requirements and are replaced with the
 * house ink.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {number} [options.sizeIn=0.5] — rendered size; keep ≥ 0.45in
 * @param {string} [options.ink='#1A1815']
 * @returns {Promise<string|null>}
 */
async function buildSubtleQrSvg(options = {}) {
  const { url, sizeIn = 0.5 } = options;
  if (!url) return null;
  let ink = options.ink || "#1A1815";
  const luminance = hexLuminance(ink);
  if (luminance == null || luminance > 0.3) {
    ink = "#1A1815";
  }
  try {
    // eslint-disable-next-line global-require
    const QRCode = require("qrcode");
    const svg = await QRCode.toString(String(url), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4, // standard quiet zone (modules)
      color: { dark: ink, light: "#FFFFFF00" },
      width: Math.round(Math.max(sizeIn, QR_MIN_PRINT_IN) * 300), // 300dpi
    });
    return typeof svg === "string" && svg.includes("<svg") ? svg : null;
  } catch (err) {
    console.warn("[portfolio-link] QR generation failed:", err.message);
    return null;
  }
}

module.exports = {
  shortPortfolioUrl,
  embedPortfolioLink,
  buildSubtleQrSvg,
  hexLuminance,
  QR_MIN_PRINT_IN,
};
