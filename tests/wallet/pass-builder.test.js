"use strict";

const sharp = require("sharp");
const {
  WalletPassError,
  buildPassProps,
  frontIdentityFields,
  measurementFields,
  staticAssets,
  buildPortraitThumbnail,
} = require("../../src/domains/wallet/services/pass-builder");
const { getWalletPassConfig } = require("../../src/domains/wallet/services/pass-config");

describe("Pholio ID Apple Wallet pass", () => {
  const profile = {
    id: "f02575c6-a76a-4c30-9b91-69b826be0a99",
    slug: "ava-martinez",
    first_name: "Ava",
    last_name: "Martinez",
    height_cm: 178,
    bust: "32\"",
    waist: "25\"",
    hips: "35\"",
    shoe_size: "9",
    hair_color: "Brown",
    eye_color: "Hazel",
  };

  test("maps the talent profile to an editorial generic identity pass", () => {
    const props = buildPassProps({
      profile,
      user: {},
      representations: [{ status: "active", agency_name: "Northstar Models" }],
      passTypeIdentifier: "pass.studio.pholio.talent",
      teamIdentifier: "TEAM12345",
      portfolioUrl: "https://app.pholio.studio/p/ava-martinez",
    });

    expect(props.logoText).toBeUndefined();
    expect(props.generic.headerFields).toBeUndefined();
    expect(props.generic.primaryFields).toEqual([
      { key: "name", label: "PHOLIO ID", value: "Ava Martinez" },
    ]);
    expect(props.generic.secondaryFields).toEqual([
      { key: "height", label: "HEIGHT", value: "5' 10\"" },
      { key: "eyes", label: "EYES", value: "Hazel" },
      { key: "representation", label: "REPRESENTATION", value: "Northstar Models" },
    ]);
    expect(props.generic.auxiliaryFields).toEqual([
      { key: "bust", label: "BUST", value: "32\"" },
      { key: "waist", label: "WAIST", value: "25\"" },
      { key: "hips", label: "HIPS", value: "35\"" },
      { key: "shoe", label: "SHOES", value: "9" },
    ]);
    expect(props.barcode.message).toBe("https://app.pholio.studio/p/ava-martinez");
  });

  test("uses an independent representation value and omits unavailable stats", () => {
    expect(frontIdentityFields({ height_cm: 0 }, [])).toEqual([
      { key: "representation", label: "REPRESENTATION", value: "Independent" },
    ]);
    expect(measurementFields({ waist: "25\"" })).toEqual([
      { key: "waist", label: "WAIST", value: "25\"" },
    ]);
  });

  test("renders the gold wordmark and dark mark at Wallet asset dimensions", async () => {
    const assets = await staticAssets();
    await expect(sharp(assets["icon.png"]).metadata()).resolves.toMatchObject({ width: 29, height: 29 });
    await expect(sharp(assets["logo.png"]).metadata()).resolves.toMatchObject({ width: 160, height: 50 });
  });

  test("frames the primary image as a circular portrait on an ink thumbnail", async () => {
    const source = await sharp({
      create: { width: 200, height: 300, channels: 3, background: "#75C6D2" },
    }).png().toBuffer();
    const thumbnail = await buildPortraitThumbnail(source, 1);

    await expect(sharp(thumbnail).metadata()).resolves.toMatchObject({ width: 90, height: 120 });
    const { data } = await sharp(thumbnail).raw().toBuffer({ resolveWithObject: true });
    expect([...data.slice(0, 4)]).toEqual([10, 10, 9, 255]);
  });

  test("requires a talent name", () => {
    expect(() => buildPassProps({
      profile: { id: profile.id, slug: profile.slug },
      user: {},
      representations: [],
      passTypeIdentifier: "pass.studio.pholio.talent",
      teamIdentifier: "TEAM12345",
      portfolioUrl: "https://app.pholio.studio/p/ava-martinez",
    })).toThrow(WalletPassError);
  });

  test("reports missing Apple signing configuration without exposing secrets", () => {
    const keys = [
      "APPLE_WALLET_PASS_TYPE_IDENTIFIER",
      "APPLE_WALLET_TEAM_IDENTIFIER",
      "APPLE_WALLET_SIGNER_CERT_PEM",
      "APPLE_WALLET_SIGNER_KEY_PEM",
      "APPLE_WALLET_WWDR_PEM",
    ];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    keys.forEach((key) => delete process.env[key]);

    expect(getWalletPassConfig()).toEqual(expect.objectContaining({
      configured: false,
      missing: expect.arrayContaining(["APPLE_WALLET_PASS_TYPE_IDENTIFIER"]),
    }));

    Object.entries(saved).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
});
