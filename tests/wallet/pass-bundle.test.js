"use strict";

const forge = require("node-forge");
const { sha1Hex, buildManifest, signManifest, packPass, readPass } = require("../../src/domains/wallet/services/pass-bundle");

function selfSigned(commonName) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: "commonName", value: commonName }]);
  cert.setIssuer([{ name: "commonName", value: commonName }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey), forgeCert: cert };
}

describe("Pholio ID bundle", () => {
  const signer = selfSigned("Pass Type ID: pass.studio.pholio.talent");
  const wwdr = selfSigned("Apple Worldwide Developer Relations (test)");
  const certificates = { signerCert: signer.cert, signerKey: signer.key, wwdr: wwdr.cert };
  const files = {
    "pass.json": Buffer.from(JSON.stringify({ formatVersion: 1, posterGeneric: {}, generic: {} })),
    "icon@2x.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
  };

  test("manifest lists a SHA-1 for every file and rejects reserved or empty entries", () => {
    const manifest = JSON.parse(buildManifest(files).toString());
    expect(manifest).toEqual({ "pass.json": sha1Hex(files["pass.json"]), "icon@2x.png": sha1Hex(files["icon@2x.png"]) });
    expect(sha1Hex(Buffer.from("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(() => buildManifest({ ...files, signature: Buffer.from("x") })).toThrow(/Reserved/);
    expect(() => buildManifest({ ...files, "empty.png": Buffer.alloc(0) })).toThrow(/Empty/);
  });

  test("signature is a detached PKCS#7 over the manifest carrying both certificates, and verifies", () => {
    const manifest = buildManifest(files);
    const der = signManifest(manifest, certificates);
    const asn1 = forge.asn1.fromDer(der.toString("binary"));
    const message = forge.pkcs7.messageFromAsn1(asn1);
    expect(message.certificates).toHaveLength(2);
    expect(message.certificates.map((c) => c.subject.getField("CN").value).sort()).toEqual([
      "Apple Worldwide Developer Relations (test)",
      "Pass Type ID: pass.studio.pholio.talent",
    ]);
    // Detached: no content embedded.
    expect(message.rawCapture.content).toBeUndefined();
    // Authenticated attributes: content-type, message-digest (of the manifest), signing-time.
    const signerInfo = message.rawCapture.authenticatedAttributes;
    expect(signerInfo).toHaveLength(3);
    const digestAttr = signerInfo.find((attr) => forge.asn1.derToOid(attr.value[0].value) === forge.pki.oids.messageDigest);
    const digest = forge.md.sha1.create();
    digest.update(manifest.toString("binary"));
    expect(forge.util.bytesToHex(digestAttr.value[1].value[0].value)).toBe(digest.digest().toHex());
    // The RSA signature over the authenticated attributes checks out with the signer's public key.
    const attrsAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, signerInfo);
    const attrDigest = forge.md.sha1.create();
    attrDigest.update(forge.asn1.toDer(attrsAsn1).getBytes());
    expect(signer.forgeCert.publicKey.verify(attrDigest.digest().getBytes(), message.rawCapture.signature)).toBe(true);
  });

  test("packs a stored zip whose entries round-trip byte for byte", () => {
    const pkpass = packPass(files, certificates);
    expect(pkpass.readUInt32LE(0)).toBe(0x04034b50);
    const back = readPass(pkpass);
    expect(Object.keys(back)).toEqual(["pass.json", "icon@2x.png", "manifest.json", "signature"]);
    expect(back["pass.json"].equals(files["pass.json"])).toBe(true);
    expect(JSON.parse(back["manifest.json"].toString())["icon@2x.png"]).toBe(sha1Hex(files["icon@2x.png"]));
    expect(back.signature.length).toBeGreaterThan(200);
  });

  test("refuses to sign with an unreadable key", () => {
    expect(() => signManifest(buildManifest(files), { ...certificates, signerKey: "not a key" })).toThrow();
  });
});
