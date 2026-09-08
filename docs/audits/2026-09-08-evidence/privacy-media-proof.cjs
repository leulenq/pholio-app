"use strict";
// Offline adversarial proofs. Loads real modules with explicit inert dependency
// seams: no application config, .env, database, network, browser or storage I/O.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../..");
const silentConsole = { log() {}, warn() {}, error() {} };
function load(relative, dependencies, env = {}) {
  const file = path.join(root, relative);
  const module = { exports: {} };
  const context = { module, exports: module.exports, Buffer, URL, Date, Set, Map,
    setTimeout, clearTimeout, console: silentConsole, process: { env, cwd: () => root },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (["path", "crypto", "url"].includes(name)) return require(name);
      throw new Error(`Unexpected dependency: ${name} in ${relative}`);
    } };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return module.exports;
}
const noop = () => {};
const middleware = () => noop;
function routerHarness() {
  const routes = [];
  const router = { use: noop };
  for (const method of ["get", "post", "put", "patch", "delete"])
    router[method] = (url, ...handlers) => routes.push({ method, url, handler: handlers.at(-1) });
  return { routes, express: { Router: () => router } };
}
function response() {
  return { statusCode: 200, body: null, status(n) { this.statusCode = n; return this; },
    json(value) { this.body = value; return this; } };
}

