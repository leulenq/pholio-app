// Comp card studio API: payload safety, perception cache ownership, scene
// validation (the server prints these in headless Chromium), and the public
// link's consent gate. PDF rendering itself is stubbed — it is covered by the
// browser battery, not by Jest.
"use strict";

jest.mock("../../src/domains/compcard/services/render-pdf", () => ({
  renderCardPdf: jest.fn(async () => Buffer.from("%PDF-1.4 stub")),
  rendererUrl: () => "http://stub",
}));

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("../../src/shared/lib/legal-acceptance");
const { sanitizeScene, SceneError } = require("../../src/domains/compcard/services/scene");
const { renderCardPdf } = require("../../src/domains/compcard/services/render-pdf");

const SESSION_SECRET = require("../../src/config").sessionSecret;
const SESSION_IDS = [];
const FIXTURES = [];

async function makeTalent({ dob = "1995-03-15" } = {}) {
  const userId = uuidv4();
  const profileId = uuidv4();
  await knex("users").insert({
    id: userId, email: `cc-${userId}@example.com`, password_hash: "x", role: "TALENT", email_verified: true,
    terms_accepted_at: knex.fn.now(), terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(), privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });
  await knex("profiles").insert({
    id: profileId, user_id: userId, slug: `cc-${profileId}`, first_name: "Card", last_name: "Tester",
    city: "Paris", height_cm: 178, bio_raw: "", bio_curated: "", date_of_birth: dob, onboarding_completed_at: knex.fn.now(),
  });
  const img = (extra) => ({ id: uuidv4(), profile_id: profileId, path: `/uploads/${uuidv4()}.webp`, sort: 0, status: "active", moderation_status: "approved", exclude_from_public: false, public_url: null, ...extra });
  const visible = img({ public_url: "https://media.example/visible.webp" });
  const hidden = img({ exclude_from_public: true });
  const pending = img({ moderation_status: "review" });
  await knex("images").insert([visible, hidden, pending]);
  const f = { userId, profileId, slug: `cc-${profileId}`, visible, hidden, pending };
  FIXTURES.push(f);
  return f;
}

