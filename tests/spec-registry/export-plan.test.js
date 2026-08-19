"use strict";

const {
  planExport,
  readConstraints,
  targetMimeType,
  upperBound,
} = require("../../src/domains/spec-registry/export/export-plan");

function fileRule(field, value, { operator = "lte", scope = "per_file" } = {}) {
  return { id: `${field}-${scope}`, scope, constraint: { field, operator, value } };
}

function shotsFinding(slotId, label, imageIds) {
  return {
    categoryKey: "shots",
    assertionId: slotId,
    sourceLabel: label,
    assignments: imageIds.map((imageId, index) => ({ instance: index + 1, imageId })),
  };
}

const ELITE_SCOPE = { organization: { id: "elite-model-management", name: "Elite Model Management" } };

describe("spec-correct export — plan", () => {
  describe("published constraints", () => {
    test("reads Elite's real shape: 3 files, 5MB each", () => {
      const constraints = readConstraints({
        rules: {
          files: [
            fileRule("file.count", 3, { scope: "whole_package" }),
            fileRule("file.size_bytes", 5_000_000),
          ],
        },
      });
      expect(constraints).toEqual({
        perFileMaxBytes: 5_000_000,
        totalSetMaxBytes: null,
        maxFileCount: 3,
        allowedMimeTypes: null,
        publishedMimeTypes: null,
      });
    });

    test("takes the tightest bound when a spec publishes two of a kind", () => {
      const constraints = readConstraints({
        rules: {
          files: [
            fileRule("file.size_bytes", 5_000_000),
            fileRule("file.size_bytes", 3_000_000),
          ],
        },
      });
      expect(constraints.perFileMaxBytes).toBe(3_000_000);
    });

    test("separates a total-set ceiling from a per-file one", () => {
      const constraints = readConstraints({
        rules: {
          files: [
            fileRule("file.size_bytes", 5_000_000, { scope: "per_file" }),
            fileRule("file.size_bytes", 8_000_000, { scope: "total_set" }),
          ],
        },
      });
      expect(constraints.perFileMaxBytes).toBe(5_000_000);
      expect(constraints.totalSetMaxBytes).toBe(8_000_000);
    });

    test("keeps only formats Sharp can actually produce", () => {
      const constraints = readConstraints({
        rules: {
          files: [
            fileRule("file.mime_type", ["image/heic", "image/jpeg", "image/png"], {
              operator: "in",
            }),
          ],
        },
      });
      // HEIC is in IMG's published list but is not an encoder Sharp offers, so
      // promising it would produce a file the agency asked for and Pholio
      // cannot write.
      expect(constraints.allowedMimeTypes).toEqual(["image/jpeg", "image/png"]);
      // The published list is kept intact alongside it, because "would this
      // agency have taken the talent's original file?" is a different question
      // from "what can Pholio write?", and the transcode decision asks the first.
      expect(constraints.publishedMimeTypes).toEqual([
        "image/heic",
        "image/jpeg",
        "image/png",
      ]);
    });

    test("ignores a spec that publishes no file rules at all", () => {
      expect(readConstraints({ rules: {} })).toEqual({
        perFileMaxBytes: null,
        totalSetMaxBytes: null,
        maxFileCount: null,
        allowedMimeTypes: null,
        publishedMimeTypes: null,
      });
    });
  });

  describe("constraint bounds", () => {
    test.each([
      [{ operator: "lte", value: 10 }, 10],
      [{ operator: "lt", value: 10 }, 9],
      [{ operator: "equals", value: 4 }, 4],
      [{ operator: "between", value: [2, 6] }, 6],
      [{ operator: "gte", value: 3 }, null],
      [{ operator: "exists", value: null }, null],
    ])("%j reads as %s", (constraint, expected) => {
      expect(upperBound(constraint)).toBe(expected);
    });
  });

  describe("target format", () => {
    test("prefers JPEG when the agency allows it", () => {
      expect(targetMimeType({ allowedMimeTypes: ["image/png", "image/jpeg"] })).toBe("image/jpeg");
    });

    test("falls back to JPEG when nothing is published", () => {
      expect(targetMimeType({ allowedMimeTypes: null })).toBe("image/jpeg");
    });

    test("honours the agency's list when it excludes JPEG", () => {
      expect(targetMimeType({ allowedMimeTypes: ["image/png"] })).toBe("image/png");
    });
  });

  describe("entries", () => {
    const evaluation = {
      findings: [
        shotsFinding("full-length", "full-length", ["image-a"]),
        shotsFinding("close-up", "close-up", ["image-b"]),
        shotsFinding("profile", "profile", ["image-c"]),
        // Non-shot findings share the list and must not become files.
        { categoryKey: "eligibility", assertionId: "height", sourceLabel: "height", assignments: [] },
      ],
    };

    test("names files after the published slot they satisfy", () => {
      const plan = planExport({
        spec: { scope: ELITE_SCOPE, rules: { files: [fileRule("file.size_bytes", 5_000_000)] } },
        evaluation,
      });
      expect(plan.entries.map((entry) => entry.name)).toEqual([
        "elite-model-management-full-length.jpg",
        "elite-model-management-close-up.jpg",
        "elite-model-management-profile.jpg",
      ]);
      expect(plan.archiveName).toBe("elite-model-management-digitals.zip");
    });

    test("includes only images the matcher placed in a slot", () => {
      const plan = planExport({
        spec: { scope: ELITE_SCOPE, rules: {} },
        evaluation: {
          findings: [
            shotsFinding("full-length", "full-length", ["image-a"]),
            shotsFinding("close-up", "close-up", []),
          ],
        },
      });
      expect(plan.entries.map((entry) => entry.imageId)).toEqual(["image-a"]);
    });

    test("ships an image once when it satisfies two slots", () => {
      const plan = planExport({
        spec: { scope: ELITE_SCOPE, rules: {} },
        evaluation: {
          findings: [
            shotsFinding("close-up", "close-up", ["image-a"]),
            shotsFinding("headshot", "headshot", ["image-a"]),
          ],
        },
      });
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0].name).toBe("elite-model-management-close-up.jpg");
    });

    test("numbers the files when one slot takes several images", () => {
      const plan = planExport({
        spec: { scope: ELITE_SCOPE, rules: {} },
        evaluation: { findings: [shotsFinding("polaroid", "polaroid", ["a", "b"])] },
      });
      expect(plan.entries.map((entry) => entry.name)).toEqual([
        "elite-model-management-polaroid-1.jpg",
        "elite-model-management-polaroid-2.jpg",
      ]);
    });

    test("reports what the published count limit pushed out rather than dropping it quietly", () => {
      const plan = planExport({
        spec: {
          scope: ELITE_SCOPE,
          rules: { files: [fileRule("file.count", 2, { scope: "whole_package" })] },
        },
        evaluation,
      });
      expect(plan.entries).toHaveLength(2);
      expect(plan.omittedForCount.map((entry) => entry.slotLabel)).toEqual(["profile"]);
    });

    test("divides a total-set ceiling across the files it actually ships", () => {
      const plan = planExport({
        spec: {
          scope: ELITE_SCOPE,
          rules: { files: [fileRule("file.size_bytes", 9_000_000, { scope: "total_set" })] },
        },
        evaluation,
      });
      expect(plan.entries).toHaveLength(3);
      expect(plan.perFileBudgetBytes).toBe(3_000_000);
    });

    test("uses the per-file limit when it binds before the shared one", () => {
      const plan = planExport({
        spec: {
          scope: ELITE_SCOPE,
          rules: {
            files: [
              fileRule("file.size_bytes", 1_000_000, { scope: "per_file" }),
              fileRule("file.size_bytes", 9_000_000, { scope: "total_set" }),
            ],
          },
        },
        evaluation,
      });
      expect(plan.perFileBudgetBytes).toBe(1_000_000);
    });

    test("leaves the budget open when the agency published no size limit", () => {
      const plan = planExport({ spec: { scope: ELITE_SCOPE, rules: {} }, evaluation });
      expect(plan.perFileBudgetBytes).toBeNull();
    });

    test("carries the agency's format through to the extension", () => {
      const plan = planExport({
        spec: {
          scope: ELITE_SCOPE,
          rules: {
            files: [fileRule("file.mime_type", ["image/png"], { operator: "in" })],
          },
        },
        evaluation,
      });
      expect(plan.mimeType).toBe("image/png");
      expect(plan.entries.map((entry) => entry.name)).toEqual([
        "elite-model-management-full-length.png",
        "elite-model-management-close-up.png",
        "elite-model-management-profile.png",
      ]);
    });

    test("plans no crop, because the schema publishes no crop target", () => {
      const plan = planExport({ spec: { scope: ELITE_SCOPE, rules: {} }, evaluation });
      // Guarding the decision, not the absence of a key: if a crop is ever
      // added it must come with a registry rule that justifies it.
      expect(plan).not.toHaveProperty("crop");
      expect(plan.entries.every((entry) => !("crop" in entry))).toBe(true);
    });
  });
});

/**
 * The matrix depends on `matchValue` reaching the client. Agencies publish the
 * same shot under different words — Elite's "close-up" and Elite Models'
 * "Close up (hair pulled back)" are one `shot.frame: close_up` — so the label
 * cannot align one agency's list against another's and the taxonomy value must.
 */
describe("spec-correct export — findings carry the canonical shot value", () => {
  const { findingDto } = require("../../src/domains/spec-registry/preflight-service");

  test("a shot slot exposes the taxonomy value it matches on", () => {
    const dto = findingDto(
      "shots",
      {
        id: "close-up",
        sourceLabel: "close-up",
        field: "shot.frame",
        matchValue: "close_up",
        outcome: "missing",
        modality: "requested",
      },
      "https://example.test",
    );
    expect(dto).toMatchObject({ field: "shot.frame", matchValue: "close_up" });
  });

  test("a requirement with no taxonomy value reports none rather than guessing", () => {
    const dto = findingDto(
      "files",
      { id: "max-size", sourceLabel: "Max 5mb", field: "file.size_bytes", outcome: "satisfied" },
      "https://example.test",
    );
    expect(dto.matchValue).toBeNull();
  });
});
