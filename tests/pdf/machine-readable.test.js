"use strict";

/**
 * The machine-readable comp card (strategic analysis §9.6 #6).
 *
 * Two things are worth protecting here. The first is that the payload actually
 * survives a real PDF round-trip — a metadata feature that silently no-ops is
 * worse than none, because everyone downstream builds on the assumption it is
 * there. The second, and more important, is the disclosure rule: a comp card is
 * a document that travels, and a structured payload richer than the card it is
 * attached to would be a leak wearing a standard's clothes.
 */

const { PDFDocument } = require("pdf-lib");
const {
  ATTACHMENT_NAME,
  SCHEMA_ID,
  SCHEMA_VERSION,
  TRIM,
  buildCompCardPayload,
  buildXmp,
  embedMachineReadablePayload,
} = require("../../src/domains/pdf/machine-readable");

const PROFILE = Object.freeze({
  first_name: "Ada",
  last_name: "Editorial",
  age_band: "18_or_older",
  city: "New York",
  hair_color: "Brown",
  eye_color: "Hazel",
  stats_track: "womenswear",
  height_cm: 178,
  waist_cm: 61,
  hips_cm: 89,
  shoe_size: "40",
  // Present on the row, and must NOT reach the payload.
  date_of_birth: "1999-04-02",
  id: "b0587dcc-b2b4-468c-9349-bc8939dd2f48",
  user_id: "c61a7925-e0fd-4725-af5f-0022a735cdb5",
  email: "ada@example.com",
  phone: "+1 555 0100",
});

/**
 * Pull the embedded JSON back out by walking Catalog → Names → EmbeddedFiles,
 * which is what a receiving system would do.
 */
function extractAttachment(doc) {
  const { PDFName, PDFDict, PDFArray, PDFHexString, PDFString, decodePDFRawStream } =
    require("pdf-lib");

  const names = doc.catalog.lookup(PDFName.of("Names"), PDFDict);
  const embedded = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
  const list = embedded.lookup(PDFName.of("Names"), PDFArray);

  const rawName = list.lookup(0);
  const name =
    rawName instanceof PDFHexString || rawName instanceof PDFString
      ? rawName.decodeText()
      : String(rawName);

  const fileSpec = list.lookup(1, PDFDict);
  const ef = fileSpec.lookup(PDFName.of("EF"), PDFDict);
  const stream = ef.lookup(PDFName.of("F"));
  const bytes = decodePDFRawStream(stream).decode();

  return { name, json: Buffer.from(bytes).toString("utf8") };
}

async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([TRIM.widthInches * 72, TRIM.heightInches * 72]);
  return Buffer.from(await doc.save());
}

describe("what may never travel on a comp card", () => {
  const payload = buildCompCardPayload({ profile: PROFILE });
  const serialized = JSON.stringify(payload);

  test("no date of birth — the band, and nothing finer", () => {
    expect(serialized).not.toContain("1999-04-02");
    expect(serialized).not.toContain("date_of_birth");
    expect(payload.talent.ageBand).toBe("18_or_older");
  });

  test("no internal identifiers a holder could address the API with", () => {
    expect(serialized).not.toContain(PROFILE.id);
    expect(serialized).not.toContain(PROFILE.user_id);
  });

  test("no contact details the card does not print", () => {
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("555 0100");
  });

  test("a minor's card carries no measurements at all", () => {
    const minorPayload = buildCompCardPayload({ profile: PROFILE, minor: true });
    expect(minorPayload.measurements).toBeUndefined();
    expect(JSON.stringify(minorPayload)).not.toContain("178");
  });
});

