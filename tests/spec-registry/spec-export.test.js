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
const { sniffMimeType } = require("../../src/domains/spec-registry/export/export-plan");
const { listRegistryRoutes, preflightRegistry } = require("../../src/domains/spec-registry/preflight-service");

const registryRoot = path.join(__dirname, "..", "..", "data", "spec-registry", "v1");

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a0000000-0000-4000-8000-000000000002";
const FULL_LENGTH_ID = "a0000000-0000-4000-8000-000000000003";
const CLOSE_UP_ID = "a0000000-0000-4000-8000-000000000004";
const PROFILE_SHOT_ID = "a0000000-0000-4000-8000-000000000005";

const FORD_SERIES = "ford-models:selected-city-online";
/** The one published route whose channel is an inbox rather than a form. */
const MUSE_SERIES = "muse-model-management-nyc:email";
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
    // The measurements STATS.txt is built from. An agency asks for these in the
    // same breath as the images, so the export carries both.
    table.integer("bust_cm");
    table.integer("chest_cm");
    table.integer("waist_cm");
    table.integer("hips_cm");
    table.string("shoe_size");
    table.string("dress_size");
    table.string("suit_size");
    table.string("hair_color");
    table.string("eye_color");
  });
  await db.schema.createTable("social_accounts", (table) => {
    table.uuid("id").primary();
    table.uuid("profile_id").notNullable().references("id").inTable("profiles");
    table.string("platform");
    table.string("handle");
    table.string("url");
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
    bust_cm: 86,
    waist_cm: 61,
    hips_cm: 89,
    shoe_size: "40",
    dress_size: "4",
    hair_color: "Brown",
    eye_color: "Green",
  });
  await db("social_accounts").insert({
    id: "a0000000-0000-4000-8000-000000000009",
    profile_id: PROFILE_ID,
    platform: "instagram",
    handle: "miavoss",
    url: "https://www.instagram.com/miavoss",
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

  test("produces an archive named after Ford's published slots", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );

    expect(result.archiveName).toBe("ford-models-digitals.zip");
    const files = unzip(result.buffer);
    expect([...files.keys()].sort()).toEqual([
      "README.txt",
      "STATS.txt",
      "ford-models-close-up.jpg",
      "ford-models-full-length.jpg",
      "ford-models-profile.jpg",
    ]);
    // Ford takes applications through a form, so there is nothing to draft.
    expect(files.has("EMAIL.txt")).toBe(false);
  });

  test("every file lands under the 3MB per-file limit Ford publishes", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );

    // Ford publishes "under 3MB" with a strict less-than, so the computed
    // ceiling is one byte short of the published value.
    expect(result.manifest.perFileLimitBytes).toBe(2_999_999);
    for (const entry of result.manifest.entries) {
      expect(entry.bytes).toBeLessThanOrEqual(2_999_999);
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
      { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds: [FULL_LENGTH_ID] },
      { referenceDate: REFERENCE_DATE },
    );
    const files = unzip(result.buffer);
    const encoded = files.get("ford-models-full-length.jpg");
    expect(encoded.length).not.toBe(original);
    // Still a real, decodable JPEG at a sane size.
    const meta = await sharp(encoded).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(4000);
  });

  test("applies no crop — the aspect ratio the talent shot is the aspect ratio they get", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds: [FULL_LENGTH_ID] },
      { referenceDate: REFERENCE_DATE },
    );
    const encoded = unzip(result.buffer).get("ford-models-full-length.jpg");
    const meta = await sharp(encoded).metadata();
    // Source was 3200×4800, exactly 2:3.
    expect(meta.width / meta.height).toBeCloseTo(3200 / 4800, 3);
  });

  test("carries the provenance inside the archive", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const readme = unzip(result.buffer).get("README.txt").toString("utf8");

    expect(readme).toContain("Ford Models");
    expect(readme).toContain("not affiliated with Ford Models");
    expect(readme).toContain("No cropping was applied");
    expect(readme).toMatch(/https?:\/\//);
    expect(readme).toContain(REFERENCE_DATE);
  });

  test("refuses to build a set when nothing matches a published shot", async () => {
    await db("images").update({ metadata: JSON.stringify({}) });
    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SPEC_EXPORT_EMPTY", status: 422 });
  });

  test("refuses an image the talent excluded from agency use", async () => {
    await db("images").where({ id: CLOSE_UP_ID }).update({ exclude_from_agency: true });
    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds: [CLOSE_UP_ID] },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SELECTED_IMAGES_UNAVAILABLE" });
  });

  test("ships the rest of the set when one original cannot be read", async () => {
    await db("images").where({ id: CLOSE_UP_ID }).update({ absolute_path: "/nonexistent/x.jpg" });
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const files = unzip(result.buffer);
    expect(files.has("ford-models-close-up.jpg")).toBe(false);
    expect(files.has("ford-models-full-length.jpg")).toBe(true);
    expect(result.manifest.unavailable.map((entry) => entry.slotLabel)).toEqual(["Close-up"]);
    expect(files.get("README.txt").toString("utf8")).toContain("Could not be read");
  });

  test("ships the rest of the set when one original cannot be decoded", async () => {
    // Readable bytes that are not an image. `fetchImageBuffer` hands these over
    // happily — the unreadable-source check above only catches an empty read —
    // so the failure surfaces inside Sharp, mid-archive. One undecodable file
    // must cost the talent that file, not the entire download.
    const corrupt = path.join(workingDirectory, "corrupt.jpg");
    fs.writeFileSync(corrupt, Buffer.from("this is not a JPEG, it is prose", "utf8"));
    await db("images").where({ id: CLOSE_UP_ID }).update({ absolute_path: corrupt });

    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );

    const files = unzip(result.buffer);
    expect(files.has("ford-models-close-up.jpg")).toBe(false);
    expect(files.has("ford-models-full-length.jpg")).toBe(true);
    // Same shape as an unreadable source — the manifest names what is missing
    // rather than the set silently arriving one shot short.
    expect(result.manifest.unavailable.map((entry) => entry.slotLabel)).toEqual(["Close-up"]);
    expect(files.get("README.txt").toString("utf8")).toContain("Could not be read");
  });

  test("the export and the requirements check agree, because one path computes both", async () => {
    // The surface hands both calls the same explicit selection, so the test does.
    const imageIds = [FULL_LENGTH_ID, CLOSE_UP_ID, PROFILE_SHOT_ID];
    const [exported, preflight] = await Promise.all([
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds },
        { referenceDate: REFERENCE_DATE },
      ),
      preflightRegistry(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds },
        { referenceDate: REFERENCE_DATE },
      ),
    ]);
    const evaluation = preflight.results[0];
    expect(exported.manifest.revisionId).toBe(evaluation.revisionId);
    expect(exported.manifest.entries).toHaveLength(evaluation.shotCoverage.matched);
  });

  test("a delisted agency disappears from the directory, the check and the export", async () => {
    const before = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(before.routes.map((route) => route.seriesId)).toContain(FORD_SERIES);

    await db("spec_registry_series")
      .where({ series_id: FORD_SERIES })
      .update({ delisted_at: new Date().toISOString(), delisted_reason: "Asked by email" });

    const after = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(after.routes.map((route) => route.seriesId)).not.toContain(FORD_SERIES);

    await expect(
      buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES },
        { referenceDate: REFERENCE_DATE },
      ),
    ).rejects.toMatchObject({ code: "SPEC_REGISTRY_ROUTE_NOT_FOUND" });

    // Nothing was destroyed — the published record survives for the evidence
    // trail behind snapshots that already cite it.
    const row = await db("spec_registry_series").where({ series_id: FORD_SERIES }).first();
    expect(row.delisted_reason).toBe("Asked by email");
  });

  test("relisting restores the route", async () => {
    await db("spec_registry_series")
      .where({ series_id: FORD_SERIES })
      .update({ delisted_at: new Date().toISOString() });
    await db("spec_registry_series")
      .where({ series_id: FORD_SERIES })
      .update({ delisted_at: null, delisted_reason: null });

    const routes = await listRegistryRoutes(db, { referenceDate: REFERENCE_DATE });
    expect(routes.routes.map((route) => route.seriesId)).toContain(FORD_SERIES);
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
    expect(routes.routes.map((route) => route.seriesId)).toContain(FORD_SERIES);
    await legacy.destroy();
  });

  test("uses a unique name per file, so the archive cannot silently lose a shot", async () => {
    const result = await buildSpecExport(
      db,
      { profileId: PROFILE_ID, seriesId: FORD_SERIES },
      { referenceDate: REFERENCE_DATE },
    );
    const names = result.manifest.entries.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * A conforming set of images is only half of what an agency asks for. The
   * other half is the digits, and a talent who has already given Pholio their
   * measurements should never retype them into an agency's form.
   */
  describe("STATS.txt", () => {
    async function statsFor(seriesId = FORD_SERIES) {
      const result = await buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId },
        { referenceDate: REFERENCE_DATE },
      );
      return {
        result,
        text: unzip(result.buffer).get("STATS.txt").toString("utf8"),
      };
    }

    test("carries the measurements in both units, as an agency writes them", async () => {
      const { text } = await statsFor();
      expect(text).toContain("Mia Voss");
      expect(text).toMatch(/^Height\s+178 cm \/ 5'10"$/m);
      expect(text).toMatch(/^Bust\s+86 cm \/ 34"$/m);
      expect(text).toMatch(/^Waist\s+61 cm \/ 24"$/m);
      expect(text).toMatch(/^Hips\s+89 cm \/ 35"$/m);
      expect(text).toMatch(/^Shoe\s+40$/m);
      expect(text).toMatch(/^Hair\s+Brown$/m);
      expect(text).toMatch(/^Eyes\s+Green$/m);
      expect(text).toMatch(/^Based in\s+New York$/m);
      expect(text).toMatch(/^Instagram\s+@miavoss$/m);
    });

    test("lists the files it was written for, at the bottom", async () => {
      const { result, text } = await statsFor();
      const listStart = text.indexOf("Files included");
      expect(listStart).toBeGreaterThan(text.indexOf("Instagram"));
      for (const entry of result.manifest.entries) {
        expect(text.slice(listStart)).toContain(entry.name);
      }
      // The packing slip names the images, not itself.
      expect(text).not.toContain("STATS.txt");
    });

    test("omits a measurement the talent has not given, rather than placeholding it", async () => {
      await db("profiles")
        .where({ id: PROFILE_ID })
        .update({ hips_cm: null, shoe_size: null, eye_color: null });
      const { text } = await statsFor();
      expect(text).not.toMatch(/^Hips/m);
      expect(text).not.toMatch(/^Shoe/m);
      expect(text).not.toMatch(/^Eyes/m);
      expect(text).toMatch(/^Waist\s+61 cm \/ 24"$/m);
      expect(text).not.toMatch(/(?:—|n\/a|N\/A|TBD)/);
    });

    test("is written for the email route too", async () => {
      const { text } = await statsFor(MUSE_SERIES);
      expect(text).toContain("Mia Voss");
      expect(text).toMatch(/^Height\s+178 cm/m);
    });
  });

  /**
   * Muse publishes an inbox, not a form. For those routes the archive alone is
   * not a deliverable — the talent still has to write the mail, which is the
   * point at which a first-time applicant either writes a fan letter or gives
   * up. Pholio drafts it; Pholio does not send it.
   */
  describe("EMAIL.txt", () => {
    async function museExport() {
      const result = await buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: MUSE_SERIES },
        { referenceDate: REFERENCE_DATE },
      );
      return { result, files: unzip(result.buffer) };
    }

    test("is written only for the route whose channel is an inbox", async () => {
      const { files, result } = await museExport();
      expect(files.has("EMAIL.txt")).toBe(true);
      expect(result.manifest.emailDraftIncluded).toBe(true);

      const ford = await buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES },
        { referenceDate: REFERENCE_DATE },
      );
      expect(unzip(ford.buffer).has("EMAIL.txt")).toBe(false);
      expect(ford.manifest.emailDraftIncluded).toBe(false);
    });

    test("points at the address Muse publishes, and invents nothing", async () => {
      const { files } = await museExport();
      const draft = files.get("EMAIL.txt").toString("utf8");
      const registrySpec = JSON.parse(
        fs.readFileSync(
          path.join(registryRoot, "specs", "muse-model-management-nyc-email--r1.json"),
          "utf8",
        ),
      );
      const channelUrl = registrySpec.scope.channel.url;

      expect(registrySpec.scope.channel.type).toBe("official_email");
      expect(draft.split("\n")[0]).toContain(channelUrl);
      // The v1 schema publishes a page, not a mailbox. A guessed address would
      // be a submission the talent believes arrived and which went nowhere.
      expect(draft).not.toMatch(/[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    });

    test("names what is attached, carries the stats, and signs off", async () => {
      const { files, result } = await museExport();
      const draft = files.get("EMAIL.txt").toString("utf8");
      const stats = files.get("STATS.txt").toString("utf8");

      expect(draft).toContain("Subject: Model submission — Mia Voss, 178 cm / 5'10\", New York");
      expect(draft).toContain(`${result.manifest.entries.length === 1 ? "Attached is one digital" : "Attached are"}`);
      expect(draft).toContain("Muse Model Management publishes.");
      // The same block the archive ships as STATS.txt, minus its file list.
      expect(stats).toContain(draft.match(/^Height\s+.*$/m)[0]);
      expect(draft.trimEnd().split("\n").pop()).toBe("Mia Voss");
    });

    test("stays factual — no pitch, no claim Pholio cannot substantiate", async () => {
      const { files } = await museExport();
      const draft = files.get("EMAIL.txt").toString("utf8");
      for (const phrase of [
        /I'?d love to/i,
        /I would love/i,
        /excited/i,
        /thrilled/i,
        /passionate/i,
        /dream/i,
        /amazing/i,
        /perfect fit/i,
        /honou?red/i,
        /please consider/i,
        /look forward to hearing/i,
      ]) {
        expect(draft).not.toMatch(phrase);
      }
    });

    test("the README says the draft is there and that the talent sends it", async () => {
      const { files } = await museExport();
      const readme = files.get("README.txt").toString("utf8");
      expect(readme).toContain("EMAIL.txt");
      expect(readme).toContain("STATS.txt");
      expect(readme).toMatch(/Send it yourself/);
      expect(readme).toMatch(/Pholio does not send anything on your behalf/);
    });

    test("the README tells an email route to attach, not to upload", async () => {
      const { files } = await museExport();
      const readme = files.get("README.txt").toString("utf8");
      expect(readme).toContain("Attach them to the email drafted in");
      expect(readme).not.toContain("Upload them on the agency's own site");

      const ford = await buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES },
        { referenceDate: REFERENCE_DATE },
      );
      const fordReadme = unzip(ford.buffer).get("README.txt").toString("utf8");
      expect(fordReadme).toContain("Upload them on the agency's own site");
      expect(fordReadme).not.toContain("EMAIL.txt");
    });
  });

  /**
   * HEIC, explicitly.
   *
   * Every recent iPhone shoots HEIC by default and virtually no agency intake
   * accepts it, which makes it the format most likely to need the transcode
   * this export performs — and the one whose support is a property of the
   * deployed libvips rather than of Sharp's API. Both outcomes are correct
   * behaviour and both are asserted; what would not be correct is the export
   * 500ing, or the file vanishing from the set without a word.
   */
  describe("HEIC input", () => {
    const HEIC_FIXTURE = path.join(__dirname, "..", "fixtures", "heic", "sample.heic");
    let heic;
    let heicPath;
    let decodeAvailable;

    /**
     * Whether this runtime can decode HEVC-in-HEIF — established by decoding,
     * not by asking.
     *
     * `metadata()` is not the probe: it succeeds on a runtime with no HEVC
     * decoder at all, because the ISO container parses without the codec. Only
     * an attempt to produce pixels answers the question.
     */
    async function heicDecodeAvailable(buffer) {
      try {
        await sharp(buffer).jpeg().toBuffer();
        return true;
      } catch {
        return false;
      }
    }

    /**
     * A freshly-encoded HEIC where libvips can write one, the committed sample
     * everywhere else. Generating is preferred so the test is not pinned to one
     * file forever; the sniff check means a generated file that is not actually
     * HEIC-branded falls back rather than quietly testing the wrong format.
     */
    async function heicSource() {
      const pixels = Buffer.alloc(320 * 320 * 3);
      for (let index = 0; index < pixels.length; index += 1) {
        pixels[index] = (index * 2654435761) % 256;
      }
      try {
        const generated = await sharp(pixels, { raw: { width: 320, height: 320, channels: 3 } })
          .heif({ compression: "hevc", quality: 80 })
          .toBuffer();
        if (sniffMimeType(generated) === "image/heic") return generated;
      } catch {
        // libvips built without an HEVC encoder, which is the common case.
      }
      return fs.readFileSync(HEIC_FIXTURE);
    }

    beforeAll(async () => {
      heic = await heicSource();
      decodeAvailable = await heicDecodeAvailable(heic);
    });

    beforeEach(async () => {
      heicPath = path.join(workingDirectory, "close.heic");
      fs.writeFileSync(heicPath, heic);
      await db("images").where({ id: CLOSE_UP_ID }).update({ absolute_path: heicPath });
    });

    test("the fixture really is HEVC-coded HEIF, not an AVIF wearing the extension", async () => {
      expect(sniffMimeType(heic)).toBe("image/heic");
      const meta = await sharp(heic).metadata();
      expect(meta.format).toBe("heif");
      expect(meta.compression).toBe("hevc");
    });

    // One test, two correct outcomes, because which one is correct is a fact
    // about the runtime. Naming the branch in the title would be a lie on half
    // the machines that run it — the assertions inside carry the distinction.
    test(
      "a HEIC is transcoded to an accepted format, or named as undecodable — never silently dropped",
      async () => {
        const result = await buildSpecExport(
          db,
          { profileId: PROFILE_ID, seriesId: FORD_SERIES },
          { referenceDate: REFERENCE_DATE },
        );
        const files = unzip(result.buffer);
        const closeUp = "ford-models-close-up.jpg";

        if (decodeAvailable) {
          // Ford route publishes no accepted-format rule, so any format change
          // change format — and the entry has to say so, under a .jpg name.
          expect(files.has(closeUp)).toBe(true);
          expect((await sharp(files.get(closeUp)).metadata()).format).toBe("jpeg");

          const entry = result.manifest.entries.find((item) => item.name === closeUp);
          expect(entry).toMatchObject({
            sourceMimeType: "image/heic",
            mimeType: "image/jpeg",
            transcoded: true,
          });
          expect(entry.transcodeReason).toBe("source_format_not_accepted");
          expect(result.manifest.unavailable).toHaveLength(0);
        } else {
          // No HEVC decoder here. The honest answer is the rest of the set plus
          // a named absence and a reason the talent can act on.
          expect(files.has(closeUp)).toBe(false);
          const missing = result.manifest.unavailable.find(
            (item) => item.slotLabel === "Close-up",
          );
          expect(missing).toMatchObject({
            reason: "heic_decode_unsupported",
            sourceMimeType: "image/heic",
          });
          expect(files.get("README.txt").toString("utf8")).toContain(
            "this server cannot open HEIC files",
          );
        }

        // True either way, and the point of the whole design: one awkward file
        // never costs the talent the download.
        expect(files.has("ford-models-full-length.jpg")).toBe(true);
        expect(files.has("STATS.txt")).toBe(true);
      },
    );

    test("the transcode target is read from the spec, not assumed", async () => {
      const result = await buildSpecExport(
        db,
        { profileId: PROFILE_ID, seriesId: FORD_SERIES, imageIds: [FULL_LENGTH_ID] },
        { referenceDate: REFERENCE_DATE },
      );
      // A JPEG into a JPEG archive: re-encoded for the byte cap and the
      // orientation bake, but explicitly not a format change.
      expect(result.manifest.entries[0]).toMatchObject({
        sourceMimeType: "image/jpeg",
        mimeType: "image/jpeg",
        transcoded: false,
        transcodeReason: "already_target_format",
      });
    });
  });
});
