"use strict";

/**
 * Pholio ID — pass bundle (.pkpass) assembly.
 *
 * A .pkpass is a stored (uncompressed) zip of the pass files plus:
 *   manifest.json — SHA-1 of every other file, keyed by file name
 *   signature     — detached PKCS#7 over manifest.json, signed with the Pass
 *                   Type ID certificate, carrying Apple's WWDR intermediate
 *
 * Owned in-repo rather than through passkit-generator because that library
 * validates pass.json with `stripUnknown: true` and knows no `posterGeneric`
 * style, so it silently deletes the iOS 27 face. The signing recipe below is
 * the one Wallet has accepted from that library for years (SHA-1 digest,
 * PKCS#9 content-type + message-digest + signing-time attributes, WWDR and
 * signer certificates embedded, detached).
 */

const forge = require("node-forge");
const { toBuffer } = require("do-not-zip");

const RESERVED = new Set(["manifest.json", "signature"]);

function sha1Hex(buffer) {
  const md = forge.md.sha1.create();
  md.update(buffer.toString("binary"));
  return md.digest().toHex();
}

/**
 * @param {Record<string, Buffer>} files — top-level pass files (pass.json + images)
 * @returns {Buffer} manifest.json bytes
 */
function buildManifest(files) {
  const manifest = {};
  for (const [name, buffer] of Object.entries(files)) {
    if (RESERVED.has(name)) throw new Error(`Reserved pass file name: ${name}`);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error(`Empty pass file: ${name}`);
    manifest[name] = sha1Hex(buffer);
  }
  return Buffer.from(JSON.stringify(manifest));
}

function parseCertificates({ signerCert, signerKey, wwdr, signerKeyPassphrase }) {
  const key = forge.pki.decryptRsaPrivateKey(String(signerKey), signerKeyPassphrase);
  if (!key) throw new Error("Pass signer key could not be read");
  return {
    signerCert: forge.pki.certificateFromPem(String(signerCert)),
    wwdr: forge.pki.certificateFromPem(String(wwdr)),
    signerKey: key,
  };
}

/**
 * Detached PKCS#7 signature over the manifest.
 * @param {Buffer} manifest
 * @param {{ signerCert: string, signerKey: string, wwdr: string, signerKeyPassphrase?: string }} certificates
 * @returns {Buffer} DER bytes
 */
function signManifest(manifest, certificates) {
  const certs = parseCertificates(certificates);
  const signed = forge.pkcs7.createSignedData();
  signed.content = new forge.util.ByteStringBuffer(manifest);
  signed.addCertificate(certs.wwdr);
  signed.addCertificate(certs.signerCert);
  signed.addSigner({
    key: certs.signerKey,
    certificate: certs.signerCert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  signed.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(signed.toAsn1()).getBytes(), "binary");
}

/**
 * Store files, manifest and signature into a .pkpass buffer.
 * @param {Record<string, Buffer>} files
 * @param {object} certificates — see signManifest
 * @returns {Buffer}
 */
function packPass(files, certificates) {
  const manifest = buildManifest(files);
  const signature = signManifest(manifest, certificates);
  const entries = [
    ...Object.entries(files).map(([path, data]) => ({ path, data })),
    { path: "manifest.json", data: manifest },
    { path: "signature", data: signature },
  ];
  return toBuffer(entries);
}

/**
 * Read a stored zip back into { name: Buffer } (local file headers only; the
 * bundles this module writes are uncompressed). Used by tests and the
 * preview rig, never by Wallet.
 * @param {Buffer} zip
 * @returns {Record<string, Buffer>}
 */
function readPass(zip) {
  const files = {};
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    if (method !== 0) throw new Error(`Unexpected compression on ${name}`);
    files[name] = zip.subarray(start, start + compressedSize);
    offset = start + compressedSize;
  }
  return files;
}

module.exports = { sha1Hex, buildManifest, signManifest, packPass, readPass };
