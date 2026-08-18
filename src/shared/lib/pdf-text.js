"use strict";

/*
 * PDF text-layer reader.
 *
 * Reads the text a PDF already carries, with the position and font size of every
 * run. It does not rasterise, does not decode embedded images, and never looks at
 * pixels — a comp card's photographs are opaque to this module by construction.
 * That is deliberate: see `docs/comp-card-import-architecture.md`.
 *
 * A comp card exported from InDesign, Canva or a agency template keeps a real text
 * layer, so the stat block comes back exactly as typeset. A card that was flattened
 * to an image on export carries no text layer at all, and this module says so
 * (`hasTextLayer: false`) rather than returning a plausible-looking empty result —
 * the caller needs the difference to decide whether to fall back to OCR.
 *
 * pdfjs-dist v6 is ESM-only. `getPdfjs()` bridges it into this CommonJS tree with a
 * cached dynamic import.
 */

/** Two runs are on the same line when their baselines are within this fraction of the larger font height. */
const LINE_TOLERANCE_RATIO = 0.5;
/** Below this many non-space characters a "text layer" is page furniture, not content. */
const MIN_MEANINGFUL_CHARS = 24;

const path = require("path");

/** Bundled standard-font data, resolved off the installed package. */
const STANDARD_FONT_DATA_URL = `${path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts",
)}${path.sep}`;

let _pdfjs = null;

async function getPdfjs() {
  if (!_pdfjs) {
    // eslint-disable-next-line no-undef
    _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return _pdfjs;
}

/**
 * Collapse the letter-spacing agencies typeset names with.
 *
 * Tracking a name out to "E L I A S  V A N C E" is close to universal on comp
 * cards. The trap is that the gap between letters and the gap between words are
 * both spaces, so a naive collapse yields "ELIASVANCE".
 *
 * What separates them is the *run* boundary, not the spacing: exporters emit one
 * text run per word, so collapsing per run — before runs are joined — recovers the
 * words. That is why this is called on `run.text` and never on a joined line.
 *
 * It does not help to look for a doubled space at the word gap. pdfjs normalises
 * runs of whitespace inside a text item, so by the time a string reaches this
 * function "M A R A  O K O N K W O" has already become "M A R A O K O N K W O".
 * A fully tracked name arriving as a single run is therefore not separable, and
 * `findName` marks the one-word result low-confidence rather than inventing a
 * split. The 2+ space branch below is kept for OCR lines, which are not
 * normalised and where a doubled gap does survive.
 *
 * Four spaced singles are required before a segment is treated as tracking, so
 * ordinary text and initials like "J R Smith" survive untouched.
 */
function collapseLetterSpacing(text) {
  if (!text) return "";
  return String(text)
    .split(/\s{2,}/)
    .map((segment) =>
      segment.replace(/(?:(?<![^\s])[^\s]\s){3,}[^\s](?![^\s])/g, (run) =>
        run.replace(/\s+/g, ""),
      ),
    )
    .join(" ");
}

function normaliseSpace(text) {
  return String(text || "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Group positioned runs into visual lines.
 *
 * Comp card stat blocks are label/value pairs sharing a baseline ("WAIST" at x=32,
 * `24"` at x=69), so the line is the unit that carries meaning. Grouping by
 * baseline within a font-height tolerance reconstructs it; sorting by x restores
 * reading order, which the PDF content stream does not guarantee.
 */
function groupIntoLines(items) {
  const lines = [];

  for (const item of items) {
    const text = item.str;
    if (!text || !text.trim()) continue;

    const x = item.transform[4];
    const y = item.transform[5];
    // transform[3] is the vertical scale — the rendered font height, which is how
    // the name gets found later (it is the biggest text on the card).
    const fontHeight = Math.abs(item.transform[3]) || item.height || 0;

    const tolerance = Math.max(fontHeight, 1) * LINE_TOLERANCE_RATIO;
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= tolerance);

    if (line) {
      line.runs.push({ text, x, fontHeight });
      line.fontHeight = Math.max(line.fontHeight, fontHeight);
    } else {
      lines.push({ y, fontHeight, runs: [{ text, x, fontHeight }] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y) // PDF origin is bottom-left; top of page first
    .map((line, index) => {
      const runs = [...line.runs]
        .sort((a, b) => a.x - b.x)
        .map((run) => ({
          // Per run, and before whitespace is normalised: normalising first would
          // erase the double space that marks a word boundary inside a tracked run.
          text: normaliseSpace(collapseLetterSpacing(run.text)),
          x: run.x,
          fontHeight: run.fontHeight,
        }));
      return {
        index,
        y: line.y,
        x: runs[0].x,
        fontHeight: line.fontHeight,
        text: normaliseSpace(runs.map((run) => run.text).join(" ")),
        runs,
      };
    })
    .filter((line) => line.text.length > 0);
}

/**
 * Read a PDF's text layer.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {{ maxPages?: number }} [options]
 * @returns {Promise<{ hasTextLayer: boolean, charCount: number, pageCount: number,
 *   pages: Array<{ pageNumber: number, width: number, height: number,
 *   lines: Array<{ index: number, text: string, x: number, y: number, fontHeight: number }> }> }>}
 */
async function extractPdfText(buffer, { maxPages = 4 } = {}) {
  const pdfjs = await getPdfjs();
  // pdfjs rejects a Node Buffer by name, and `Buffer` is a Uint8Array subclass, so
  // an `instanceof` guard passes it straight through. Always hand over a plain view.
  const data = new Uint8Array(
    buffer.buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer,
  );

  // Destroy is on the loading task, not the document proxy, and it is what
  // releases the worker — skipping it leaks a worker per upload.
  const loadingTask = pdfjs.getDocument({
    data,
    // A comp card is a document, not a program. Nothing in it should be able to
    // run script, pull a remote font, or reach the network from the server.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    // The standard-font data ships with the package. Pointing at the local copy
    // keeps pdfjs off the network and silences the warning it logs per document
    // when the path is absent — we only read text, but it warns regardless.
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const doc = await loadingTask.promise;

  try {
    const pageCount = doc.numPages;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, maxPages); pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      try {
        const [textContent, viewport] = await Promise.all([
          page.getTextContent(),
          Promise.resolve(page.getViewport({ scale: 1 })),
        ]);
        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          lines: groupIntoLines(textContent.items || []),
        });
      } finally {
        page.cleanup();
      }
    }

    const charCount = pages.reduce(
      (total, page) =>
        total + page.lines.reduce((sum, line) => sum + line.text.replace(/\s/g, "").length, 0),
      0,
    );

    return {
      hasTextLayer: charCount >= MIN_MEANINGFUL_CHARS,
      charCount,
      pageCount,
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

module.exports = {
  MIN_MEANINGFUL_CHARS,
  collapseLetterSpacing,
  extractPdfText,
  groupIntoLines,
};
