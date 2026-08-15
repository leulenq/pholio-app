"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const knexFactory = require("knex");
const sharp = require("sharp");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const deliveryMigration = require("../../migrations/20260810121000_spec_registry_delivery_metadata");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const engagementMigration = require("../../migrations/20260814130000_spec_registry_engagement_events");
const delistingMigration = require("../../migrations/20260814131000_spec_registry_series_delisting");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");
const {
  buildSpecExport,
  encodeImage,
} = require("../../src/domains/spec-registry/export/spec-export-service");
const { listRegistryRoutes, preflightRegistry } = require("../../src/domains/spec-registry/preflight-service");

const registryRoot = path.join(__dirname, "..", "..", "data", "spec-registry", "v1");

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a0000000-0000-4000-8000-000000000002";
const FULL_LENGTH_ID = "a0000000-0000-4000-8000-000000000003";
const CLOSE_UP_ID = "a0000000-0000-4000-8000-000000000004";
const PROFILE_SHOT_ID = "a0000000-0000-4000-8000-000000000005";

const ELITE_SERIES = "elite-model-management-global:online";
const REFERENCE_DATE = "2026-08-14";

/** A confirmed shot type is what makes the matcher willing to place an image. */
const USER_CONFIRMED = JSON.stringify({
  ai: { classification: { source: "user", confirmed: true } },
});

let workingDirectory;

/**
 * Real image bytes, because the point of this pipeline is what Sharp produces.
 * Noise rather than flat colour: a solid image compresses to a few hundred
 * bytes and would make every size-limit assertion vacuous.
 */
async function writeImage(name, { width, height }) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 2654435761) % 256;
  }
  const file = path.join(workingDirectory, name);
  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100 })
    .toFile(file);
  return file;
}

async function createSchema(db) {
  await db.raw("PRAGMA foreign_keys = ON");
  await db.schema.createTable("agencies", (table) => {
    table.uuid("id").primary();
    table.string("name").notNullable();
    table.string("status").defaultTo("ACTIVE");
  });
  await db.schema.createTable("applications", (table) => {
    table.uuid("id").primary();
  });
  await db.schema.createTable("application_submission_requests", (table) => {
    table.uuid("id").primary();
  });
  await db.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.string("email").notNullable();
  });
  await db.schema.createTable("profiles", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users");
    table.string("first_name");
    table.string("last_name");
    table.string("city");
    table.date("date_of_birth");
    table.integer("height_cm");
    table.string("gender");
    table.string("work_eligibility");
  });
  await db.schema.createTable("images", (table) => {
    table.uuid("id").primary();
    table.uuid("profile_id").notNullable().references("id").inTable("profiles");
    table.string("status");
    table.boolean("exclude_from_agency").defaultTo(false);
    table.string("asset_kind");
    table.timestamp("retired_at");
    table.string("shot_type");
    table.timestamp("retouched_at");
    table.string("absolute_path", 500);
    table.text("metadata");
  });
  await persistenceMigration.up(db);
  await deliveryMigration.up(db);
  await agencyAuthoredMigration.up(db);
  await engagementMigration.up(db);
  await delistingMigration.up(db);
}

async function insertFixtures(db) {
  await db("users").insert({ id: USER_ID, email: "talent@example.test" });
  await db("profiles").insert({
    id: PROFILE_ID,
    user_id: USER_ID,
    first_name: "Mia",
    last_name: "Voss",
    city: "New York",
    // ISO strings, not Date objects: under Jest's VM realm knex's
    // `instanceof Date` check fails and it stores "[object Object]".
    date_of_birth: "2000-06-15",
    height_cm: 178,
    gender: "female",
    work_eligibility: "yes",
  });

  await db("images").insert([
    {
      id: FULL_LENGTH_ID,
      profile_id: PROFILE_ID,
      status: "active",
      asset_kind: "image",
      shot_type: "full_length",
      absolute_path: await writeImage("full.jpg", { width: 3200, height: 4800 }),
      metadata: USER_CONFIRMED,
    },
    {
      id: CLOSE_UP_ID,
      profile_id: PROFILE_ID,
      status: "active",
      asset_kind: "image",
      shot_type: "close_up",
      absolute_path: await writeImage("close.jpg", { width: 1200, height: 1600 }),
      metadata: USER_CONFIRMED,
    },
    {
      id: PROFILE_SHOT_ID,
      profile_id: PROFILE_ID,
      status: "active",
      asset_kind: "image",
      shot_type: "profile",
      absolute_path: await writeImage("profile.jpg", { width: 1200, height: 1560 }),
      metadata: USER_CONFIRMED,
    },
  ]);
}

