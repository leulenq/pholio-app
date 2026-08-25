"use strict";

/**
 * The machine-readable comp card (strategic analysis §9.6 #6).
 *
 * "Emit correct 5.5×8.5/A5 geometry + an embedded structured-data payload; if
 * Pholio's card becomes the format agencies prefer to receive, the standard
 * itself is the moat. (No digital comp-card standard exists anywhere.)"
 *
 * The geometry half was already right — layout-solver.js works in 5.5×8.5, the
 * industry trim. This is the other half: the same facts the card prints, also
 * present as data, so an agency that receives the PDF can read it instead of
 * retyping it into their own system.
 *
 * WHY BOTH XMP AND AN ATTACHMENT.
 *
 * They serve different readers and neither alone is enough. XMP is the metadata
 * standard every PDF tool already understands, so Bridge, Acrobat, a DAM or an
 * `exiftool` in someone's pipeline will surface the card's identity without
 * being taught anything. An embedded file attachment carries the full JSON,
 * which XMP is a poor container for, and it survives being pulled out and
 * parsed by a script that knows nothing about PDF internals.
 *
 * WHAT MAY NOT GO IN.
 *
 * A comp card travels. It gets forwarded, printed, dropped in shared folders,
 * and it long outlives the moment it was made for. So the payload carries only
 * what the printed card itself already discloses, and specifically NEVER:
 *
 *   - date of birth (the age band the card shows, and nothing finer)
 *   - internal identifiers that would let a holder address Pholio's API
 *   - any measurement or contact detail withheld from the printed card,
 *     including everything suppressed for a minor
 *
 * The rule is simple and worth keeping simple: if it is not on the card, it is
 * not in the payload. A structured payload that is more revealing than the
 * artifact it is attached to would be a leak wearing a standard's clothes.
 *
 * The schema is versioned because the argument for it is adoption: a consumer
 * has to be able to rely on a shape, and to detect one it does not yet know.
 */

const SCHEMA_VERSION = "1.0";
const SCHEMA_ID = "https://pholio.studio/schema/comp-card/v1";

/** Attachment name — descriptive, so a human unpacking it knows what it is. */
const ATTACHMENT_NAME = "comp-card.json";

/** The industry trim, in inches. Not configurable: it is the standard. */
const TRIM = Object.freeze({ widthInches: 5.5, heightInches: 8.5 });

function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Drop null-valued keys, recursively.
 *
 * A consumer should be able to tell "not given" from "given as empty", and the
 * cleanest way to say the former in JSON is absence. It also keeps the payload
 * small enough that embedding it is free.
 *
 * @param {object} value
 */
function prune(value) {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== null && item !== undefined);
    return items.length ? items : null;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      const pruned = prune(raw);
      if (pruned !== null && pruned !== undefined) out[key] = pruned;
    }
    return Object.keys(out).length ? out : null;
  }
  return value === "" ? null : value;
}

/**
 * Build the payload from what the card prints.
 *
 * @param {object} input
 * @param {object} input.profile        the profile the card was rendered from
 * @param {string} [input.portfolioUrl] the public card/portfolio link
 * @param {string} [input.issuedAt]     ISO timestamp of generation
 * @param {boolean} [input.minor]       suppress everything a minor's card omits
 * @param {Array<object>} [input.images] frames on the card, for capture dates
 * @returns {object}
 */
function buildCompCardPayload({
  profile = {},
  portfolioUrl = null,
  issuedAt = null,
  minor = false,
  images = [],
} = {}) {
  // A minor's card prints no body measurements, so the payload carries none.
  // Same rule, same place it is decided everywhere else in the product.
  const measurements = minor
    ? null
    : {
        heightCm: number(profile.height_cm),
        bustCm: number(profile.bust_cm),
        chestCm: number(profile.chest_cm),
        waistCm: number(profile.waist_cm),
        hipsCm: number(profile.hips_cm),
        inseamCm: number(profile.inseam_cm),
        shoe: text(profile.shoe_size),
        dress: text(profile.dress_size),
        suit: text(profile.suit_size),
      };

  // Capture dates only — never an assertion about what the pictures show. The
  // same non-biometric line the freshness and season-memory work holds.
  const captureDates = (images || [])
    .map((image) => text(image?.captured_at))
    .filter(Boolean)
    .map((stamp) => stamp.slice(0, 10))
    .sort();

  return prune({
    $schema: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "comp-card",
    issuedAt: issuedAt || new Date().toISOString(),
    issuer: { name: "Pholio", url: "https://pholio.studio" },

    talent: {
      name: [text(profile.first_name), text(profile.last_name)]
        .filter(Boolean)
        .join(" ") || null,
      // Band, never a birth date — the card prints a band and so does this.
      ageBand: text(profile.age_band),
      pronouns: text(profile.pronouns),
      basedIn: text(profile.city),
      market: text(profile.market),
      hair: text(profile.hair_color),
      eyes: text(profile.eye_color),
      statsTrack: text(profile.stats_track),
    },

    measurements,

    representation: text(profile.represented_by)
      ? { status: text(profile.representation_status), by: text(profile.represented_by) }
      : { status: text(profile.representation_status) },

    digitals: captureDates.length
      ? { capturedOn: captureDates, newestCapturedOn: captureDates[captureDates.length - 1] }
      : null,

    links: { portfolio: text(portfolioUrl) },

    print: {
      trimWidthInches: TRIM.widthInches,
      trimHeightInches: TRIM.heightInches,
      // Stated so a printer or a receiving system knows the geometry is
      // deliberate rather than whatever the generator happened to emit.
      standard: "us-comp-card-5.5x8.5",
    },
  });
}