async function proveReplaceBypass() {
  const harness = routerHarness();
  const row = { id: "12345678-1234-4123-8123-123456789abc", profile_id: "profile",
    user_id: "owner", date_of_birth: "1990-01-01", ai_processing_consent: false,
    path: "https://media.invalid/old.webp", storage_key: "pholio-media/prod/profiles/profile/processed/old.webp",
    moderation_status: "approved", exclude_from_public: false, exclude_from_agency: false,
    metadata: "{}", is_primary: false };
  let moderationCalls = 0;
  const deletes = [];
  const db = (table) => {
    const q = {};
    for (const method of ["select", "leftJoin", "where", "whereNot", "orderBy"])
      q[method] = () => q;
    q.first = async () => table === "images" ? row : null;
    q.update = async (patch) => { Object.assign(row, patch); return 1; };
    q.delete = async () => { row.deleted = true; return 1; };
    return q;
  };
  db.schema = { hasTable: async () => false };
  db.fn = { now: () => "2026-09-08T00:00:00.000Z" };
  db.transaction = (fn) => fn(db);
  const deps = {
    express: harness.express, "../../../shared/db/knex": db,
    "../../auth/middleware/require-auth": { requireRole: middleware, requireActiveAccount: middleware },
    "../../../shared/lib/uploader": { upload: { array: middleware, single: middleware },
      processImage: async () => ({ path: "https://media.invalid/new.webp", publicUrl: "https://media.invalid/new.webp",
        storageKey: "pholio-media/prod/profiles/profile/processed/new.webp", processedBuffer: Buffer.from("new-unreviewed-pixels") }),
      s3: { send: async (cmd) => { deletes.push(cmd.input.Key); } } },
    "@aws-sdk/client-s3": { DeleteObjectCommand: class { constructor(input) { this.input = input; } } },
    uuid: { v4: () => "test-uuid" }, fs: { promises: { unlink: async () => {} } },
    "../../../config": { nodeEnv: "production", isServerless: true, r2: { bucket: "mock" } },
    "../../../shared/lib/slugify": {}, "../services/shared-utils": {},
    "../../../shared/services/notify-profile-readiness": { captureSubmissionReadiness: async () => false,
      notifyIfSubmissionReadinessLost: async () => {} },
    "../../../shared/middleware/error-handler": { asyncHandler: (fn) => fn },
    "../../../shared/lib/validation": {},
    "../services/run-image-classification": { imageAiProcessingAllowed: () => false },
    "../services/pits-queue": {},
    "../services/discover-reindex-hooks": { scheduleDiscoverReindex: noop },
    "../services/matte-precompute": { enqueueMattePrecompute: noop },
    "../services/image-classification-policy": {}, "../../../shared/lib/talent-age": {},
    "../../../shared/lib/fetch-image-buffer": {}, "../../../shared/lib/account-avatar": {},
    "../../ai/analyzeProfileImage": {},
    "../../../shared/lib/content-moderation": { analyzeImageBuffer: async () => { moderationCalls++; return { status: "review" }; } },
    "../../../shared/lib/csam-moderation": { screenImageForCsam: async () => { moderationCalls++; return { shouldEscalate: true }; } },
    "../../../shared/lib/purge-image-artifacts": {}, "../../../shared/lib/submission-retention": {},
  };
  load("src/domains/talent/routes/media.js", deps);
  const route = harness.routes.find((r) => r.method === "post" && r.url === "/:id/replace");
  const res = response();
  await route.handler({ params: { id: row.id }, session: { userId: "owner" }, file: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(row.path, "https://media.invalid/new.webp");
  assert.equal(row.moderation_status, "approved");
  assert.equal(row.exclude_from_public, false);
  assert.equal(moderationCalls, 0);
  console.log("PASS: replacement changes pixels, retains approved/public flags, calls neither moderation nor CSAM.");
  const originalKey = row.original_storage_key;
  await harness.routes.find((r) => r.method === "delete" && r.url === "/:id").handler(
    { params: { id: row.id }, session: { userId: "owner" } }, response());
  assert.equal(row.deleted, true);
  assert(!deletes.includes(originalKey));
  assert(!deletes.some((key) => key === "pholio-media/prod/profiles/profile/originals/new.webp"));
  console.log("PASS: deleting replaced image forgets pre-edit object and original WebP; DB row is removed.");
}

async function proveRawOriginal() {
  const puts = [];
  const sharp = require(path.join(root, "node_modules/sharp"));
  const raw = await sharp({ create: { width: 30, height: 30, channels: 3, background: "red" } })
    .jpeg().withExif({ IFD0: { Artist: "PRIVATE_METADATA_SENTINEL" } }).toBuffer();
  const config = { nodeEnv: "production", isServerless: true, r2: { bucket: "mock", publicUrl: "https://media.invalid" } };
  const multer = () => ({});
  multer.memoryStorage = () => ({});
  const mod = load("src/shared/lib/uploader.js", {
    fs: {}, multer, "multer-s3": noop, "./lazy-sharp": { requireSharp: () => sharp }, "../../config": config,
    uuid: { v4: () => "public-known-uuid" },
    "@aws-sdk/client-s3": { S3Client: class { async send(cmd) { puts.push(cmd.input); } },
      PutObjectCommand: class { constructor(input) { this.input = input; } }, GetObjectCommand: class {} },
    "../../domains/pdf/composition/image-forensics": { measureImage: async () => null },
    "../../domains/pdf/composition/perception/matte": { computeBestMatte: async () => null },
  });
  const result = await mod.processImage({ buffer: raw, mimetype: "image/jpeg", originalname: "photo.jpg" }, "profile");
  const inferredKey = new URL(result.publicUrl).pathname.slice(1).replace("/processed/", "/originals/").replace(/\.webp$/, ".jpg");
  const original = puts.find((p) => p.Key === inferredKey);
  assert(original);
  assert.equal(Buffer.compare(original.Body, raw), 0);
  assert((await sharp(original.Body).metadata()).exif.includes(Buffer.from("PRIVATE_METADATA_SENTINEL")));
  assert.equal((await sharp(result.processedBuffer).metadata()).exif, undefined);
  console.log("PASS: public processed URL derives raw-original key; original retains EXIF while processed image strips it.");
}

async function proveJuryBoundary() {
  let providerRequest;
  const jury = load("src/domains/pdf/composition/front-program/jury.js", {
    "../../../../config": { groq: { visionModel: "mock-vision" } },
    "groq-sdk": class { constructor() { this.chat = { completions: { create: async (request) => {
      providerRequest = request;
      return { choices: [{ message: { content: "{}" } }] };
    } } }; } },
  }, { GROQ_API_KEY: "nonsecret-offline-placeholder" });
  await jury.rankFrontCandidates({ candidates: [{ program: {}, score: 1 }, { program: {}, score: 2 }],
    renderPng: async () => Buffer.from("synthetic-card-photo-and-name") });
  const imageParts = providerRequest.messages[1].content.filter((part) => part.type === "image_url");
  assert.equal(imageParts.length, 2);
  assert(imageParts[0].image_url.url.includes(Buffer.from("synthetic-card-photo-and-name").toString("base64")));
  console.log("PASS: real jury provider boundary sends screenshots without receiving any owner consent or age context.");
}

async function proveExternalCardRetention() {
  const harness = routerHarness();
  const commands = [];
  let storedRow;
  const db = (table) => {
    const q = { where: () => q, whereNull: () => q,
      first: async () => ({ id: "minor-profile" }),
      insert: async (row) => { storedRow = row; },
      update: async (patch) => { Object.assign(storedRow, patch); return 1; } };
    return q;
  };
  const multer = () => ({ single: middleware });
  multer.memoryStorage = () => ({});
  load("src/domains/talent/routes/external-comp-cards.js", {
    fs: {}, express: harness.express, multer, uuid: { v4: () => "external-card" },
    "@aws-sdk/client-s3": { S3Client: class { async send(command) { commands.push(command.input); } },
      PutObjectCommand: class { constructor(input) { this.input = input; } } },
    "../../../config": { nodeEnv: "production", r2: { bucket: "mock", publicUrl: "https://media.invalid" } },
    "../../../shared/db/knex": db,
    "../../auth/middleware/require-auth": { requireRole: middleware },
    "../../../shared/middleware/error-handler": { asyncHandler: (fn) => fn },
    "../../../shared/lib/api-response": { success: (res, body, status = 200) => res.status(status).json(body),
      error: () => { throw new Error("unexpected validation error"); } },
  });
  // Harmless intentionally malformed PDF: verifies only magic is checked.
  const bytes = Buffer.from("%PDF-not-a-valid-document-at-all");
  const res = response();
  await harness.routes.find((r) => r.method === "post").handler({
    session: { userId: "owner" }, file: { buffer: bytes, mimetype: "application/pdf", originalname: "card.pdf", size: bytes.length },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(Buffer.compare(commands[0].Body, bytes), 0);
  await harness.routes.find((r) => r.method === "delete").handler({
    session: { userId: "owner" }, params: { id: storedRow.id },
  }, response());
  assert(storedRow.deleted_at);
  assert.equal(commands.length, 1);
  console.log("PASS: external card stores raw magic-prefixed bytes publicly; deleting returns success without storage deletion.");
}

function proveMinorWebhookDisclosure() {
  const { buildPayload } = load("src/domains/agency/services/export-webhook-dispatch.js", {
    "./export-webhook": {},
  });
  const payload = buildPayload({ agencyId: "agency", application: { id: "submission", profile_id: "teen", status: "pending" },
    profile: { date_of_birth: "2010-01-01", guardian_consent_at: "2026-01-01", first_name: "Teen", last_name: "Fixture",
      email: "teen@example.invalid", phone: "+12025550101" } });
  assert.equal(payload.applicant.phone, "+12025550101");
  assert.equal(payload.applicant.email, "teen@example.invalid");
  console.log("PASS: webhook payload exports minor phone/email unredacted despite submission snapshot contact=null.");
}

(async () => {
  await proveReplaceBypass();
  await proveRawOriginal();
  await proveJuryBoundary();
  await proveExternalCardRetention();
  proveMinorWebhookDisclosure();
})().catch((error) => { console.error(error); process.exitCode = 1; });
