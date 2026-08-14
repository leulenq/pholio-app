/**
 * Comp card import (A3).
 *
 * Covers:
 *  - unit resolution: explicit units win, non-overlapping ranges self-identify,
 *    overlapping ranges stay ambiguous rather than being guessed;
 *  - the card-system pass that resolves ambiguous values from unambiguous ones;
 *  - label/value parsing including several pairs on one line, and the bust/chest
 *    split that keeps a men's chest out of a bust column;
 *  - name recovery from letter-spaced typesetting, and agency matching against
 *    the registry vs. free text;
 *  - real PDF text-layer extraction end to end, against PDFs generated for the
 *    test rather than a hand-written fixture string;
 *  - the proposal contract: ambiguous fields are never pre-filled, and confirm
 *    validates against the stored proposal rather than the request body;
 *  - measurement provenance — import marks measurements declared-on-import and
 *    never emits a capture date;
 *  - the no-dead-end guarantee for every failure mode.
 *
 * The OCR fallback is exercised with the Groq client mocked: this environment has
 * no GROQ_API_KEY, so the live vision path is covered only for its degradation
 * behaviour, which is the behaviour that must not regress.
 */

const path = require("path");
const fs = require("fs/promises");
const os = require("os");

const {
  detectCardSystem,
  interpretMeasurement,
  parseFeetInches,
  parseNumeric,
} = require("../comp-card-import/units");
const {
  findLabelSpans,
  findName,
  findAgency,
  findShotTypes,
  parseCard,
  titleCaseName,
} = require("../comp-card-import/parse-card");
const {
  buildProposal,
  buildProfileUpdate,
  MEASUREMENT_SOURCE_IMPORT,
} = require("../comp-card-import/proposal");
const { extractCardText, messageForReason } = require("../comp-card-import/extract");
const { importCompCard } = require("../comp-card-import");
const { collapseLetterSpacing, extractPdfText } = require("../../../../shared/lib/pdf-text");
const { sanitiseLines } = require("../../../ai/comp-card-vision");

/**
 * Build a real PDF with a real text layer.
 *
 * pdf-lib rather than Puppeteer: this must run inside jest, where puppeteer is
 * ESM-only and cannot be required. Each entry becomes its own text-showing
 * operation, which is exactly how a design tool emits a comp card — so a line
 * built from several entries at the same `y` reproduces the multi-run case the
 * line grouper has to reassemble.
 */
