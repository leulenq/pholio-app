"use strict";

/*
 * Getting text off an uploaded comp card.
 *
 * Two routes in, one shape out:
 *
 *   PDF with a text layer   → read it directly. Deterministic, exact, no model,
 *                             no pixels. This is the primary path, because a card
 *                             exported from a design tool keeps its text.
 *   Image, or a PDF that was flattened on export
 *                           → OCR the picture. A model is involved, so this is the
 *                             fallback, and it degrades to "nothing found" rather
 *                             than to a guess.
 *
 * **No card can fail this function.** Every branch returns a usable result — a
 * corrupt file, an unreadable card, a missing API key and a model outage all return
 * `{ lines: [] }` with a reason attached, which becomes an empty proposal, which
 * is a review screen the talent fills in by hand. There is no state in which
 * import blocks a talent from entering their own measurements, and there is no
 * human review queue anywhere in this path (`tasks/lessons.md` 2026-07-29: a gate
 * whose only escape hatch is a human queue must never block a linear flow).
 *
 * The single exception is infrastructural rather than about the card: if the
 * runtime has no Sharp binary, `SHARP_UNAVAILABLE` is thrown so the route can
 * answer 503 "try again shortly" instead of reporting a server outage as a
 * defective upload.
 */

const { getSharp } = require("../../../../shared/lib/lazy-sharp");
const { extractPdfText } = require("../../../../shared/lib/pdf-text");
const { transcribeCompCard } = require("../../../ai/comp-card-vision");

const PDF_MIME = "application/pdf";
const SUPPORTED_IMAGE_MIMES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** Long edge sent to OCR. Enough for stat-block text, small enough to stay cheap. */
const OCR_MAX_EDGE = 1600;

function isSupportedMime(mimeType) {
  return mimeType === PDF_MIME || SUPPORTED_IMAGE_MIMES.includes(mimeType);
}

/**
 * Normalise an uploaded image for OCR.
 *
 * Re-encoding through Sharp also strips EXIF, which is the point as much as the
 * resize: an uploaded card's metadata can carry GPS and device identifiers that
 * have nothing to do with reading text off it, and none of it should reach a
 * third-party model.
 *
 * Sharp is loaded lazily. It is a native module, and a `require` at file scope
 * runs at boot through the routes chain — a runtime missing the binary would
 * take down the whole app rather than this one feature. `getSharp()` returns
 * null instead, which this surfaces as an unavailable-service error.
 */
async function normaliseForOcr(buffer) {
  const sharp = getSharp();
  if (!sharp) {
    const err = new Error(
      "Image processing is unavailable on this server. Try again shortly.",
    );
    err.code = "SHARP_UNAVAILABLE";
    err.status = 503;
    throw err;
  }
  return sharp(buffer, { failOn: "none" })
    .rotate() // honour EXIF orientation before that data is dropped
    .resize({ width: OCR_MAX_EDGE, height: OCR_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Extract the text of a comp card.
 *
 * @param {Buffer} buffer
 * @param {{ mimeType: string, filename?: string }} file
 * @returns {Promise<{ lines: Array<object>, method: string, pageCount: number|null, reason: string|null }>}
 */
async function extractCardText(buffer, { mimeType, filename } = {}) {
  const empty = (method, reason) => ({
    lines: [],
    method,
    pageCount: null,
    reason,
    filename: filename || null,
    mimeType: mimeType || null,
  });

  if (!buffer || !buffer.length) return empty("none", "empty_file");
  if (!isSupportedMime(mimeType)) return empty("none", "unsupported_type");

  if (mimeType === PDF_MIME) {
    let doc = null;
    try {
      doc = await extractPdfText(buffer);
    } catch (err) {
      console.error("[comp-card-import] PDF read failed:", err?.message || err);
      // A PDF we cannot open is not necessarily a PDF we cannot OCR, but we have
      // no way to rasterise it here, so this is where that card stops.
      return empty("none", "pdf_unreadable");
    }

    if (doc.hasTextLayer) {
      return {
        lines: doc.pages.flatMap((page) => page.lines),
        method: "pdf_text",
        pageCount: doc.pageCount,
        reason: null,
        filename: filename || null,
        mimeType,
      };
    }

    // A flattened export. Rasterising a PDF needs a renderer this service does
    // not have, so rather than half-read it we say so plainly and let the talent
    // either upload the card as an image or type the fields.
    return { ...empty("none", "pdf_no_text_layer"), pageCount: doc.pageCount };
  }

  let normalised;
  try {
    normalised = await normaliseForOcr(buffer);
  } catch (err) {
    // A runtime with no image processing at all is a server fault, not an
    // unreadable card. Saying "that image could not be read" would blame the
    // talent's file for an outage and lose the operational signal, so this one
    // error travels out to become a 503.
    if (err?.code === "SHARP_UNAVAILABLE") throw err;
    console.error("[comp-card-import] image normalise failed:", err?.message || err);
    return empty("none", "image_unreadable");
  }

  const result = await transcribeCompCard(normalised, "image/png");
  if (!result.available) {
    return empty("vision", result.reason || "vision_unavailable");
  }

  return {
    // OCR returns strings with no geometry. Font height is unknown, so every line
    // is given the same weight — `findName` then falls back to its other tests
    // rather than trusting a fabricated size.
    lines: result.lines.map((text, index) => ({ text, index, fontHeight: 0, x: 0, y: -index })),
    method: "vision",
    pageCount: null,
    reason: null,
    filename: filename || null,
    mimeType,
  };
}

/** Why a card produced nothing, in words a talent can act on. */
const REASON_MESSAGES = Object.freeze({
  empty_file: "That file was empty. Try uploading it again.",
  unsupported_type: "Upload a PDF, JPEG, PNG or WebP comp card.",
  pdf_unreadable: "That PDF could not be opened. You can fill these in on your profile.",
  pdf_no_text_layer:
    "That PDF has no readable text — it was saved as a flat image. Upload the card as a JPEG or PNG instead, or fill them in on your profile.",
  image_unreadable: "That image could not be read. You can fill these in on your profile.",
  vision_not_configured: "Automatic reading is unavailable right now. You can fill these in on your profile.",
  vision_error: "Automatic reading did not finish. You can fill these in on your profile.",
  vision_unavailable: "Automatic reading did not finish. You can fill these in on your profile.",
  empty_completion: "Nothing readable came back from that card. You can fill these in on your profile.",
  unparseable_completion: "Nothing readable came back from that card. You can fill these in on your profile.",
  no_text_found: "No text could be read on that card. You can fill these in on your profile.",
});

function messageForReason(reason) {
  if (!reason) return null;
  return REASON_MESSAGES[reason] || "That card could not be read. You can fill these in on your profile.";
}

module.exports = {
  OCR_MAX_EDGE,
  PDF_MIME,
  REASON_MESSAGES,
  SUPPORTED_IMAGE_MIMES,
  extractCardText,
  isSupportedMime,
  messageForReason,
  normaliseForOcr,
};
