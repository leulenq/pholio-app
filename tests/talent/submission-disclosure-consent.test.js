"use strict";

const {
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  buildSubmissionDisclosureSnapshot,
} = require("../../src/shared/lib/submission-disclosure-content");
const {
  buildSubmissionPackageFingerprint,
} = require("../../src/domains/talent/services/submission-disclosure-consent");

describe("submission disclosure consent", () => {
  test("buildSubmissionDisclosureSnapshot versions adult and minor paths", () => {
    const adult = buildSubmissionDisclosureSnapshot({
      agencyName: "Lumen",
      isMinor: false,
    });
    expect(adult.consentMethod).toBe("talent_checkbox");
    expect(adult.handling).toContain("Lumen");
    expect(adult.handling).not.toContain("never shared");
    expect(adult.dataCategories).toContain("contact details");
    expect(adult.retentionAndWithdrawal).toContain("24 months");
    expect(adult.retentionAndWithdrawal).toContain("cannot recall");
    expect(adult.acknowledgements).toEqual(
      expect.arrayContaining([
        "You are 18 or older and authorised to submit your own work.",
      ]),
    );

    const minor = buildSubmissionDisclosureSnapshot({
      agencyName: "Lumen",
      isMinor: true,
      accountGuardianConsent: true,
      minorAgencyAuthorized: true,
    });
    expect(minor.consentMethod).toBe("minor_guardian_authorization");
    expect(minor.acknowledgements).toEqual(
      expect.arrayContaining([
        "A parent or guardian authorized this submission to Lumen.",
      ]),
    );
  });

  test("buildSubmissionPackageFingerprint is stable for equivalent package refs", () => {
    const left = buildSubmissionPackageFingerprint({
      agencyId: "agency-1",
      boards: ["editorial", "commercial"],
      mediaSetId: "set-1",
      digitalSlotPicks: { headshot: "img-1", full_length: "img-2" },
      compCardPresetId: "preset-1",
      imageIds: ["img-2", "img-1"],
    });
    const right = buildSubmissionPackageFingerprint({
      agencyId: "agency-1",
      boards: ["commercial", "editorial"],
      mediaSetId: "set-1",
      digitalSlotPicks: { headshot: "img-1", full_length: "img-2" },
      compCardPresetId: "preset-1",
      imageIds: ["img-1", "img-2"],
    });
    expect(left).toBe(right);
    expect(left).toHaveLength(64);
  });

  test.each([
    ["note", { note: "A changed note." }],
    ["board", { boards: ["editorial", "new-faces"] }],
    ["image", { imageIds: ["img-1", "img-3"] }],
  ])("fingerprint changes when the submitted %s changes", (_field, patch) => {
    const base = {
      agencyId: "agency-1",
      boards: ["editorial"],
      mediaSetId: "set-1",
      digitalSlotPicks: { headshot: "img-1", full_length: "img-2" },
      compCardPresetId: "preset-1",
      imageIds: ["img-1", "img-2"],
      note: "Original note.",
    };

    expect(
      buildSubmissionPackageFingerprint(base),
    ).not.toBe(
      buildSubmissionPackageFingerprint({ ...base, ...patch }),
    );
  });

  test("fingerprint trims note whitespace before binding", () => {
    const base = {
      agencyId: "agency-1",
      boards: ["editorial"],
      imageIds: ["img-1"],
    };
    expect(
      buildSubmissionPackageFingerprint({ ...base, note: "  Hello agency  " }),
    ).toBe(
      buildSubmissionPackageFingerprint({ ...base, note: "Hello agency" }),
    );
  });

  test("disclosure versions are pinned", () => {
    expect(CURRENT_SUBMISSION_DISCLOSURE_VERSION).toBeTruthy();
    expect(CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION).toBeTruthy();
  });
});
