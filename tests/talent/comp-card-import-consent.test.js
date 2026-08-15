/**
 * The AI consent gate on comp card import.
 *
 * A comp card is mostly photographs of one person. Reading a card *image* means
 * sending those photographs to a third-party vision model, so it requires the
 * same image-processing consent every other picture-to-a-model path requires.
 *
 * Reading a card *PDF* does not: `shared/lib/pdf-text.js` reads the text layer
 * and never touches a pixel. Gating that path would block the deterministic,
 * privacy-preserving route on a permission it has no use for, so these tests
 * pin both halves — the image path refuses without consent, and the PDF path
 * proceeds without it.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const { useIsolatedDatabase, migrate, dropIsolatedDatabase } = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("comp-card-import-consent");

const { acceptedLegal } = require("../setup/legal-fixture");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

// A 1x1 PNG. Never actually decoded — the gate answers before extraction runs.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
// A PDF with no text layer. Extraction stops at `pdf_no_text_layer` without a
// model, which is exactly the "allowed through the gate" case we want to prove.
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF\n", "utf8");

const CONSENT_CODE = "ai_image_consent_required";

describe("comp card import — image-processing consent gate", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await migrate(knex);

    await knex("users").insert({
      id: userId,
      email: `comp-card-consent-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      // Talent API routes sit behind the legal gate.
      ...acceptedLegal(),
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `comp-card-consent-${profileId}`,
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      height_cm: 178,
      gender: "Female",
      bio_raw: "",
      bio_curated: "",
      // An adult with a recorded date of birth — a minor cannot grant this
      // consent at all, so age must not be what fails these assertions.
      date_of_birth: "1996-04-02",
      ai_processing_consent: false,
      onboarding_completed_at: new Date().toISOString(),
    });
  }, 120000);

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  async function withSession() {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId,
        role: "TALENT",
        email: `comp-card-consent-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  async function setConsent(granted) {
    await knex("profiles").where({ id: profileId }).update({
      ai_processing_consent: granted,
    });
  }

  it("refuses a card image with 403 when image-processing consent is absent", async () => {
    await setConsent(false);
    const auth = await withSession();

    const res = await auth(
      request(app)
        .post("/api/talent/comp-card-import")
        .set("Accept", "application/json")
        .attach("card", PNG_BYTES, { filename: "card.png", contentType: "image/png" }),
    );

    expect(res.status).toBe(403);
    expect(res.body.details).toMatchObject({ code: CONSENT_CODE });
    // The message has to name the place the talent can act, or the 403 is a
    // dead end rather than a prompt.
    expect(res.body.error).toMatch(/Settings/i);
    expect(res.body.error).toMatch(/privacy/i);
  });

  it("writes no import row when the gate refuses", async () => {
    await setConsent(false);
    const auth = await withSession();

    await auth(
      request(app)
        .post("/api/talent/comp-card-import")
        .set("Accept", "application/json")
        .attach("card", PNG_BYTES, { filename: "card.png", contentType: "image/png" }),
    );

    // Nothing was sent to a model, so nothing may be recorded as an attempt to.
    const rows = await knex("comp_card_imports").where({ user_id: userId });
    expect(rows).toHaveLength(0);
  });

  it("lets a PDF through without consent — the text layer involves no AI", async () => {
    await setConsent(false);
    const auth = await withSession();

    const res = await auth(
      request(app)
        .post("/api/talent/comp-card-import")
        .set("Accept", "application/json")
        .attach("card", PDF_BYTES, {
          filename: "card.pdf",
          contentType: "application/pdf",
        }),
    );

    // 201 with an empty proposal is the documented "nothing read" outcome; the
    // point is that it is not a 403.
    expect(res.status).toBe(201);
    expect(res.body.details?.code).not.toBe(CONSENT_CODE);
  });

  it("passes the gate for a card image once consent is granted", async () => {
    await setConsent(true);
    const auth = await withSession();

    const res = await auth(
      request(app)
        .post("/api/talent/comp-card-import")
        .set("Accept", "application/json")
        .attach("card", PNG_BYTES, { filename: "card.png", contentType: "image/png" }),
    );

    // Groq is not configured under test, so extraction returns an empty
    // proposal — but it got past the gate, which is what is under test.
    expect(res.status).not.toBe(403);
  });
});