/** Read the archive back with an implementation that is not the writer. */
function unzip(buffer) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-export-"));
  const archivePath = path.join(directory, "export.zip");
  fs.writeFileSync(archivePath, buffer);
  require("child_process").execFileSync("unzip", ["-qq", "-o", archivePath, "-d", directory], {
    stdio: "pipe",
  });
  const names = fs.readdirSync(directory).filter((name) => name !== "export.zip");
  const files = new Map(names.map((name) => [name, fs.readFileSync(path.join(directory, name))]));
  fs.rmSync(directory, { recursive: true, force: true });
  return files;
}

describe("spec-correct export — end to end", () => {
  // Real Sharp encoding of real photographs, several per test. The default 5s
  // budget is for tests that mock this away; this suite deliberately does not.
  jest.setTimeout(120_000);

  let db;
  let registry;

  beforeAll(() => {
    workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-export-src-"));
    registry = validateRegistry({ registryRoot, asOf: new Date(`${REFERENCE_DATE}T00:00:00.000Z`) });
  });

  afterAll(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await createSchema(db);
    await publishRegistry(db, registry);
    await insertFixtures(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("produces an archive named after Elite's published slots", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
      { referenceDate: REFERENCE_DATE },
    );

    expect(result.archiveName).toBe("elite-model-management-digitals.zip");
    const files = unzip(result.buffer);
    expect([...files.keys()].sort()).toEqual([
      "README.txt",
      "elite-model-management-close-up.jpg",
      "elite-model-management-full-length.jpg",
      "elite-model-management-profile.jpg",
    ]);
  });

  test("every file lands under the 5MB per-file limit Elite publishes", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
      { referenceDate: REFERENCE_DATE },
    );

    expect(result.manifest.perFileLimitBytes).toBe(5_000_000);
    for (const entry of result.manifest.entries) {
      expect(entry.bytes).toBeLessThanOrEqual(5_000_000);
      expect(entry.withinPublishedLimit).toBe(true);
    }
  });

  describe("the encode ladder", () => {
    test("descends until the file fits the published budget", async () => {
      const source = fs.readFileSync(path.join(workingDirectory, "full.jpg"));
      const budgetBytes = 400_000;
      const encoded = await encodeImage(sharp, source, {
        mimeType: "image/jpeg",
        budgetBytes,
      });
      expect(encoded.withinBudget).toBe(true);
      expect(encoded.data.length).toBeLessThanOrEqual(budgetBytes);
      // It got there by coming down the ladder, not by refusing to encode.
      expect(Math.max(encoded.width, encoded.height)).toBeLessThan(4800);
    });

    test("reports a budget it could not meet rather than claiming the set conforms", async () => {
      const source = fs.readFileSync(path.join(workingDirectory, "full.jpg"));
      // Below the bottom rung for a real photograph. The honest answer is the
      // smallest file it managed, flagged — not a silently dropped shot.
      const encoded = await encodeImage(sharp, source, {
        mimeType: "image/jpeg",
        budgetBytes: 2_000,
      });
      expect(encoded.withinBudget).toBe(false);
      expect(encoded.data.length).toBeGreaterThan(0);
      expect((await sharp(encoded.data).metadata()).format).toBe("jpeg");
    });

    test("bakes in EXIF orientation so a portrait photo does not arrive sideways", async () => {
      // Orientation 6 means "rotate 90° clockwise on display". Sharp strips
      // metadata on encode, so without an explicit rotate() the instruction is
      // lost and the image lands on its side at the agency.
      const rotated = await sharp(path.join(workingDirectory, "close.jpg"))
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const encoded = await encodeImage(sharp, rotated, {
        mimeType: "image/jpeg",
        budgetBytes: null,
      });
      // 1200×1600 displayed under orientation 6 is 1600×1200.
      expect(encoded.width).toBe(1600);
      expect(encoded.height).toBe(1200);
    });
  });

  test("re-encodes rather than passing the original through", async () => {
    const original = fs.statSync(path.join(workingDirectory, "full.jpg")).size;
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES, imageIds: [FULL_LENGTH_ID] },
      { referenceDate: REFERENCE_DATE },
    );
    const files = unzip(result.buffer);
    const encoded = files.get("elite-model-management-full-length.jpg");
    expect(encoded.length).not.toBe(original);
    // Still a real, decodable JPEG at a sane size.
    const meta = await sharp(encoded).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(4000);
  });

  test("applies no crop — the aspect ratio the talent shot is the aspect ratio they get", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES, imageIds: [FULL_LENGTH_ID] },
      { referenceDate: REFERENCE_DATE },
    );
    const encoded = unzip(result.buffer).get("elite-model-management-full-length.jpg");
    const meta = await sharp(encoded).metadata();
    // Source was 3200×4800, exactly 2:3.
    expect(meta.width / meta.height).toBeCloseTo(3200 / 4800, 3);
  });

  test("carries the provenance inside the archive", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const readme = unzip(result.buffer).get("README.txt").toString("utf8");

    expect(readme).toContain("Elite Model Management");
    expect(readme).toContain("not affiliated with Elite Model Management");
    expect(readme).toContain("No cropping was applied");
    expect(readme).toMatch(/https?:\/\//);
    expect(readme).toContain(REFERENCE_DATE);
  });

  test("refuses to build a set when nothing matches a published shot", async () => {
    await db("images").update({ metadata: JSON.stringify({}) });
    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SPEC_EXPORT_EMPTY", status: 422 });
  });

  test("refuses an image the talent excluded from agency use", async () => {
    await db("images").where({ id: CLOSE_UP_ID }).update({ exclude_from_agency: true });
    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: ELITE_SERIES, imageIds: [CLOSE_UP_ID] },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SELECTED_IMAGES_UNAVAILABLE" });
  });

  test("ships the rest of the set when one original cannot be read", async () => {
    await db("images").where({ id: CLOSE_UP_ID }).update({ absolute_path: "/nonexistent/x.jpg" });
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const files = unzip(result.buffer);
    expect(files.has("elite-model-management-close-up.jpg")).toBe(false);
    expect(files.has("elite-model-management-full-length.jpg")).toBe(true);
    expect(result.manifest.unavailable.map((entry) => entry.slotLabel)).toEqual(["close-up"]);
    expect(files.get("README.txt").toString("utf8")).toContain("Could not be read");
  });

  test("the export and the requirements check agree, because one path computes both", async () => {
    // The surface hands both calls the same explicit selection, so the test does.
    const imageIds = [FULL_LENGTH_ID, CLOSE_UP_ID, PROFILE_SHOT_ID];
    const [exported, preflight] = await Promise.all([
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: ELITE_SERIES, imageIds },
        { referenceDate: REFERENCE_DATE },
      ),
      preflightRegistry(
        db,
        { profileId: PROFILE_ID, seriesId: ELITE_SERIES, imageIds },
        { referenceDate: REFERENCE_DATE },
      ),
    ]);
    const evaluation = preflight.results[0];
    expect(exported.manifest.revisionId).toBe(evaluation.revisionId);
    expect(exported.manifest.entries).toHaveLength(evaluation.shotCoverage.matched);
  });

  test("a delisted agency disappears from the directory, the check and the export", async () => {
    const before = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(before.routes.map((route) => route.seriesId)).toContain(ELITE_SERIES);

    await db("spec_registry_series")
      .where({ series_id: ELITE_SERIES })
      .update({ delisted_at: new Date().toISOString(), delisted_reason: "Asked by email" });

    const after = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(after.routes.map((route) => route.seriesId)).not.toContain(ELITE_SERIES);

    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SPEC_REGISTRY_ROUTE_NOT_FOUND" });

    // Nothing was destroyed — the published record survives for the evidence
    // trail behind snapshots that already cite it.
    const row = await db("spec_registry_series").where({ series_id: ELITE_SERIES }).first();
    expect(row.delisted_reason).toBe("Asked by email");
  });

  test("relisting restores the route", async () => {
    await db("spec_registry_series")
      .where({ series_id: ELITE_SERIES })
      .update({ delisted_at: new Date().toISOString() });
    await db("spec_registry_series")
      .where({ series_id: ELITE_SERIES })
      .update({ delisted_at: null, delisted_reason: null });

    const routes = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(routes.routes.map((route) => route.seriesId)).toContain(ELITE_SERIES);
  });

  test("the whole registry still reads on a database without the delisting column", async () => {
    // A deploy can be one migration behind. The directory going dark would be
    // far worse than a delisting landing a moment late.
    const legacy = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await legacy.raw("PRAGMA foreign_keys = ON");
    await legacy.schema.createTable("agencies", (table) => {
      table.uuid("id").primary();
      table.string("name").notNullable();
      table.string("status").defaultTo("ACTIVE");
    });
    await legacy.schema.createTable("applications", (table) => table.uuid("id").primary());
    await legacy.schema.createTable("application_submission_requests", (table) =>
      table.uuid("id").primary(),
    );
    await persistenceMigration.up(legacy);
    await deliveryMigration.up(legacy);
    await agencyAuthoredMigration.up(legacy);
    await publishRegistry(legacy, registry);

    const routes = await listRegistryRoutes(legacy, { referenceDate: REFERENCE_DATE });
    expect(routes.routes.map((route) => route.seriesId)).toContain(ELITE_SERIES);
    await legacy.destroy();
  });

  test("uses a unique name per file, so the archive cannot silently lose a shot", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: ELITE_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const names = result.manifest.entries.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