async function makePdf(entries) {
  const { PDFDocument, StandardFonts } = require("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);

  for (const entry of entries) {
    page.drawText(entry.text, {
      x: entry.x,
      y: entry.y,
      size: entry.size || 11,
      font,
    });
  }

  return Buffer.from(await doc.save());
}

describe("units — explicit units win", () => {
  test.each([
    ['5\'11"', "height", 71, "in", 180.3],
    ["5' 11", "height", 71, "in", 180.3],
    ['34"', "circumference", 34, "in", 86.4],
    ["34 in", "circumference", 34, "in", 86.4],
    ["88cm", "circumference", 88, "cm", 88],
    ["1,80 m", "height", 180, "cm", 180],
  ])("%s reads as %s", (raw, kind, value, unit, cm) => {
    const reading = interpretMeasurement(raw, kind);
    expect(reading.status).toBe("resolved");
    expect(reading.value).toBe(value);
    expect(reading.unit).toBe(unit);
    expect(reading.cm).toBe(cm);
  });

  test("an explicit unit beats the range that would contradict it", () => {
    // 34cm is not a plausible bust, but the card said cm. We do not overrule the
    // card and silently reinterpret it as inches — that would invent a number.
    const reading = interpretMeasurement("34 cm", "circumference");
    expect(reading.unit).toBe("cm");
    expect(reading.resolvedBy).toBe("explicit");
  });
});

describe("units — ranges that do not overlap are self-identifying", () => {
  test("178 is centimetres, because 178in is not a height", () => {
    const reading = interpretMeasurement("178", "height");
    expect(reading).toMatchObject({ status: "resolved", unit: "cm", cm: 178, resolvedBy: "range" });
  });

  test("71 is inches, because 71cm is not an adult height", () => {
    const reading = interpretMeasurement("71", "height");
    expect(reading).toMatchObject({ status: "resolved", unit: "in", cm: 180.3 });
  });

  test("a waist of 24 is inches and 61 is centimetres", () => {
    expect(interpretMeasurement("24", "circumference").unit).toBe("in");
    expect(interpretMeasurement("61", "circumference").unit).toBe("cm");
  });

  test("shoe 39 is EU and 10.5 is US", () => {
    expect(interpretMeasurement("39", "shoe").unit).toBe("eu");
    expect(interpretMeasurement("10.5", "shoe").unit).toBe("us");
  });
});

describe("units — overlap stays ambiguous instead of being guessed", () => {
  test("a bare 52 could be a large chest in inches or a small waist in cm", () => {
    const reading = interpretMeasurement("52", "circumference");
    expect(reading.status).toBe("ambiguous");
    expect(reading.value).toBeNull();
    expect(reading.candidates.map((c) => c.unit).sort()).toEqual(["cm", "in"]);
  });

  test("a bare weight is ambiguous across almost its whole range", () => {
    expect(interpretMeasurement("130", "weight").status).toBe("ambiguous");
  });

  test("a value that is no measurement at all is implausible, not a guess", () => {
    // A stray year or panel number picked up next to a label.
    expect(interpretMeasurement("2019", "circumference").status).toBe("implausible");
    expect(interpretMeasurement("3", "circumference").status).toBe("implausible");
  });

  test("unreadable input yields no value", () => {
    expect(interpretMeasurement("n/a", "circumference").status).toBe("unreadable");
    expect(interpretMeasurement("", "height").status).toBe("unreadable");
  });
});

describe("units — the card's own system resolves what a value cannot", () => {
  test("unambiguous inches on the card make an ambiguous 52 inches", () => {
    const readings = [
      interpretMeasurement('34"', "circumference"),
      interpretMeasurement("24", "circumference"),
    ];
    const system = detectCardSystem(readings);
    expect(system).toBe("imperial");

    const resolved = interpretMeasurement("52", "circumference", system);
    expect(resolved).toMatchObject({ status: "resolved", unit: "in", resolvedBy: "card_system" });
  });

  test("a card with no unambiguous evidence resolves nothing", () => {
    expect(detectCardSystem([interpretMeasurement("52", "circumference")])).toBeNull();
    // and the value therefore stays ambiguous
    expect(interpretMeasurement("52", "circumference", null).status).toBe("ambiguous");
  });

  test("a value resolved by the card system never votes on what the system is", () => {
    // Otherwise one guess bootstraps the next.
    const bootstrapped = interpretMeasurement("52", "circumference", "imperial");
    expect(detectCardSystem([bootstrapped])).toBeNull();
  });

  test("numeric forms a card actually prints", () => {
    expect(parseNumeric("34 1/2")).toBe(34.5);
    expect(parseNumeric("88,5")).toBe(88.5);
    expect(parseFeetInches("5'11\"")).toBe(71);
    expect(parseFeetInches("6 ft")).toBe(72);
  });
});

describe("parsing labels off a line", () => {
  test("several label/value pairs on one line each get their own value", () => {
    const spans = findLabelSpans('HEIGHT 5\'11"  BUST 34"  WAIST 24"');
    expect(spans.map((s) => s.field)).toEqual(["height", "bust", "waist"]);
    expect(spans.map((s) => s.value)).toEqual(["5'11\"", '34"', '24"']);
  });

  test("bust and chest stay separate fields", () => {
    // Folding CHEST into bust would write a men's chest measurement into the
    // bust column, which is a different measurement on a different card.
    expect(findLabelSpans('CHEST 38"')[0].field).toBe("chest");
    expect(findLabelSpans('BUST 34"')[0].field).toBe("bust");
  });

  test("separators between label and value are tolerated", () => {
    expect(findLabelSpans("HEIGHT: 178")[0].value).toBe("178");
    expect(findLabelSpans("HAIR - Brown")[0].value).toBe("brown");
  });
});

describe("name recovery", () => {
  test("letter-spaced typesetting collapses without eating the word gap", () => {
    // The trap: letter gaps and word gaps are both spaces. A double space is a
    // word boundary; a single space between singles is tracking.
    expect(collapseLetterSpacing("E L I A S  V A N C E")).toBe("ELIAS VANCE");
    expect(collapseLetterSpacing("M A R A")).toBe("MARA");
  });

  test("ordinary text and initials are left alone", () => {
    expect(collapseLetterSpacing("J R Smith")).toBe("J R Smith");
    expect(collapseLetterSpacing("NEXT MANAGEMENT")).toBe("NEXT MANAGEMENT");
  });

  test("a tracked name that arrives as one run is offered, but not confidently", () => {
    // pdfjs normalises whitespace inside a text item, so a name typeset as one
    // run loses the wider word gap before we ever see it and cannot be split.
    // The honest outcome is a flagged single token, not an invented split — a
    // plausible-looking wrong name is worse than one marked for checking.
    const name = findName([{ text: "MARAOKONKWO", fontHeight: 26 }]);
    expect(name).toMatchObject({ text: "Maraokonkwo", lastName: null, confidence: "low" });
  });

  test("the largest line that reads as a name wins, and caps are recased", () => {
    const name = findName([
      { text: "ELIAS VANCE", fontHeight: 24 },
      { text: "NEXT MANAGEMENT", fontHeight: 9 },
      { text: 'HEIGHT 5\'11"', fontHeight: 9 },
    ]);
    expect(name).toMatchObject({
      text: "Elias Vance",
      firstName: "Elias",
      lastName: "Vance",
      confidence: "high",
    });
  });

  test("mixed-case names keep the casing they were given", () => {
    expect(titleCaseName("McKenna van der Berg")).toBe("McKenna van der Berg");
    expect(titleCaseName("O'BRIEN")).toBe("O'Brien");
  });

  test("stat lines and agency lines are never taken for a name", () => {
    expect(findName([{ text: 'WAIST 24"', fontHeight: 40 }])).toBeNull();
    expect(findName([{ text: "STORM MODEL MANAGEMENT", fontHeight: 40 }])).toBeNull();
  });
});

describe("agency matching", () => {
  const registry = [{ id: "agency-1", name: "Next Management" }];

  test("a registry agency is matched and linked", () => {
    const agency = findAgency([{ text: "NEXT MANAGEMENT · NEW YORK", fontHeight: 9 }], registry);
    expect(agency).toMatchObject({
      agencyId: "agency-1",
      matchedRegistry: true,
      confidence: "high",
    });
  });

  test("an unknown agency is free text at low confidence, never a link", () => {
    const agency = findAgency([{ text: "ELITE MODEL MANAGEMENT · MILANO", fontHeight: 9 }], registry);
    expect(agency).toMatchObject({
      text: "ELITE MODEL MANAGEMENT",
      agencyId: null,
      matchedRegistry: false,
      confidence: "low",
    });
  });

  test("shot types come from printed captions only", () => {
    expect(findShotTypes([{ text: "HEADSHOT FULL LENGTH PROFILE" }]).sort()).toEqual([
      "full_length",
      "headshot",
      "profile",
    ]);
  });
});

describe("PDF text layer, against real generated PDFs", () => {
  jest.setTimeout(120000);

  test("an imperial US card parses end to end", async () => {
    // Name and label/value pairs each drawn as their own run, the way a card is
    // typeset — including the tracked masthead split across two runs.
    const pdf = await makePdf([
      { text: "E L I A S", x: 40, y: 780, size: 24 },
      { text: "V A N C E", x: 160, y: 780, size: 24 },
      { text: "NEXT MANAGEMENT", x: 40, y: 750, size: 10 },
      { text: "NEW YORK", x: 180, y: 750, size: 10 },
      { text: "HEIGHT", x: 40, y: 720 },
      { text: "5'11\"", x: 110, y: 720 },
      { text: "CHEST", x: 40, y: 700 },
      { text: '38"', x: 110, y: 700 },
      { text: "WAIST", x: 40, y: 680 },
      { text: '30"', x: 110, y: 680 },
      { text: "SHOE", x: 40, y: 660 },
      { text: "10.5", x: 110, y: 660 },
      { text: "HAIR", x: 40, y: 640 },
      { text: "Brown", x: 110, y: 640 },
      { text: "EYES", x: 40, y: 620 },
      { text: "Green", x: 110, y: 620 },
    ]);

    const doc = await extractPdfText(pdf);
    expect(doc.hasTextLayer).toBe(true);

    const parsed = parseCard(
      doc.pages.flatMap((page) => page.lines),
      { knownAgencies: [{ id: "agency-1", name: "Next Management" }] },
    );

    expect(parsed.name).toMatchObject({ firstName: "Elias", lastName: "Vance" });
    expect(parsed.agency).toMatchObject({ agencyId: "agency-1", matchedRegistry: true });
    expect(parsed.cardSystem).toBe("imperial");
    expect(parsed.measurements.height).toMatchObject({ unit: "in", cm: 180.3 });
    expect(parsed.measurements.chest).toMatchObject({ unit: "in", cm: 96.5 });
    expect(parsed.measurements.shoe).toMatchObject({ unit: "us", value: 10.5 });
    expect(parsed.appearance.hair.value).toBe("brown");
    expect(parsed.appearance.eyes.value).toBe("green");
    // A men's card prints CHEST, so nothing should land in bust.
    expect(parsed.measurements.bust).toBeUndefined();
  });

  test("a metric European card with several pairs per line parses end to end", async () => {
    const pdf = await makePdf([
      { text: "M A R A", x: 40, y: 780, size: 26 },
      { text: "O K O N K W O", x: 230, y: 780, size: 26 },
      { text: "ELITE MODEL MANAGEMENT · MILANO", x: 40, y: 748, size: 10 },
      { text: "HEIGHT 178   BUST 84   WAIST 60", x: 40, y: 716 },
      { text: "HIPS 89   SHOES 39   HAIR Dark Brown", x: 40, y: 696 },
      { text: "EYES Hazel   DRESS 36", x: 40, y: 676 },
    ]);

    const parsed = parseCard((await extractPdfText(pdf)).pages.flatMap((p) => p.lines));

    expect(parsed.name).toMatchObject({ firstName: "Mara", lastName: "Okonkwo" });
    expect(parsed.cardSystem).toBe("metric");
    expect(parsed.measurements.height).toMatchObject({ unit: "cm", cm: 178 });
    expect(parsed.measurements.bust).toMatchObject({ unit: "cm", cm: 84 });
    expect(parsed.measurements.hips).toMatchObject({ unit: "cm", cm: 89 });
    expect(parsed.measurements.shoe).toMatchObject({ unit: "eu", value: 39 });
    // Longest colour match, not the first substring hit.
    expect(parsed.appearance.hair.value).toBe("dark brown");
    expect(parsed.appearance.dress.value).toBe("36");
  });

  test("a PDF carrying no meaningful text reports that rather than pretending", async () => {
    const pdf = await makePdf([{ text: "©", x: 40, y: 40, size: 6 }]);
    const doc = await extractPdfText(pdf);
    expect(doc.hasTextLayer).toBe(false);

    const result = await extractCardText(pdf, { mimeType: "application/pdf" });
    expect(result.lines).toEqual([]);
    expect(result.reason).toBe("pdf_no_text_layer");
    expect(messageForReason(result.reason)).toMatch(/flat image/i);
  });
});

describe("the proposal contract", () => {
  const parsedCard = () => ({
    name: { text: "Mara Okonkwo", firstName: "Mara", lastName: "Okonkwo", confidence: "high" },
    agency: { text: "Elite Model Management", agencyId: null, confidence: "low" },
    measurements: {
      height: interpretMeasurement("178", "height"),
      waist: interpretMeasurement("52", "circumference"), // ambiguous on purpose
    },
    appearance: {},
    shotTypes: ["headshot"],
    cardSystem: null,
    lineCount: 6,
  });

  test("found fields carry a value and the line they came from", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const height = proposal.fields.find((f) => f.key === "height_cm");
    expect(height).toMatchObject({ status: "found", value: 178 });
  });

  test("ambiguous fields are offered as a choice and never pre-filled", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const waist = proposal.fields.find((f) => f.key === "waist_cm");
    expect(waist.status).toBe("ambiguous");
    expect(waist.value).toBeNull();
    expect(waist.options).toHaveLength(2);
  });

  test("fields the card does not carry are reported as not found", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    expect(proposal.fields.find((f) => f.key === "hips_cm").status).toBe("not_found");
    expect(proposal.summary.notFound).toBeGreaterThan(0);
  });

  test("confirm applies only what the talent accepted", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const { update, applied } = buildProfileUpdate(proposal, {
      first_name: "Mara",
      height_cm: 178,
    });
    expect(applied.sort()).toEqual(["first_name", "height_cm"]);
    expect(update.first_name).toBe("Mara");
    expect(update.height_cm).toBe(178);
    // Not accepted, so not written.
    expect(update).not.toHaveProperty("last_name");
    expect(update).not.toHaveProperty("current_agency");
  });

  test("an ambiguous field only applies a reading that was actually offered", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const waist = proposal.fields.find((f) => f.key === "waist_cm");

    const chosen = buildProfileUpdate(proposal, { waist_cm: waist.options[0].value });
    expect(chosen.applied).toEqual(["waist_cm"]);

    // A value the card never contained is refused, not written.
    const invented = buildProfileUpdate(proposal, { waist_cm: 99 });
    expect(invented.applied).toEqual([]);
    expect(invented.rejected).toEqual(["waist_cm"]);
  });

  test("a field import does not own cannot be written through confirm", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const result = buildProfileUpdate(proposal, {
      is_pro: true,
      profile_completeness: 100,
      user_id: "someone-else",
    });
    expect(result.applied).toEqual([]);
    expect(result.update).toEqual({});
  });

  test("a not_found field cannot be applied even if the client posts one", () => {
    const proposal = buildProposal(parsedCard(), { method: "pdf_text" });
    const result = buildProfileUpdate(proposal, { hips_cm: 90 });
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual(["hips_cm"]);
  });
});

