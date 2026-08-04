// The dev email/password login is hard-gated behind this flag (see
// isDevLoginEnabled in domains/auth/routes/auth.js) and is the only way to
// establish a session without a real Firebase token. Set before src/app loads.
const PREVIOUS_AUTH_PASSTHROUGH_ENABLED =
  process.env.AUTH_PASSTHROUGH_ENABLED;
process.env.AUTH_PASSTHROUGH_ENABLED = "1";

const request = require("supertest");
const {
  useIsolatedDatabase,
  migrateAndSeed,
  dropIsolatedDatabase,
} = require("./setup/isolated-db");

/* Own database, resolved before src/shared/db/knex is required below.
 *
 * This suite needs the seed dataset (elara-k, talent@example.com), and used to
 * get it by rolling the SHARED run database back to zero and re-migrating it —
 * destroying the fixtures of every suite that ran first, and replaying table
 * rebuilds over leftover rows when the rollback only partly succeeded. */
const DB_FILE = useIsolatedDatabase("app");

const knex = require("../src/shared/db/knex");
const app = require("../src/app");

beforeAll(async () => {
  await migrateAndSeed(knex);
}, 60000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
  if (PREVIOUS_AUTH_PASSTHROUGH_ENABLED === undefined) {
    delete process.env.AUTH_PASSTHROUGH_ENABLED;
  } else {
    process.env.AUTH_PASSTHROUGH_ENABLED = PREVIOUS_AUTH_PASSTHROUGH_ENABLED;
  }
});

