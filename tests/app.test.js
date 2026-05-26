const request = require("supertest");
const sharp = require("sharp");
const knex = require("../src/shared/db/knex");
const app = require("../src/app");

beforeAll(async () => {
  // Clear any stale migration locks before starting
  try {
    await knex.raw(
      "UPDATE knex_migrations_lock SET is_locked = 0 WHERE is_locked = 1",
    );
  } catch (err) {
    // Lock table might not exist yet, that's okay
  }

  try {
    // Rollback all migrations first
    await knex.migrate.rollback({}, true);
  } catch (err) {
    // If rollback fails, clear lock and continue
    try {
      await knex.raw("UPDATE knex_migrations_lock SET is_locked = 0");
    } catch (unlockErr) {
      // Ignore
    }
  }

  // Run migrations
  await knex.migrate.latest();
  await knex.seed.run();
}, 30000); // 30 second timeout for migrations

afterAll(async () => {
  await knex.destroy();
});

describe("ZipSite application", () => {
  test("login redirects to the correct dashboard", async () => {
    const response = await request(app)
      .post("/login")
      .type("form")
      .send({ email: "agency@example.com", password: "password123" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/dashboard/agency");
  });

  test("apply flow creates a profile, upload works, and PDF is available", async () => {
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
    await agent
      .post("/login")
      .type("form")
      .send({ email: "talent@example.com", password: "password123" })
      .expect(302);

    const talentUser = await knex("users")
      .where({ email: "talent@example.com" })
      .first();
    const profile = await knex("profiles")
      .where({ user_id: talentUser.id })
      .first();
    expect(profile?.slug).toBeTruthy();

    const createResponse = await agent
      .post(`/api/pdf/presets/${profile.slug}`)
      .send({
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

    const listResponse = await agent.get(`/api/pdf/presets/${profile.slug}`);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.presets)).toBe(true);
    expect(
      listResponse.body.presets.some((preset) => preset.id === presetId),
    ).toBe(true);

    const applyResponse = await agent.post(
      `/api/pdf/presets/${profile.slug}/${presetId}/apply`,
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

    const updateResponse = await agent
      .put(`/api/pdf/presets/${profile.slug}/${presetId}`)
      .send({
        name: "Board A Updated",
        seed: "seed:board-b",
        layoutFamily: "mosaic-horizontal",
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.preset.name).toBe("Board A Updated");
    expect(updateResponse.body.preset.layoutFamily).toBe("mosaic-horizontal");

    const revisionsResponse = await agent.get(
      `/api/pdf/presets/${profile.slug}/${presetId}/revisions`,
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

    const rollbackResponse = await agent
      .post(`/api/pdf/presets/${profile.slug}/${presetId}/rollback`)
      .send({ revisionId: targetRevisionId });
    expect(rollbackResponse.status).toBe(200);
    expect(rollbackResponse.body.ok).toBe(true);
    expect(rollbackResponse.body.preset.name).toBe("Board A");
    expect(rollbackResponse.body.preset.seed).toBe("seed:board-a");

    const exportResponse = await agent.get(
      `/api/pdf/presets/${profile.slug}/${presetId}/export`,
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.ok).toBe(true);
    expect(exportResponse.body.preset.payload).toEqual(
      expect.objectContaining({
        name: "Board A",
        seed: "seed:board-a",
      }),
    );

    const importResponse = await agent
      .post(`/api/pdf/presets/${profile.slug}/import`)
      .send({
        payload: {
          ...exportResponse.body.preset.payload,
          name: "Board Imported",
        },
      });
    expect(importResponse.status).toBe(201);
    expect(importResponse.body.ok).toBe(true);
    expect(importResponse.body.status).toBe("created");
    expect(importResponse.body.preset.name).toBe("Board Imported");

    const deleteResponse = await agent.delete(
      `/api/pdf/presets/${profile.slug}/${presetId}`,
    );
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);
  });

  test("agency can claim and upgrade creates commission", async () => {
    const talentAgent = request.agent(app);
    await talentAgent
      .post("/login")
      .type("form")
      .send({ email: "talent@example.com", password: "password123" })
      .expect(302);

    const talentUser = await knex("users")
      .where({ email: "talent@example.com" })
      .first();
    const profile = await knex("profiles")
      .where({ user_id: talentUser.id })
      .first();

    const agencyAgent = request.agent(app);
    await agencyAgent
      .post("/login")
      .type("form")
      .send({ email: "agency@example.com", password: "password123" })
      .expect(302);

    await agencyAgent
      .post("/agency/claim")
      .send({ slug: profile.slug })
      .expect(200);

    const upgradeResponse = await talentAgent.get("/pro/upgrade");
    expect(upgradeResponse.status).toBe(302);

    const refreshedProfile = await knex("profiles")
      .where({ id: profile.id })
      .first();
    expect(refreshedProfile.is_pro).toBe(true);

    const commission = await knex("commissions")
      .where({ profile_id: profile.id })
      .first();
    expect(commission).toBeTruthy();
    expect(commission.amount_cents).toBeGreaterThan(0);
  });
});
