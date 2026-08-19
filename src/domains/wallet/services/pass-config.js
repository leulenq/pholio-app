"use strict";

const REQUIRED_ENV_KEYS = [
  "APPLE_WALLET_PASS_TYPE_IDENTIFIER",
  "APPLE_WALLET_TEAM_IDENTIFIER",
  "APPLE_WALLET_SIGNER_CERT_PEM",
  "APPLE_WALLET_SIGNER_KEY_PEM",
  "APPLE_WALLET_WWDR_PEM",
];

function readPem(name) {
  const value = process.env[name];
  return value ? value.replace(/\\n/g, "\n").trim() : null;
}

function getWalletPassConfig() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  for (const key of [
    "APPLE_WALLET_SIGNER_CERT_PEM",
    "APPLE_WALLET_SIGNER_KEY_PEM",
    "APPLE_WALLET_WWDR_PEM",
  ]) {
    if (!missing.includes(key) && !readPem(key)?.startsWith("-----BEGIN")) {
      missing.push(key);
    }
  }
  if (missing.length) return { configured: false, missing };
  return {
    configured: true,
    passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER.trim(),
    teamIdentifier: process.env.APPLE_WALLET_TEAM_IDENTIFIER.trim(),
    certificates: {
      signerCert: readPem("APPLE_WALLET_SIGNER_CERT_PEM"),
      signerKey: readPem("APPLE_WALLET_SIGNER_KEY_PEM"),
      wwdr: readPem("APPLE_WALLET_WWDR_PEM"),
      signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE || undefined,
    },
  };
}

module.exports = { REQUIRED_ENV_KEYS, getWalletPassConfig };