describe("ZipSite application", () => {
  /* RETIRED — targets a removed endpoint.
     This asserted a server-rendered form POST to /login returning a 302.
     /login is now an SPA route (src/app.js) and authentication moved to
     Firebase ID tokens, so no such handler exists. The behaviour it covered
     lives in tests/security/talent-login-onboarding-redirect.test.js. */
  test.skip("login redirects to the correct dashboard", async () => {
    const response = await request(app)
      .post("/login")
      .type("form")
      .send({ email: "agency@example.com", password: "password123" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/dashboard/agency");
  });

  /* RETIRED — targets a removed endpoint.
     This asserted a server-rendered form POST to /apply creating an account.
     /apply is now an SPA route and signup goes through /casting/entry with a
     Firebase token. The successor end-to-end path is
     tests/e2e-casting-to-dashboard.test.js; upload coverage is in
     tests/talent/media-packages.test.js and media-bulk.test.js, and PDF
     coverage in src/domains/pdf/__tests__. */
  test.skip("apply flow creates a profile, upload works, and PDF is available", async () => {
    const agent = request.agent(app);
    const email = `talent-${Date.now()}@example.com`;

    const applyResponse = await agent.post("/apply").type("form").send({
      first_name: "Nova",
      last_name: "Lane",
      email,
      password: "password123",
      city: "Brooklyn, NY",
      height_cm: 176,
      measurements: "32-24-34",
      bio: "Nova brings runway poise and creative thinking to every set.",
      partner_agency_email: "agency@example.com",
    });

    expect(applyResponse.status).toBe(303);
    expect(applyResponse.headers.location).toContain("/dashboard/talent");

    const user = await knex("users").where({ email }).first();
    const profile = await knex("profiles").where({ user_id: user.id }).first();
    expect(profile).toBeTruthy();
    expect(profile.bio_curated).toMatch(/Nova/);

    const buffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .webp()
      .toBuffer();

    const uploadResponse = await agent
      .post("/upload")
      .field("label", "Headshot")
      .attach("file", buffer, { filename: "headshot.webp" });

    expect(uploadResponse.status).toBe(200);

    const images = await knex("images").where({ profile_id: profile.id });
    expect(images.length).toBeGreaterThan(0);

    const pdfResponse = await agent.get(`/pdf/${profile.slug}`);
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
  });

  test("pdf view exposes resolved comp-card metadata in diagnostics JSON", async () => {
    const response = await request(app).get(
      "/pdf/view/elara-k?seed=meta-seed-42&layoutFamily=runway-split&styleVariant=dark-room&diagnostics=1",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body.ok).toBe(true);
    expect(response.body.compCard).toEqual(
      expect.objectContaining({
        seed: "meta-seed-42",
        layoutFamily: "runway-split",
        layoutFamilyLabel: "Runway Split",
        styleVariant: "dark-room",
        styleVariantLabel: "Dark Room",
      }),
    );
  });

  test("pdf view HTML response includes comp-card metadata headers", async () => {
    const response = await request(app).get(
      "/pdf/view/elara-k?seed=header-seed-7&layoutFamily=mosaic-horizontal&styleVariant=linework",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["x-compcard-seed"]).toBe("header-seed-7");
    expect(response.headers["x-compcard-layout-family"]).toBe(
      "mosaic-horizontal",
    );
    expect(response.headers["x-compcard-style-variant"]).toBe("linework");
    expect(response.headers["x-compcard-layout-family-label"]).toBe(
      "Mosaic Horizontal",
    );
    expect(response.headers["x-compcard-style-variant-label"]).toBe("Linework");
  });

  test("talent can manage comp-card presets via backend API", async () => {
    const agent = request.agent(app);
    // Password login moved to /api/dev/login and returns JSON, not a redirect.
    const loginResponse = await agent
      .post("/api/dev/login")
      .send({ email: "talent@example.com", password: "password123" })
      .expect(200);

    /* The session cookie carries Domain=localhost (see cookie-domain.js) while
       supertest talks to 127.0.0.1, so superagent's jar refuses to replay it
       and every follow-up request arrives unauthenticated. Carry the cookie by
       hand — the same workaround tests/e2e-casting-to-dashboard.test.js uses. */
    const sessionCookie = (loginResponse.headers["set-cookie"] || []).map(
      (cookie) => cookie.split(";")[0],
    );
    expect(sessionCookie.length).toBeGreaterThan(0);
    const auth = (req) => req.set("Cookie", sessionCookie);

    const talentUser = await knex("users")
      .where({ email: "talent@example.com" })
      .first();
    const profile = await knex("profiles")
      .where({ user_id: talentUser.id })
      .first();
    expect(profile?.slug).toBeTruthy();

    const createResponse = await auth(
      agent.post(`/api/pdf/presets/${profile.slug}`),
    ).send({
      name: "Board A",
      seed: "seed:board-a",
      layoutFamily: "runway-split",
      styleVariant: "dark-room",
      lockHeroId: "hero-1",
      lockGridIds: ["grid-1", "grid-2"],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.ok).toBe(true);
    expect(createResponse.body.preset).toEqual(
      expect.objectContaining({
        name: "Board A",
        layoutFamily: "runway-split",
        styleVariant: "dark-room",
      }),
    );
    const presetId = createResponse.body.preset.id;
    expect(presetId).toBeTruthy();

    const listResponse = await auth(
      agent.get(`/api/pdf/presets/${profile.slug}`),
    );
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.presets)).toBe(true);
    expect(
      listResponse.body.presets.some((preset) => preset.id === presetId),
    ).toBe(true);

    const applyResponse = await auth(
      agent.post(`/api/pdf/presets/${profile.slug}/${presetId}/apply`),
    );
    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body.ok).toBe(true);
    expect(applyResponse.body.query).toEqual(
      expect.objectContaining({
        seed: "seed:board-a",
        layoutFamily: "runway-split",
        styleVariant: "dark-room",
        lockHeroId: "hero-1",
      }),
    );

    const updateResponse = await auth(
      agent.put(`/api/pdf/presets/${profile.slug}/${presetId}`),
    ).send({
      name: "Board A Updated",
      seed: "seed:board-b",
      layoutFamily: "mosaic-horizontal",
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.preset.name).toBe("Board A Updated");
    expect(updateResponse.body.preset.layoutFamily).toBe("mosaic-horizontal");

    const revisionsResponse = await auth(
      agent.get(`/api/pdf/presets/${profile.slug}/${presetId}/revisions`),
    );
    expect(revisionsResponse.status).toBe(200);
    expect(Array.isArray(revisionsResponse.body.revisions)).toBe(true);
    expect(revisionsResponse.body.revisions.length).toBeGreaterThanOrEqual(2);
    const targetRevisionId = revisionsResponse.body.revisions.find(
      (revision) =>
        revision.snapshot &&
        revision.snapshot.name === "Board A" &&
        revision.snapshot.seed === "seed:board-a",
    )?.id;
    expect(targetRevisionId).toBeTruthy();

    const rollbackResponse = await auth(
      agent.post(`/api/pdf/presets/${profile.slug}/${presetId}/rollback`),
    ).send({ revisionId: targetRevisionId });
    expect(rollbackResponse.status).toBe(200);
    expect(rollbackResponse.body.ok).toBe(true);
    expect(rollbackResponse.body.preset.name).toBe("Board A");
    expect(rollbackResponse.body.preset.seed).toBe("seed:board-a");

    const exportResponse = await auth(
      agent.get(`/api/pdf/presets/${profile.slug}/${presetId}/export`),
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.ok).toBe(true);
    expect(exportResponse.body.preset.payload).toEqual(
      expect.objectContaining({
        name: "Board A",
        seed: "seed:board-a",
      }),
    );

    const importResponse = await auth(
      agent.post(`/api/pdf/presets/${profile.slug}/import`),
    ).send({
      preset: {
        ...exportResponse.body.preset,
        payload: {
          ...exportResponse.body.preset.payload,
          name: "Board Imported",
        },
      },
    });
    expect(importResponse.status).toBe(201);
    expect(importResponse.body.ok).toBe(true);
    expect(importResponse.body.status).toBe("created");
    expect(importResponse.body.preset.name).toBe("Board Imported");

    const importConflictResponse = await auth(
      agent.post(`/api/pdf/presets/${profile.slug}/import`),
    ).send({
      payload: exportResponse.body.preset.payload,
      overwriteExisting: "false",
    });
    expect(importConflictResponse.status).toBe(409);
    expect(importConflictResponse.body.code).toBe("PRESET_NAME_CONFLICT");

    const deleteResponse = await auth(
      agent.delete(`/api/pdf/presets/${profile.slug}/${presetId}`),
    );
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);
  });
});