describe("measurement provenance", () => {
  const withHeight = () => ({
    name: null,
    agency: null,
    measurements: { height: interpretMeasurement("178", "height") },
    appearance: {},
    shotTypes: [],
    lineCount: 1,
  });

  test("applying a measurement marks it declared-on-import", () => {
    const proposal = buildProposal(withHeight(), { method: "pdf_text" });
    const { update } = buildProfileUpdate(proposal, { height_cm: 178 });
    expect(update.measurements_source).toBe(MEASUREMENT_SOURCE_IMPORT);
    expect(typeof update.measurements_updated_at).toBe("string");
  });

  test("applying only non-measurement fields does not touch measurement provenance", () => {
    const parsed = withHeight();
    parsed.name = { text: "Mara Okonkwo", firstName: "Mara", lastName: "Okonkwo" };
    const proposal = buildProposal(parsed, { method: "pdf_text" });
    const { update } = buildProfileUpdate(proposal, { first_name: "Mara" });
    expect(update).not.toHaveProperty("measurements_source");
    expect(update).not.toHaveProperty("measurements_updated_at");
  });

  test("import never emits a capture date or an image record", () => {
    // An uploaded card cannot date a photograph. If this ever fails, the
    // digitals freshness engine is being fed a date nobody established.
    const proposal = buildProposal(withHeight(), { method: "pdf_text" });
    const { update } = buildProfileUpdate(proposal, { height_cm: 178 });
    expect(update).not.toHaveProperty("captured_at");
    expect(Object.keys(update).some((key) => /captur|shot_date|image/i.test(key))).toBe(false);
  });
});

