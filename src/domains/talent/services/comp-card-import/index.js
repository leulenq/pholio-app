"use strict";

/*
 * Comp card import — extract an existing agency card into a reviewable pre-fill.
 *
 * This is the *import source* half of the two features the product plan separates.
 * It reads a card the talent already has and proposes structured profile fields.
 * It does not store the card as an attachment, does not create image records, and
 * does not let a flat card stand in for the structured profile — an inbox of half
 * structured packages and half PDFs is email again.
 *
 * Compliance: `docs/comp-card-import-architecture.md`. Short version — text and
 * layout only, no face templates, no embeddings, no cross-image identity linking.
 */

const { extractCardText, isSupportedMime, messageForReason } = require("./extract");
const { parseCard } = require("./parse-card");
const { buildProposal, buildProfileUpdate, FIELD_SPECS, MEASUREMENT_SOURCE_IMPORT } = require("./proposal");

/**
 * Read an uploaded card and build the proposal for the talent to review.
 *
 * Always resolves. A card that cannot be read yields a proposal whose fields are
 * all `not_found`, plus a message saying why — which is a working manual-entry
 * screen, not a dead end.
 *
 * @param {Buffer} buffer
 * @param {{ mimeType: string, filename?: string }} file
 * @param {{ knownAgencies?: Array<{ id: string, name: string }> }} [options]
 */
async function importCompCard(buffer, file, { knownAgencies = [] } = {}) {
  const extraction = await extractCardText(buffer, file);
  const parsed = parseCard(extraction.lines, { knownAgencies });

  const proposal = buildProposal(parsed, {
    method: extraction.method,
    filename: extraction.filename,
    mimeType: extraction.mimeType,
    pageCount: extraction.pageCount,
    reason: extraction.reason,
  });

  return {
    ...proposal,
    message: messageForReason(extraction.reason),
    // The transcribed lines, so the review screen can show the talent what was
    // actually read off their card rather than asking them to trust the parse.
    readLines: extraction.lines.map((line) => line.text).filter(Boolean),
  };
}

module.exports = {
  FIELD_SPECS,
  MEASUREMENT_SOURCE_IMPORT,
  buildProfileUpdate,
  buildProposal,
  extractCardText,
  importCompCard,
  isSupportedMime,
  messageForReason,
  parseCard,
};