async function withSession(f, req) {
  const sid = uuidv4();
  SESSION_IDS.push(sid);
  await knex("sessions").insert({
    sid,
    sess: { cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000).toISOString(), httpOnly: true, path: "/" }, userId: f.userId, role: "TALENT" },
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`).set("X-Pholio-Request", "same-origin").set("Origin", "http://localhost:3000");
}

function scene(imageId, extra = {}) {
  return {
    direction: "show",
    format: { id: "us" },
    pages: [
      {
        name: "front",
        paper: "#FFFFFF",
        elements: [
          { type: "photo", slot: "front", imageId, src: "https://evil.example/x.png", x: 6, y: 6, w: 127, h: 180, crop: { x: 0, y: 0, w: 1, h: 0.9 } },
          { type: "text", lines: ["Card Tester"], font: { family: "archivo", weight: 600, size: 17 }, color: "#0F0F0F", x: 6, y: 195, w: 60 },
        ],
      },
      { name: "back", paper: "#FFFFFF", elements: [{ type: "rule", x: 6, y: 200, w: 120, h: 0.2, fill: "#000000" }] },
    ],
    ...extra,
  };
}

beforeAll(async () => {
  await knex.migrate.latest();
});

afterAll(async () => {
  if (SESSION_IDS.length) await knex("sessions").whereIn("sid", SESSION_IDS).del();
  for (const f of FIXTURES) {
    await knex("comp_cards").where({ profile_id: f.profileId }).del().catch(() => {});
    await knex("image_cutouts").whereIn("image_id", [f.visible.id, f.hidden.id, f.pending.id]).del().catch(() => {});
    await knex("images").where({ profile_id: f.profileId }).del().catch(() => {});
    await knex("profiles").where({ id: f.profileId }).del().catch(() => {});
    await knex("users").where({ id: f.userId }).del().catch(() => {});
  }
  await knex.destroy();
});

describe("sanitizeScene", () => {
  const images = new Map([["a", { src: "https://media.example/a.webp" }]]);
  test("resolves photo URLs server-side and ignores client src", () => {
    const out = sanitizeScene(scene("a"), images);
    expect(out.pages[0].elements[0].src).toBe("https://media.example/a.webp");
  });
  test("rejects photos that are not the talent's", () => {
    expect(() => sanitizeScene(scene("zzz"), images)).toThrow(SceneError);
  });
  test("rejects unknown fonts, element types, colours and directions", () => {
    const bad = scene("a");
    bad.pages[0].elements[1].font.family = "Comic Sans";
    expect(() => sanitizeScene(bad, images)).toThrow(SceneError);
    const bad2 = scene("a");
    bad2.pages[0].elements.push({ type: "iframe", x: 0, y: 0, w: 1, h: 1 });
    expect(() => sanitizeScene(bad2, images)).toThrow(SceneError);
    const bad3 = scene("a");
    bad3.pages[0].paper = "red;background:url(x)";
    expect(() => sanitizeScene(bad3, images)).toThrow(SceneError);
    expect(() => sanitizeScene(scene("a", { direction: "canva" }), images)).toThrow(SceneError);
  });
  test("allows the new effects, rejects hostile CSS in them", () => {
    const ok = scene("a");
    ok.pages[0].elements.push({ type: "rect", x: 0, y: 0, w: 10, h: 10, gradient: "radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, transparent 70%)" });
    ok.pages[0].elements[0].fade = { b: 30 };
    ok.pages[0].elements[0].shadow = "drop-shadow(0 1mm 2.5mm rgba(0,0,0,0.18))";
    const out = sanitizeScene(ok, images);
    expect(out.pages[0].elements[0].fade).toEqual({ b: 30 });
    expect(out.pages[0].elements.at(-1).gradient).toMatch(/^radial-gradient/);
    const bad = scene("a");
    bad.pages[0].elements.push({ type: "rect", x: 0, y: 0, w: 10, h: 10, gradient: "url(https://evil.example/x.png)" });
    expect(() => sanitizeScene(bad, images)).toThrow(SceneError);
    const bad2 = scene("a");
    bad2.pages[0].elements[0].shadow = "drop-shadow(0 1mm 1mm red) url(x)";
    expect(sanitizeScene(bad2, images).pages[0].elements[0].shadow).toBeUndefined();
  });

  test("accepts rgba ink, rejects anything else in a colour", () => {
    const ok = scene("a");
    ok.pages[0].elements[1].color = "rgba(26,25,23,0.5)";
    expect(sanitizeScene(ok, images).pages[0].elements[1].color).toBe("rgba(26,25,23,0.5)");
    const bad = scene("a");
    bad.pages[0].elements[1].color = "rgba(0,0,0,1) url(x)";
    expect(() => sanitizeScene(bad, images)).toThrow(SceneError);
  });

  test("allows the wide tracking of spaced capitals", () => {
    const s = scene("a");
    s.pages[0].elements[1].font.tracking = 0.62;
    expect(sanitizeScene(s, images).pages[0].elements[1].font.tracking).toBe(0.62);
  });

  test("caps text length", () => {
    const s = scene("a");
    s.pages[0].elements[1].lines = ["x".repeat(5000)];
    expect(sanitizeScene(s, images).pages[0].elements[1].lines[0].length).toBe(240);
  });
});

describe("comp card studio API", () => {
  test("requires a talent session", async () => {
    const res = await request(app).get("/api/talent/compcard").set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  test("offers only photos that may appear on a public document", async () => {
    const f = await makeTalent();
    const res = await withSession(f, request(app).get("/api/talent/compcard"));
    expect(res.status).toBe(200);
    const ids = res.body.data.data.images.map((i) => i.id);
    expect(ids).toEqual([f.visible.id]);
    expect(res.body.data.data.profile).not.toHaveProperty("bio_raw");
  });

  test("perception can only be stored for the talent's own photos", async () => {
    const a = await makeTalent();
    const b = await makeTalent();
    const ok = await withSession(a, request(app).put(`/api/talent/compcard/perceptions/${a.visible.id}`).send({ version: 3, data: { faces: [] } }));
    expect(ok.status).toBe(200);
    const foreign = await withSession(a, request(app).put(`/api/talent/compcard/perceptions/${b.visible.id}`).send({ version: 3, data: { faces: [] } }));
    expect(foreign.status).toBe(404);
  });

  test("saves a valid card, refuses a hidden photo", async () => {
    const f = await makeTalent();
    const saved = await withSession(f, request(app).put("/api/talent/compcard").send({ settings: { direction: "show" }, scene: scene(f.visible.id) }));
    expect(saved.status).toBe(200);
    const row = await knex("comp_cards").where({ profile_id: f.profileId }).first();
    const stored = typeof row.scene === "string" ? JSON.parse(row.scene) : row.scene;
    expect(stored.pages[0].elements[0].src).toBe("https://media.example/visible.webp");
    const hidden = await withSession(f, request(app).put("/api/talent/compcard").send({ settings: {}, scene: scene(f.hidden.id) }));
    expect(hidden.status).toBe(400);
  });

  test("the public link serves the saved card and drops photos hidden since", async () => {
    const f = await makeTalent();
    await withSession(f, request(app).put("/api/talent/compcard").send({ settings: {}, scene: scene(f.visible.id) }));
    renderCardPdf.mockClear();
    const res = await request(app).get(`/compcard/${f.slug}.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf/);
    await knex("images").where({ id: f.visible.id }).update({ exclude_from_public: true });
    await request(app).get(`/pdf/${f.slug}`);
    const printed = renderCardPdf.mock.calls.at(-1)[0];
    expect(printed.pages[0].elements.some((e) => e.type === "photo")).toBe(false);
  });

  test("cutouts: stored for own photos only, PNG only, fetched back", async () => {
    const a = await makeTalent();
    const b = await makeTalent();
    const png = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]).toString("base64");
    const ok = await withSession(a, request(app).put(`/api/talent/compcard/cutouts/${a.visible.id}`).send({ version: 2, width: 10, height: 10, png }));
    expect(ok.status).toBe(200);
    const foreign = await withSession(a, request(app).put(`/api/talent/compcard/cutouts/${b.visible.id}`).send({ version: 2, width: 10, height: 10, png }));
    expect(foreign.status).toBe(404);
    const notPng = await withSession(a, request(app).put(`/api/talent/compcard/cutouts/${a.visible.id}`).send({ version: 2, width: 10, height: 10, png: "data:image/png;base64,AAAA" }));
    expect(notPng.status).toBe(400);
    const got = await withSession(a, request(app).get(`/api/talent/compcard/cutouts/${a.visible.id}`));
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toMatch(/png/);
    const theirs = await withSession(b, request(app).get(`/api/talent/compcard/cutouts/${a.visible.id}`));
    expect(theirs.status).toBe(404);
  });

  test("a minor's card is not public without guardian consent", async () => {
    // Launch is adults-only, so the studio refuses minors outright; a card
    // that exists anyway (e.g. from before) must still not be served.
    const f = await makeTalent({ dob: "2013-05-05" });
    const put = await withSession(f, request(app).put("/api/talent/compcard").send({ settings: {}, scene: scene(f.visible.id) }));
    expect(put.status).toBe(403);
    await knex("comp_cards").insert({ id: uuidv4(), profile_id: f.profileId, settings: "{}", scene: JSON.stringify(scene(f.visible.id)), created_at: new Date(), updated_at: new Date() });
    const res = await request(app).get(`/compcard/${f.slug}.pdf`);
    expect(res.status).toBe(403);
  });
});