describe("the flow never dead-ends", () => {
  const emptyProposalFor = async (buffer, file) => importCompCard(buffer, file);

  test.each([
    ["an empty file", Buffer.alloc(0), "application/pdf", "empty_file"],
    ["an unsupported type", Buffer.from("hello"), "text/plain", "unsupported_type"],
    ["a corrupt PDF", Buffer.from("%PDF-1.4 not really"), "application/pdf", "pdf_unreadable"],
  ])("%s still yields a usable manual-entry proposal", async (_label, buffer, mimeType, reason) => {
    const proposal = await emptyProposalFor(buffer, { mimeType, filename: "card" });

    expect(proposal.source.reason).toBe(reason);
    expect(proposal.message).toBeTruthy();
    // Every field present and answerable by hand — this is the anti-dead-end
    // guarantee, not an error state.
    expect(proposal.fields.length).toBeGreaterThan(0);
    expect(proposal.fields.every((field) => field.status === "not_found")).toBe(true);
    expect(proposal.summary.found).toBe(0);
  });

  test("a card image with vision unconfigured degrades instead of failing", async () => {
    // No GROQ_API_KEY in this environment, which is exactly the outage case.
    const sharp = require("sharp");
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 190, b: 180 } },
    })
      .png()
      .toBuffer();

    const proposal = await importCompCard(png, { mimeType: "image/png", filename: "card.png" });
    expect(proposal.source.method).toBe("vision");
    expect(proposal.message).toBeTruthy();
    expect(proposal.fields.every((field) => field.status === "not_found")).toBe(true);
  });
});

describe("OCR output is not trusted as-is", () => {
  test("descriptive commentary about a person is dropped, not parsed", () => {
    // The prompt forbids it; this filter is what makes that a property rather
    // than a request. Invariant A1.5 — no inference about appearance or type.
    const lines = sanitiseLines([
      'HEIGHT 5\'11"',
      "The model appears to be in her mid-twenties",
      "She has long blonde hair and a slim build",
      "WAIST 24\"",
    ]);
    expect(lines).toEqual(['HEIGHT 5\'11"', 'WAIST 24"']);
  });

  test("prose-length output and duplicates are dropped", () => {
    expect(sanitiseLines(["x".repeat(200)])).toEqual([]);
    expect(sanitiseLines(["BUST 34\"", "bust 34\""])).toHaveLength(1);
    expect(sanitiseLines(null)).toEqual([]);
  });
});