/**
 * XMP packet carrying the identity fields a generic PDF tool will surface.
 *
 * Deliberately a subset: XMP is a poor container for nested data, and anything
 * that needs structure belongs in the attachment. Values are escaped because a
 * talent's name is user input and this is XML.
 *
 * @param {object} payload
 */
function buildXmp(payload) {
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const name = esc(payload?.talent?.name || "Comp card");
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pholio="https://pholio.studio/ns/comp-card/1.0/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${name}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>Pholio</rdf:li></rdf:Seq></dc:creator>
   <dc:format>application/pdf</dc:format>
   <xmp:CreatorTool>Pholio</xmp:CreatorTool>
   <pholio:schema>${esc(SCHEMA_ID)}</pholio:schema>
   <pholio:schemaVersion>${esc(SCHEMA_VERSION)}</pholio:schemaVersion>
   <pholio:kind>comp-card</pholio:kind>
   <pholio:issuedAt>${esc(payload?.issuedAt)}</pholio:issuedAt>
   <pholio:printStandard>${esc(payload?.print?.standard)}</pholio:printStandard>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Attach the payload to a rendered comp card.
 *
 * Returns the ORIGINAL buffer on any failure, following `portfolio-link.js`:
 * a card that generated correctly must never fail to reach the talent because
 * a metadata nicety threw. Machine-readability is a bonus on top of a document
 * whose job is to be looked at.
 *
 * @param {Buffer} pdfBuffer
 * @param {object} payload from buildCompCardPayload
 * @returns {Promise<Buffer>}
 */
async function embedMachineReadablePayload(pdfBuffer, payload) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0 || !payload) {
    return pdfBuffer;
  }
  try {
    // eslint-disable-next-line global-require
    const { PDFDocument, PDFName } = require("pdf-lib");
    const doc = await PDFDocument.load(pdfBuffer);

    const json = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    await doc.attach(json, ATTACHMENT_NAME, {
      mimeType: "application/json",
      description: `Structured comp card data (${SCHEMA_ID})`,
      creationDate: new Date(),
      modificationDate: new Date(),
    });

    // Document info, for the tools that read nothing else.
    if (payload.talent?.name) doc.setTitle(`${payload.talent.name} — comp card`);
    doc.setCreator("Pholio");
    doc.setProducer("Pholio");
    doc.setSubject(`Comp card · ${SCHEMA_ID}`);
    doc.setKeywords(["comp card", "pholio", SCHEMA_VERSION]);

    /* XMP has to be written through the low-level API: pdf-lib 1.x has no
       setMetadata(). Uncompressed on purpose — the point of an XMP packet is
       that a tool (or a person with `strings`) can find it without a PDF
       parser, and a Flate stream defeats exactly that. */
    const xmp = buildXmp(payload);
    const stream = doc.context.stream(xmp, {
      Type: "Metadata",
      Subtype: "XML",
      Length: Buffer.byteLength(xmp, "utf8"),
    });
    doc.catalog.set(PDFName.of("Metadata"), doc.context.register(stream));

    const bytes = await doc.save();
    return Buffer.from(bytes);
  } catch (error) {
    console.warn("[CompCard] machine-readable payload skipped:", error.message);
    return pdfBuffer;
  }
}

module.exports = {
  ATTACHMENT_NAME,
  SCHEMA_ID,
  SCHEMA_VERSION,
  TRIM,
  buildCompCardPayload,
  buildXmp,
  embedMachineReadablePayload,
};