describe("absence is expressed as absence", () => {
  test("a measurement the talent did not give is missing, not null or zero", () => {
    const payload = buildCompCardPayload({
      profile: { first_name: "Bo", height_cm: 182 },
    });
    expect(payload.measurements.heightCm).toBe(182);
    // A consumer must be able to tell "not given" from "given as empty", and
    // absence is the cleanest way to say the former in JSON.
    expect(payload.measurements).not.toHaveProperty("waistCm");
    expect(payload.measurements).not.toHaveProperty("shoe");
  });

  test("no digitals block at all when nothing carries a capture date", () => {
    const payload = buildCompCardPayload({
      profile: PROFILE,
      images: [{ captured_at: null }, {}],
    });
    expect(payload).not.toHaveProperty("digitals");
  });

  test("capture dates only — never a claim about what the pictures show", () => {
    const payload = buildCompCardPayload({
      profile: PROFILE,
      images: [
        { captured_at: "2026-06-01T00:00:00.000Z" },
        { captured_at: "2026-08-01T00:00:00.000Z" },
      ],
    });
    expect(payload.digitals.capturedOn).toEqual(["2026-06-01", "2026-08-01"]);
    expect(payload.digitals.newestCapturedOn).toBe("2026-08-01");
    // Nothing derived from pixels, here or anywhere near this feature.
    expect(JSON.stringify(payload)).not.toMatch(/lookType|marketSignals|score/i);
  });
});

describe("the schema is declared, because adoption depends on it", () => {
  test("carries its own id and version", () => {
    const payload = buildCompCardPayload({ profile: PROFILE });
    expect(payload.$schema).toBe(SCHEMA_ID);
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
    expect(payload.kind).toBe("comp-card");
  });

  test("states the print geometry as deliberate, not incidental", () => {
    const payload = buildCompCardPayload({ profile: PROFILE });
    expect(payload.print).toEqual({
      trimWidthInches: 5.5,
      trimHeightInches: 8.5,
      standard: "us-comp-card-5.5x8.5",
    });
  });
});

describe("XMP", () => {
  test("escapes a name that would otherwise break the XML", () => {
    const xmp = buildXmp({
      talent: { name: 'Ada & "Bo" <script>' },
      issuedAt: "2026-08-25T00:00:00.000Z",
      print: { standard: "us-comp-card-5.5x8.5" },
    });
    expect(xmp).toContain("Ada &amp; &quot;Bo&quot; &lt;script&gt;");
    expect(xmp).not.toContain("<script>");
  });
});

describe("it survives a real PDF round-trip", () => {
  test("the attachment is present and parses back to the payload", async () => {
    const payload = buildCompCardPayload({ profile: PROFILE });
    const out = await embedMachineReadablePayload(await blankPdf(), payload);

    expect(Buffer.isBuffer(out)).toBe(true);

    // Walk the catalog rather than grepping bytes: pdf-lib writes object
    // streams, so the filename is compressed. Any real consumer parses the PDF
    // properly, and so should the test that claims they can.
    const reloaded = await PDFDocument.load(out);
    const extracted = extractAttachment(reloaded);
    expect(extracted.name).toBe(ATTACHMENT_NAME);

    const parsed = JSON.parse(extracted.json);
    expect(parsed.$schema).toBe(SCHEMA_ID);
    expect(parsed.talent.name).toBe("Ada Editorial");
    expect(parsed.measurements.heightCm).toBe(178);
    // The disclosure rule holds after the round-trip, not just before it.
    expect(extracted.json).not.toContain("1999-04-02");

    expect(reloaded.getTitle()).toContain("Ada Editorial");
    expect(reloaded.getSubject()).toContain(SCHEMA_ID);
  });

  test("the XMP packet is written uncompressed, so a plain reader can find it", async () => {
    const payload = buildCompCardPayload({ profile: PROFILE });
    const out = await embedMachineReadablePayload(await blankPdf(), payload);
    const text = out.toString("latin1");

    // `strings` on the file should reveal it; a Flate stream would defeat that.
    expect(text).toContain("x:xmpmeta");
    expect(text).toContain(SCHEMA_ID);
  });

  test("a card that rendered correctly is never lost to a metadata failure", async () => {
    const original = await blankPdf();
    // Malformed input to the embedder: the card must come back untouched.
    const out = await embedMachineReadablePayload(original, { get bad() { throw new Error("boom"); } });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  test("a non-PDF buffer is returned unchanged rather than throwing", async () => {
    const junk = Buffer.from("not a pdf");
    await expect(
      embedMachineReadablePayload(junk, buildCompCardPayload({ profile: PROFILE })),
    ).resolves.toBe(junk);
  });
});
