"use strict";

const path = require("path");
const sharp = require("sharp");
const { selectHeroImage, buildPassFiles, buildWalletPass, WalletPassError } = require("../../src/domains/wallet/services/pass-builder");
const { readPass } = require("../../src/domains/wallet/services/pass-bundle");

const FIXTURE_IMAGE = path.resolve(__dirname, "../fixtures/test-image.jpg");
const IDS = { passTypeIdentifier: "pass.studio.pholio.talent", teamIdentifier: "TEAM12345" };
const profile = {
  id: "f02575c6-a76a-4c30-9b91-69b826be0a99",
  slug: "ava-martinez",
  first_name: "Ava",
  last_name: "Martinez",
  gender: "Female",
  height_cm: 178,
  bust_cm: 81,
  waist_cm: 61,
  hips_cm: 89,
};

const row = (overrides) => ({ id: "a", absolute_path: FIXTURE_IMAGE, status: "active", sort: 0, ...overrides });

describe("Pholio ID builder", () => {
  test("honours the talent's eligible primary image, else the hero ranking, never archived or rights-denied frames", () => {
    const images = [
      row({ id: "archived", is_primary: true, status: "archived", sort: 0 }),
      row({ id: "denied", sort: 1, usage_rights: "denied" }),
      row({ id: "book", sort: 2 }),
      row({ id: "video", asset_kind: "video", sort: 3 }),
    ];
    expect(selectHeroImage(images).id).toBe("book");
    expect(selectHeroImage([row({ id: "first", sort: 0 }), row({ id: "chosen", is_primary: true, sort: 5 })]).id).toBe("chosen");
    expect(selectHeroImage([])).toBeNull();
  });

  test("a minor's pass never uses a full-length frame", () => {
    const images = [row({ id: "full", is_primary: true, shot_type: "full_length" }), row({ id: "head", shot_type: "headshot", sort: 1 })];
    expect(selectHeroImage(images, { minor: true }).id).toBe("head");
    expect(selectHeroImage(images, { minor: false }).id).toBe("full");
    expect(selectHeroImage([row({ id: "full", shot_type: "full_body" })], { minor: true })).toBeNull();
  });

  test("builds pass.json plus the full image set from a real photo", async () => {
    const result = await buildPassFiles({ profile, user: {}, images: [row({ id: "a", is_primary: true })], representations: [], portfolioUrl: "https://app.pholio.studio/p/ava-martinez", theme: "paper", ...IDS });
    expect(Object.keys(result.files).sort()).toEqual([
      "artwork@2x.png", "artwork@3x.png", "icon@2x.png", "icon@3x.png", "logo@2x.png", "logo@3x.png", "pass.json",
      "primaryLogo@2x.png", "primaryLogo@3x.png", "thumbnail@2x.png", "thumbnail@3x.png",
    ]);
    const pass = JSON.parse(result.files["pass.json"].toString());
    expect(pass.posterGeneric.primaryFields[0].value).toBe("Ava Martinez");
    expect(pass.backgroundColor).toBe("rgb(250, 248, 245)");
    expect(result.hero.id).toBe("a");
    expect(result.subject.focal.x).toBeGreaterThanOrEqual(0);
    expect(result.subject.focal.y).toBeLessThanOrEqual(1);
    expect(["detector", "matte-cached", "matte-studio", "matte-alpha", "attention", "attention+prior", "prior"]).toContain(result.subject.source);
    await expect(sharp(result.files["thumbnail@2x.png"]).metadata()).resolves.toMatchObject({ width: 180, height: 180 });
  });

  test("explains a missing or unreadable photo as a Pholio ID error", async () => {
    const base = { profile, user: {}, representations: [], portfolioUrl: "https://app.pholio.studio/p/ava-martinez", ...IDS };
    await expect(buildPassFiles({ ...base, images: [] })).rejects.toMatchObject({ code: "WALLET_PHOTO_REQUIRED" });
    await expect(buildPassFiles({ ...base, images: [row({ id: "gone", absolute_path: "/nope/missing.jpg", path: "/nope/missing.jpg" })] })).rejects.toMatchObject({ code: "WALLET_PHOTO_UNAVAILABLE" });
    await expect(buildPassFiles({ ...base, images: [row({ id: "gone", absolute_path: "/nope/missing.jpg", path: "/nope/missing.jpg" })] })).rejects.toBeInstanceOf(WalletPassError);
  });

  test("signs a complete .pkpass when certificates are present", async () => {
    // eslint-disable-next-line global-require
    const forge = require("node-forge");
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    cert.setSubject([{ name: "commonName", value: "test" }]);
    cert.setIssuer([{ name: "commonName", value: "test" }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const pem = forge.pki.certificateToPem(cert);
    const config = { ...IDS, certificates: { signerCert: pem, signerKey: forge.pki.privateKeyToPem(keys.privateKey), wwdr: pem } };

    const buffer = await buildWalletPass({ profile, user: {}, images: [row({ id: "a" })], representations: [], portfolioUrl: "https://app.pholio.studio/p/ava-martinez", config });
    const entries = readPass(buffer);
    expect(entries["manifest.json"]).toBeDefined();
    expect(entries.signature).toBeDefined();
    expect(JSON.parse(entries["pass.json"].toString()).serialNumber).toBe(profile.id);
    expect(Object.keys(JSON.parse(entries["manifest.json"].toString()))).toHaveLength(11);
  });
});
