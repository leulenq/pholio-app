"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { resolveTalentDivision } = require("../../src/shared/constants/profile-division");

describe("profile-division", () => {
  test("resolveTalentDivision defaults to fashion_editorial", () => {
    expect(resolveTalentDivision({})).toBe("fashion_editorial");
    expect(resolveTalentDivision(null)).toBe("fashion_editorial");
  });

  test("resolveTalentDivision picks commercial from specialties", () => {
    expect(
      resolveTalentDivision({
        specialties: ["Runway", "Commercial"],
      }),
    ).toBe("commercial_lifestyle");
  });

  test("buildReadinessLists prioritizes commercial improve keys first", () => {
    const entry = path.resolve(
      __dirname,
      "../../client/src/domains/talent/components/profileReadinessItems.js",
    );
    const outfile = path.join(os.tmpdir(), `profile-readiness-items.${Date.now()}.cjs`);

    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node20",
      outfile,
      logLevel: "silent",
    });

    const {
      buildReadinessLists,
      REQUIRED_READINESS_ITEMS,
      IMPROVE_READINESS_ITEMS,
    } = require(outfile);
    fs.unlinkSync(outfile);

    const fieldCompletion = {};
    for (const item of REQUIRED_READINESS_ITEMS) fieldCompletion[item.key] = true;
    for (const item of IMPROVE_READINESS_ITEMS) fieldCompletion[item.key] = true;

    fieldCompletion.photo_smile = false;
    fieldCompletion.photo_lifestyle = false;
    fieldCompletion.social = false;
    fieldCompletion.bio = false;

    const { missingImprove, topGaps } = buildReadinessLists(
      fieldCompletion,
      { specialties: ["Commercial"] },
      [],
    );

    expect(missingImprove.slice(0, 3).map((item) => item.key)).toEqual([
      "photo_smile",
      "photo_lifestyle",
      "social",
    ]);
    expect(topGaps.map((item) => item.key)).toEqual([
      "photo_smile",
      "photo_lifestyle",
      "social",
    ]);
  });
});
