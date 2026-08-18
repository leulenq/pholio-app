"use strict";

/**
 * The two text deliverables and the transcode decision behind them.
 *
 * Pure units, no database and no Sharp: everything here is a reading of a
 * profile snapshot or of a published spec, so it can be asserted exactly rather
 * than snapshotted. The archive-level wiring is covered in `spec-export.test.js`
 * and the HEIC pipeline in `export-heic.test.js`.
 */

const fs = require("fs");
const path = require("path");

const {
  readConstraints,
  sniffMimeType,
  targetMimeType,
  transcodeDecision,
} = require("../../src/domains/spec-registry/export/export-plan");
const {
  buildStatsBlock,
  instagramHandle,
} = require("../../src/domains/spec-registry/export/stats-block");
const {
  isEmailChannel,
  publishedRecipient,
  renderEmailDraft,
} = require("../../src/domains/spec-registry/export/email-draft");

const HEIC_FIXTURE = path.join(__dirname, "..", "fixtures", "heic", "sample.heic");

/**
 * The register a submission email must not drift into. Every one of these is a
 * phrase that reads as a pitch rather than a fact, and a booker reading a
 * hundred of these a week stops at the first one.
 */
const MARKETING_PHRASES = [
  /I'?d love to/i,
  /I would love/i,
  /so excited/i,
  /excited to/i,
  /thrilled/i,
  /passionate/i,
  /dream/i,
  /amazing/i,
  /perfect fit/i,
  /honou?red/i,
  /opportunity of a lifetime/i,
  /please consider/i,
  /hope to hear/i,
  /look forward to hearing/i,
];

/** A womenswear profile with everything the block can render. */
const FULL_TALENT = {
  firstName: "Mia",
  lastName: "Voss",
  gender: "female",
  city: "New York",
  heightCm: 178,
  bustCm: 86,
  waistCm: 61,
  hipsCm: 89,
  shoeSize: "40",
  dressSize: "4",
  hairColor: "Brown",
  eyeColor: "Green",
  social: { instagram: "miavoss" },
};

const EMAIL_CHANNEL = {
  id: "scouting-email",
  type: "official_email",
  url: "https://www.musenyc.com/contact",
};

function statLine(block, label) {
  return block.lines.find((line) => line.startsWith(`${label} `)) || null;
}

