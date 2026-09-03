"use strict";

/**
 * Pholio ID — pass builder.
 *
 * Orchestrates content (pass-content), imagery (pass-artwork) and the signed
 * bundle (pass-bundle). Picks the hero photograph the way the comp card does
 * (photo-intelligence ranking, rights and status gates, the talent's own
 * primary pick honoured when eligible) and locates the face (face-locator)
 * before a single pixel is cropped.
 */

const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");
const { analyzeImagePool } = require("../../pdf/composition/photo-intelligence");
const { SENSITIVE_IMAGE_SHOT_TYPES } = require("../../../shared/lib/talent-age");
const { buildPassContent, WalletPassError } = require("./pass-content");
const { renderPassAssets } = require("./pass-artwork");
const { packPass } = require("./pass-bundle");
const { locateSubject } = require("./face-locator");

/**
 * Choose the photograph the pass is built from.
 *
 * Eligibility comes from the comp-card pool analysis (archived/retired and
 * rights-denied images drop out). A minor's pass never uses a full-length
 * frame. The talent's primary image wins when it is eligible; otherwise the
 * hero ranking decides.
 *
 * @param {Array<object>} images — images rows for the profile
 * @param {object} [options]
 * @param {boolean} [options.minor]
 * @param {object} [options.profile]
 * @returns {object|null}
 */
function selectHeroImage(images, { minor = false, profile } = {}) {
  const rows = (Array.isArray(images) ? images : []).filter(
    (row) => row && (row.asset_kind == null || row.asset_kind !== "video"),
  );
  const candidates = minor
    ? rows.filter((row) => !SENSITIVE_IMAGE_SHOT_TYPES.has(String(row.shot_type || "").toLowerCase()))
    : rows;
  if (!candidates.length) return null;
  const analysis = analyzeImagePool({ images: candidates, profile });
  const eligible = new Set(analysis.pool.map((item) => item.id));
  const primary = candidates.find((row) => row.is_primary && eligible.has(row.id));
  if (primary) return primary;
  const heroId = analysis.heroRanking[0];
  return candidates.find((row) => row.id === heroId) || null;
}

/**
 * Everything that goes into the bundle, unsigned: pass.json plus images.
 * Shared by the signed download and the preview rig.
 */
async function buildPassFiles({ profile, user, images, representations, portfolioUrl, passTypeIdentifier, teamIdentifier, theme, now }) {
  const content = buildPassContent({ profile, user, representations, portfolioUrl, passTypeIdentifier, teamIdentifier, theme, now });
  const hero = selectHeroImage(images, { minor: content.view.minor, profile });
  if (!hero) throw new WalletPassError("Add a photo before creating a Pholio ID.", "WALLET_PHOTO_REQUIRED");
  const photo = await fetchImageBuffer(hero);
  if (!photo?.length) throw new WalletPassError("Your photo could not be loaded for Pholio ID. Try again, or choose another primary photo.", "WALLET_PHOTO_UNAVAILABLE");
  const subject = await locateSubject(photo, hero);
  const assets = await renderPassAssets({ photo, focal: subject.focal, face: subject.face, theme: content.view.theme });
  return {
    files: { "pass.json": Buffer.from(JSON.stringify(content.pass)), ...assets },
    content,
    hero,
    subject,
  };
}

/**
 * Signed .pkpass bytes for a talent.
 * @returns {Promise<Buffer>}
 */
async function buildWalletPass({ profile, user, images, representations, portfolioUrl, config, theme, now }) {
  const { files } = await buildPassFiles({
    profile,
    user,
    images,
    representations,
    portfolioUrl,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    theme,
    now,
  });
  return packPass(files, config.certificates);
}

module.exports = {
  WalletPassError,
  selectHeroImage,
  buildPassFiles,
  buildWalletPass,
};
