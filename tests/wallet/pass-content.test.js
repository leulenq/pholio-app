"use strict";

const {
  WalletPassError,
  THEMES,
  NAME_MAX,
  displayName,
  resolveRepresentation,
  buildPassContent,
} = require("../../src/domains/wallet/services/pass-content");

const NOW = new Date("2026-09-03T12:00:00Z");
const IDS = { passTypeIdentifier: "pass.studio.pholio.talent", teamIdentifier: "TEAM12345" };
const URL = "https://app.pholio.studio/p/ava-martinez";

const ava = {
  id: "f02575c6-a76a-4c30-9b91-69b826be0a99",
  slug: "ava-martinez",
  first_name: "Ava",
  last_name: "Martinez",
  gender: "Female",
  height_cm: 178,
  bust_cm: 81,
  waist_cm: 61,
  hips_cm: 89,
  dress_size: "4",
  shoe_size: "9",
  hair_color: "dark brown",
  eye_color: "hazel",
  measurements_updated_at: "2026-06-12T10:00:00Z",
};

function build(overrides = {}) {
  return buildPassContent({ profile: ava, user: {}, representations: [], portfolioUrl: URL, now: NOW, ...IDS, ...overrides });
}

describe("Pholio ID content model", () => {
  test("emits both Wallet faces from one set of facts", () => {
    const { pass, view } = build({ representations: [{ status: "active", agency_name: "Northstar Models", relationship_type: "mother", market: "New York" }] });

    expect(pass).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: "pass.studio.pholio.talent",
      teamIdentifier: "TEAM12345",
      serialNumber: ava.id,
      organizationName: "Pholio",
      description: "Pholio ID for Ava Martinez",
      sharingProhibited: false,
    });
    expect(pass.logoText).toBeUndefined();
    expect(pass.barcodes).toEqual([
      { format: "PKBarcodeFormatQR", message: URL, messageEncoding: "iso-8859-1", altText: "app.pholio.studio/p/ava-martinez" },
    ]);

    // iOS 27 face: header, unlabeled title, one footer, no secondary/auxiliary.
    expect(pass.posterGeneric.headerFields).toEqual([{ key: "height", label: "HEIGHT", value: "178 cm / 5'10\"" }]);
    expect(pass.posterGeneric.primaryFields).toEqual([{ key: "name", value: "Ava Martinez" }]);
    expect(pass.posterGeneric.footerFields).toEqual([{ key: "representation", label: "REPRESENTATION", value: "Northstar Models" }]);
    expect(pass.posterGeneric.secondaryFields).toBeUndefined();

    // iOS 26 face: same header/primary, representation on the wide row, three
    // core stats on the auxiliary row (four front fields, Apple's limit).
    expect(pass.generic.headerFields).toEqual(pass.posterGeneric.headerFields);
    expect(pass.generic.primaryFields).toEqual([{ key: "name", value: "Ava Martinez" }]);
    expect(pass.generic.secondaryFields).toEqual(pass.posterGeneric.footerFields);
    expect(pass.generic.auxiliaryFields).toEqual([
      { key: "bust", label: "BUST", value: "81 cm / 32\"" },
      { key: "waist", label: "WAIST", value: "61 cm / 24\"" },
      { key: "hips", label: "HIPS", value: "89 cm / 35\"" },
    ]);
    expect(pass.generic.secondaryFields.length + pass.generic.auxiliaryFields.length).toBeLessThanOrEqual(4);
    expect(pass.generic.backFields).toEqual(pass.posterGeneric.backFields);
    expect(view.category).toBe("women");
  });

  test("details sheet carries the full comp-card stats block in dual units, then representation, dates, support", () => {
    const { pass } = build({ representations: [
      { status: "active", agency_name: "Northstar Models", relationship_type: "mother", market: "New York", is_exclusive: true },
      { status: "active", external_agency_name: "Maison Étoile", relationship_type: "placement", market: "Paris", division: "Women" },
      { status: "ended", agency_name: "Old Agency", relationship_type: "placement", market: "Milan" },
    ] });
    const keys = pass.generic.backFields.map((f) => f.key);
    expect(keys).toEqual([
      "portfolio", "stat-height", "stat-bust", "stat-waist", "stat-hips", "stat-dress", "stat-shoes", "stat-hair", "stat-eyes",
      "representation-0", "representation-1", "measurements-updated", "issued", "about", "support",
    ]);
    const byKey = Object.fromEntries(pass.generic.backFields.map((f) => [f.key, f]));
    expect(byKey.portfolio.attributedValue).toBe(`<a href="${URL}">app.pholio.studio/p/ava-martinez</a>`);
    expect(byKey["stat-shoes"].value).toBe("US 9 / EU 40");
    expect(byKey["stat-dress"].value).toBe("US 4 / EU 36");
    expect(byKey["representation-0"]).toEqual({ key: "representation-0", label: "MOTHER AGENCY", value: "Northstar Models · New York · Exclusive" });
    expect(byKey["representation-1"]).toEqual({ key: "representation-1", label: "PLACEMENT", value: "Maison Étoile · Paris · Women" });
    expect(byKey["measurements-updated"]).toMatchObject({ value: "2026-06-12T10:00:00.000Z", dateStyle: "PKDateStyleMedium" });
    expect(byKey.issued.value).toBe(NOW.toISOString());
    expect(byKey.about.value).not.toMatch(/updates automatically/i);
    expect(byKey.support.value).toContain("support@pholio.studio");
    // Front fields never carry data detectors; back link fields do.
    pass.generic.auxiliaryFields.forEach((f) => expect(f.dataDetectorTypes).toBeUndefined());
  });

  test("themes map to Wallet's three colors and the poster footer strip", () => {
    const ink = build().pass;
    expect(ink).toMatchObject({ backgroundColor: "rgb(26, 24, 21)", foregroundColor: "rgb(250, 248, 245)", labelColor: "rgb(201, 165, 90)", footerBackgroundColor: "rgb(26, 24, 21)" });
    const paper = build({ theme: "paper" }).pass;
    expect(paper).toMatchObject({ backgroundColor: "rgb(250, 248, 245)", foregroundColor: "rgb(26, 24, 21)", labelColor: "rgb(138, 106, 64)", footerBackgroundColor: "rgb(250, 248, 245)" });
    expect(build({ theme: "neon" }).view.theme).toBe("ink");
    expect(Object.keys(THEMES)).toEqual(["ink", "paper"]);
  });

  test("keeps every face field short enough for Wallet, in a recognisable order", () => {
    expect(displayName({ full: "Ava Martinez", first: "Ava", last: "Martinez" })).toBe("Ava Martinez");
    expect(displayName({ full: "Anastasia-Wilhelmina Oyelaran-Whitfield", first: "Anastasia-Wilhelmina", last: "Oyelaran-Whitfield" })).toBe("Anastasia-Wilhelmina");
    expect(displayName({ full: "Maximilian Featherstonehaugh", first: "Maximilian", last: "Featherstonehaugh" })).toBe("Maximilian F.");
    const cut = displayName({ full: "Anastasia-Wilhelmina-Josephine", first: "Anastasia-Wilhelmina-Josephine", last: null });
    expect(cut.length).toBeLessThanOrEqual(NAME_MAX.poster);
    expect(cut.endsWith("…")).toBe(true);

    // The poster title is full width; the generic primary shares its row with the thumbnail.
    const { pass } = build({ profile: { ...ava, first_name: "Anastasia-Wilhelmina", last_name: "Oyelaran-Whitfield" } });
    expect(pass.posterGeneric.primaryFields[0].value).toBe("Anastasia-Wilhelmina");
    expect(pass.generic.primaryFields[0].value).toBe("Anastasia-Wilhe…");
    expect(build({ profile: { ...ava, first_name: "Maximilian", last_name: "Featherstonehaugh" } }).pass.generic.primaryFields[0].value).toBe("Maximilian F.");
    expect(pass.description).toBe("Pholio ID for Anastasia-Wilhelmina Oyelaran-Whitfield");
  });

  test("cuts a long agency name on the face only", () => {
    const long = "Bright Young Talent Management Group International";
    const { pass } = build({ representations: [{ status: "active", agency_name: long, relationship_type: "mother" }] });
    expect(pass.posterGeneric.footerFields[0].value.length).toBeLessThanOrEqual(30);
    expect(pass.posterGeneric.footerFields[0].value.endsWith("…")).toBe(true);
    expect(pass.generic.backFields.find((f) => f.key === "representation-0").value).toBe(long);
  });

  test("menswear front row is chest, waist, inseam; ungendered falls back to the neutral set", () => {
    const men = build({ profile: { ...ava, first_name: "Kwame", last_name: "Osei", gender: "Male", chest_cm: 97, waist_cm: 79, inseam_cm: 86, bust_cm: null, hips_cm: null, dress_size: null, shoe_size: "44 EU" } });
    expect(men.pass.generic.auxiliaryFields.map((f) => f.label)).toEqual(["CHEST", "WAIST", "INSEAM"]);
    expect(men.pass.generic.backFields.find((f) => f.key === "stat-shoes").value).toBe("US 11 / EU 44");
  });

  test("omits what is missing instead of inventing it", () => {
    const { pass, view } = build({ profile: { id: ava.id, slug: ava.slug, first_name: "Jo", last_name: "Reyes", eye_color: "green" } });
    expect(pass.posterGeneric.headerFields).toEqual([]);
    expect(pass.generic.auxiliaryFields).toEqual([]);
    expect(pass.generic.secondaryFields).toEqual([{ key: "bookings", label: "BOOKINGS", value: "Direct" }]);
    expect(pass.generic.backFields.map((f) => f.key)).toEqual(["portfolio", "stat-eyes", "bookings", "issued", "about", "support"]);
    expect(view.height).toBeNull();
    expect(JSON.stringify(pass)).not.toMatch(/undefined|null|—/);
  });

  test("representation resolves: active mother first, legacy current_agency, seeking, direct", () => {
    expect(resolveRepresentation([
      { status: "active", external_agency_name: "Paris Placement", relationship_type: "placement" },
      { status: "active", agency_name: "Mother Co", relationship_type: "mother" },
    ]).primary.name).toBe("Mother Co");
    expect(resolveRepresentation([], { current_agency: "Select Model Management" })).toMatchObject({ status: "represented", primary: { name: "Select Model Management" } });
    expect(resolveRepresentation([{ status: "ended", agency_name: "Gone" }], { current_agency: "Legacy" }).status).toBe("direct");
    expect(resolveRepresentation([], { seeking_representation: true }).status).toBe("seeking");
    expect(build({ profile: { ...ava, seeking_representation: true } }).pass.posterGeneric.footerFields).toEqual([
      { key: "representation", label: "REPRESENTATION", value: "Seeking representation" },
    ]);
  });

  test("a minor's pass needs guardian consent and never carries body measurements", () => {
    const teen = { ...ava, first_name: "Lily", last_name: "Park", date_of_birth: "2012-03-15" };
    expect(() => build({ profile: teen })).toThrow(WalletPassError);
    expect(() => build({ profile: teen })).toThrow(/guardian consent/);
    try {
      build({ profile: teen });
    } catch (error) {
      expect(error.code).toBe("WALLET_GUARDIAN_CONSENT_REQUIRED");
    }

    const { pass, view } = build({ profile: { ...teen, guardian_consent_at: "2026-05-01T00:00:00Z", dress_size: "12" } });
    expect(view.category).toBe("kids");
    expect(view.minor).toBe(true);
    const text = JSON.stringify(pass);
    expect(text).not.toMatch(/BUST|WAIST|HIPS/);
    expect(pass.generic.auxiliaryFields.map((f) => f.label)).toEqual(["AGE", "CLOTHING SIZE", "SHOES"]);
    expect(pass.generic.backFields.find((f) => f.key === "measurements-updated")).toBeUndefined();
  });

  test("refuses a pass without a name or a profile slug", () => {
    expect(() => build({ profile: { id: ava.id, slug: ava.slug } })).toThrow(/name/);
    expect(() => build({ profile: { ...ava, slug: "" } })).toThrow(/Complete your profile/);
    expect(build({ profile: { ...ava, first_name: null, last_name: null }, user: { first_name: "Ava", last_name: "M" } }).view.name.full).toBe("Ava M");
  });
});