describe("reading the source format from the bytes", () => {
  test("identifies the formats a talent library actually holds", () => {
    const jpeg = fs.readFileSync(path.join(__dirname, "..", "fixtures", "test-image.jpg"));
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
    expect(sniffMimeType(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"))).toBe("image/png");
    expect(sniffMimeType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffMimeType(Buffer.from("49492a000800000001000fe0", "hex"))).toBe("image/tiff");
    expect(sniffMimeType(Buffer.from("4d4d002a000000080001fe0f", "hex"))).toBe("image/tiff");
  });

  test("identifies a real HEIC whose major brand is not `heic`", () => {
    // The case that matters: an iPhone writes `mif1` as the major brand and
    // puts `heic` in the compatible-brands list. Reading only the major brand
    // would classify the single most common phone format as unknown.
    const heic = fs.readFileSync(HEIC_FIXTURE);
    expect(heic.subarray(8, 12).toString("latin1")).toBe("mif1");
    expect(sniffMimeType(heic)).toBe("image/heic");
  });

  test("answers null rather than guessing at bytes it does not recognise", () => {
    expect(sniffMimeType(Buffer.from("this is prose, not an image", "utf8"))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
    expect(sniffMimeType(null)).toBeNull();
  });
});

describe("the transcode decision", () => {
  const jpegOnly = readConstraints({
    rules: {
      files: [
        {
          scope: "per_file",
          constraint: { field: "file.mime_type", operator: "in", value: ["image/jpeg", "image/png"] },
        },
      ],
    },
  });
  const noRule = readConstraints({ rules: { files: [] } });

  test("a HEIC into a route that publishes JPEG and PNG is a format the spec rejects", () => {
    const decision = transcodeDecision({
      sourceMimeType: "image/heic",
      constraints: jpegOnly,
      targetMimeType: targetMimeType(jpegOnly),
    });
    expect(decision).toMatchObject({
      sourceMimeType: "image/heic",
      targetMimeType: "image/jpeg",
      transcode: true,
      acceptedAsIs: false,
      reason: "source_format_not_accepted",
    });
  });

  test("a HEIC is flagged as a decode the runtime may not be able to perform", () => {
    expect(
      transcodeDecision({
        sourceMimeType: "image/heic",
        constraints: noRule,
        targetMimeType: "image/jpeg",
      }).decodeRisk,
    ).toBe("runtime_dependent");
    expect(
      transcodeDecision({
        sourceMimeType: "image/jpeg",
        constraints: noRule,
        targetMimeType: "image/jpeg",
      }).decodeRisk,
    ).toBe("none");
  });

  test("a JPEG into a JPEG archive is re-encoded but not transcoded", () => {
    const decision = transcodeDecision({
      sourceMimeType: "image/jpeg",
      constraints: jpegOnly,
      targetMimeType: "image/jpeg",
    });
    expect(decision.transcode).toBe(false);
    expect(decision.reason).toBe("already_target_format");
  });

  test("a format the agency accepts but the archive does not carry still changes format", () => {
    const decision = transcodeDecision({
      sourceMimeType: "image/png",
      constraints: jpegOnly,
      targetMimeType: "image/jpeg",
    });
    expect(decision).toMatchObject({
      transcode: true,
      acceptedAsIs: true,
      reason: "accepted_but_not_target_format",
    });
  });

  test("unreadable bytes are encoded to the target rather than passed through", () => {
    const decision = transcodeDecision({
      sourceMimeType: null,
      constraints: noRule,
      targetMimeType: "image/jpeg",
    });
    expect(decision).toMatchObject({
      transcode: true,
      acceptedAsIs: null,
      reason: "source_format_unrecognised",
    });
  });

  test("the published list is kept unfiltered, so a format Sharp cannot write still counts as accepted", () => {
    // Sharp writes no HEIC, so `allowedMimeTypes` drops it — but the agency
    // did accept it, and the decision has to be able to say so.
    const heicAccepted = readConstraints({
      rules: {
        files: [
          {
            scope: "per_file",
            constraint: {
              field: "file.mime_type",
              operator: "in",
              value: ["image/jpeg", "image/heic"],
            },
          },
        ],
      },
    });
    expect(heicAccepted.allowedMimeTypes).toEqual(["image/jpeg"]);
    expect(heicAccepted.publishedMimeTypes).toEqual(["image/jpeg", "image/heic"]);
    expect(
      transcodeDecision({
        sourceMimeType: "image/heic",
        constraints: heicAccepted,
        targetMimeType: "image/jpeg",
      }).acceptedAsIs,
    ).toBe(true);
  });
});

describe("the stats block", () => {
  test("writes the measurements an agency asks for, in both units", () => {
    const block = buildStatsBlock(FULL_TALENT);
    expect(block.name).toBe("Mia Voss");
    expect(statLine(block, "Height")).toContain("178 cm / 5'10\"");
    expect(statLine(block, "Bust")).toContain("86 cm / 34\"");
    expect(statLine(block, "Waist")).toContain("61 cm / 24\"");
    expect(statLine(block, "Hips")).toContain("89 cm / 35\"");
    expect(statLine(block, "Shoe")).toContain("40");
    expect(statLine(block, "Hair")).toContain("Brown");
    expect(statLine(block, "Eyes")).toContain("Green");
    expect(statLine(block, "Based in")).toContain("New York");
    expect(statLine(block, "Instagram")).toContain("@miavoss");
  });

  test("says chest for a menswear profile and bust for a womenswear one", () => {
    const menswear = buildStatsBlock({
      ...FULL_TALENT,
      gender: "male",
      bustCm: null,
      chestCm: 97,
      hipsCm: null,
    });
    expect(statLine(menswear, "Chest")).toContain("97 cm / 38\"");
    expect(statLine(menswear, "Bust")).toBeNull();
    expect(statLine(buildStatsBlock(FULL_TALENT), "Chest")).toBeNull();
  });

  test("omits an absent field entirely rather than placeholding it", () => {
    const sparse = buildStatsBlock({
      firstName: "Jo",
      lastName: "Lang",
      gender: "female",
      heightCm: 175,
    });
    expect(statLine(sparse, "Height")).toContain("175 cm");
    for (const label of ["Bust", "Waist", "Hips", "Shoe", "Hair", "Eyes", "Based in", "Instagram"]) {
      expect(statLine(sparse, label)).toBeNull();
    }
    // No dash, "n/a", "—" or empty-value line anywhere in the block.
    expect(sparse.text).not.toMatch(/(?:^|\s)(?:-{1,2}|—|n\/a|N\/A|TBD|unknown)(?:\s|$)/);
    for (const line of sparse.lines.filter(Boolean)) {
      expect(line.trim()).not.toMatch(/[A-Za-z ]+\s{2,}$/);
    }
  });

  test("is empty for a profile carrying nothing, so no file is written", () => {
    expect(buildStatsBlock({}).isEmpty).toBe(true);
    expect(buildStatsBlock(null).isEmpty).toBe(true);
  });

  test("reads an Instagram handle from a handle or a URL, and refuses a mangled one", () => {
    expect(instagramHandle("miavoss")).toBe("@miavoss");
    expect(instagramHandle("@miavoss")).toBe("@miavoss");
    expect(instagramHandle("https://www.instagram.com/mia.voss/")).toBe("@mia.voss");
    expect(instagramHandle("mia voss and friends")).toBeNull();
    expect(instagramHandle("")).toBeNull();
  });
});

describe("the email draft", () => {
  const statsBlock = buildStatsBlock(FULL_TALENT);
  const draft = renderEmailDraft({
    channel: EMAIL_CHANNEL,
    agencyName: "Muse Model Management",
    statsBlock,
    fileCount: 3,
    heightLabel: "178 cm / 5'10\"",
    city: "New York",
  });

  test("is written only for a channel that is actually an inbox", () => {
    expect(isEmailChannel(EMAIL_CHANNEL)).toBe(true);
    expect(isEmailChannel({ type: "official_web_form", url: "https://example.test/apply" })).toBe(
      false,
    );
    expect(isEmailChannel(null)).toBe(false);
  });

  test("addresses the mailbox the registry publishes", () => {
    const withAddress = renderEmailDraft({
      channel: { type: "official_email", url: "mailto:scouting@example.test" },
      agencyName: "Example",
      statsBlock,
      fileCount: 2,
    });
    expect(withAddress.split("\n")[0]).toBe("To: scouting@example.test");
  });

  test("invents no address when the registry publishes only a page", () => {
    // The v1 schema constrains channel.url to an https page, so this is the
    // real Muse case. A plausible-looking guess would be a submission sent
    // nowhere, with the talent believing it arrived.
    expect(publishedRecipient(EMAIL_CHANNEL)).toEqual({
      address: null,
      publishedAt: "https://www.musenyc.com/contact",
    });
    const toLine = draft.split("\n")[0];
    expect(toLine).toContain("https://www.musenyc.com/contact");
    expect(toLine).toMatch(/copy it from their page/);
    // Nothing anywhere in the draft looks like an address Pholio made up.
    expect(draft).not.toMatch(/[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  test("uses the factual subject convention, dropping any fact the profile lacks", () => {
    expect(draft).toContain(
      "Subject: Model submission — Mia Voss, 178 cm / 5'10\", New York",
    );
    const sparse = renderEmailDraft({
      channel: EMAIL_CHANNEL,
      agencyName: "Muse Model Management",
      statsBlock: buildStatsBlock({ firstName: "Jo", lastName: "Lang" }),
      fileCount: 1,
    });
    expect(sparse).toContain("Subject: Model submission — Jo Lang\n");
  });

  test("names what is attached and carries the same stats block", () => {
    expect(draft).toContain(
      "Attached are 3 digitals prepared to the requirements Muse Model Management publishes.",
    );
    expect(draft).toContain(statsBlock.text);
  });

  test("counts one attachment in words rather than as a bare 1", () => {
    const single = renderEmailDraft({
      channel: EMAIL_CHANNEL,
      agencyName: "Muse Model Management",
      statsBlock,
      fileCount: 1,
    });
    expect(single).toContain("Attached is one digital prepared to");
  });

  test("signs off with the talent's name", () => {
    const lines = draft.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe("Mia Voss");
  });

  test("stays in a factual register", () => {
    for (const phrase of MARKETING_PHRASES) {
      expect(draft).not.toMatch(phrase);
    }
    // Nor does it claim anything on the talent's behalf.
    expect(draft).not.toMatch(/\b(?:best|top|stunning|beautiful|striking|ideal)\b/i);
  });
});
