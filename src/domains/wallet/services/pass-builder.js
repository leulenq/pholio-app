"use strict";

const sharp = require("sharp");
const { PKPass } = require("passkit-generator");
const { toFeetInches } = require("../../talent/services/profile-helpers");
const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");

class WalletPassError extends Error {
  constructor(message, code, status = 422) {
    super(message);
    this.name = "WalletPassError";
    this.code = code;
    this.status = status;
  }
}

function nonEmpty(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function fullName(profile, user) {
  return [profile.first_name || user?.first_name, profile.last_name || user?.last_name]
    .map(nonEmpty).filter(Boolean).join(" ");
}

function measurementFields(profile) {
  return [
    ["bust", "BUST", profile.bust || profile.bust_cm],
    ["waist", "WAIST", profile.waist || profile.waist_cm],
    ["hips", "HIPS", profile.hips || profile.hips_cm],
    ["shoe", "SHOES", profile.shoe_size],
  ].filter(([, , value]) => nonEmpty(value))
    .map(([key, label, value]) => ({ key, label, value: String(value) }));
}

function representationValue(representations) {
  const active = Array.isArray(representations)
    ? representations.find((item) => item.status === "active")
    : null;
  return nonEmpty(active?.agency_name || active?.external_agency_name);
}

function frontIdentityFields(profile, representations) {
  const representation = representationValue(representations);
  return [
    ...(toFeetInches(profile.height_cm)
      ? [{ key: "height", label: "HEIGHT", value: toFeetInches(profile.height_cm) }]
      : []),
    ...(nonEmpty(profile.eye_color)
      ? [{ key: "eyes", label: "EYES", value: nonEmpty(profile.eye_color) }]
      : []),
    {
      key: "representation",
      label: "REPRESENTATION",
      value: representation || "Independent",
    },
  ].slice(0, 3);
}

function buildPassProps({ profile, user, representations, passTypeIdentifier, teamIdentifier, portfolioUrl }) {
  const name = fullName(profile, user);
  if (!name) throw new WalletPassError("Add your name before creating a Pholio ID.", "WALLET_NAME_REQUIRED");
  if (!profile.id || !profile.slug) {
    throw new WalletPassError("Complete your profile before creating a Pholio ID.", "WALLET_PROFILE_INCOMPLETE");
  }
  const representation = representationValue(representations);
  return {
    formatVersion: 1,
    passTypeIdentifier,
    serialNumber: String(profile.id),
    teamIdentifier,
    organizationName: "Pholio",
    description: `Pholio ID for ${name}`,
    // The wordmark is supplied as an image so Wallet preserves its editorial tracking.
    backgroundColor: "rgb(250, 248, 245)",
    foregroundColor: "rgb(26, 24, 21)",
    labelColor: "rgb(166, 132, 92)",
    sharingProhibited: false,
    generic: {
      primaryFields: [{ key: "name", label: "PHOLIO ID", value: name }],
      secondaryFields: frontIdentityFields(profile, representations),
      auxiliaryFields: [
        ...measurementFields(profile),
        ...(nonEmpty(profile.hair_color) ? [{ key: "hair", label: "HAIR", value: nonEmpty(profile.hair_color) }] : []),
      ].slice(0, 4),
      backFields: [
        { key: "portfolio", label: "PORTFOLIO", value: portfolioUrl },
        ...(representation ? [{ key: "representation-detail", label: "REPRESENTATION", value: representation }] : []),
        { key: "support", label: "SUPPORT", value: "support@pholio.studio" },
      ],
    },
    barcode: {
      format: "PKBarcodeFormatQR",
      message: portfolioUrl,
      messageEncoding: "iso-8859-1",
      altText: portfolioUrl.replace(/^https?:\/\//, ""),
    },
  };
}

function svgBuffer(svg) { return Buffer.from(svg, "utf8"); }

function logoSvg(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 160 50"><text x="1" y="35" fill="#C9A55A" font-family="Georgia, serif" font-size="29" font-weight="400" letter-spacing="6.1">PHOLIO</text></svg>`;
}

function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 29 29"><rect width="29" height="29" rx="5" fill="#0A0A09"/><path d="M8 23V6h7.4c4.05 0 6.6 2.1 6.6 5.5 0 3.46-2.55 5.57-6.6 5.57h-3.3V23H8Zm4.1-9.34h2.79c1.9 0 3.04-.76 3.04-2.16 0-1.37-1.14-2.1-3.04-2.1H12.1v4.26Z" fill="#C9A55A"/></svg>`;
}

async function staticAssets() {
  const [icon, icon2x, icon3x, logo, logo2x, logo3x] = await Promise.all([
    sharp(svgBuffer(iconSvg(29))).png().toBuffer(), sharp(svgBuffer(iconSvg(58))).png().toBuffer(), sharp(svgBuffer(iconSvg(87))).png().toBuffer(),
    sharp(svgBuffer(logoSvg(160, 50))).png().toBuffer(), sharp(svgBuffer(logoSvg(320, 100))).png().toBuffer(), sharp(svgBuffer(logoSvg(480, 150))).png().toBuffer(),
  ]);
  return { "icon.png": icon, "icon@2x.png": icon2x, "icon@3x.png": icon3x, "logo.png": logo, "logo@2x.png": logo2x, "logo@3x.png": logo3x };
}

async function thumbnailAssets(image) {
  const buffer = await fetchImageBuffer(image);
  if (!buffer?.length) throw new WalletPassError("Your primary photo could not be loaded for Pholio ID.", "WALLET_PHOTO_UNAVAILABLE");
  const [thumbnail, thumbnail2x, thumbnail3x] = await Promise.all([1, 2, 3].map((scale) => buildPortraitThumbnail(buffer, scale)));
  return { "thumbnail.png": thumbnail, "thumbnail@2x.png": thumbnail2x, "thumbnail@3x.png": thumbnail3x };
}

async function buildPortraitThumbnail(buffer, scale) {
  const width = 90 * scale;
  const height = 120 * scale;
  const diameter = 78 * scale;
  const circleMask = svgBuffer(`<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`);
  const portrait = await sharp(buffer)
    .rotate()
    .resize(diameter, diameter, { fit: "cover", position: "attention" })
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: "#0A0A09" },
  })
    .composite([{ input: portrait, left: Math.round((width - diameter) / 2), top: 30 * scale }])
    .png()
    .toBuffer();
}

async function buildWalletPass({ profile, user, image, representations, portfolioUrl, config }) {
  if (!image) throw new WalletPassError("Add a primary photo before creating a Pholio ID.", "WALLET_PHOTO_REQUIRED");
  const props = buildPassProps({ profile, user, representations, passTypeIdentifier: config.passTypeIdentifier, teamIdentifier: config.teamIdentifier, portfolioUrl });
  const pass = new PKPass({ ...(await staticAssets()), ...(await thumbnailAssets(image)), "pass.json": Buffer.from(JSON.stringify(props)) }, config.certificates);
  pass.setBarcodes(props.barcode);
  return pass.getAsBuffer();
}

module.exports = {
  WalletPassError,
  buildPassProps,
  buildWalletPass,
  fullName,
  frontIdentityFields,
  measurementFields,
  staticAssets,
  thumbnailAssets,
  buildPortraitThumbnail,
};
