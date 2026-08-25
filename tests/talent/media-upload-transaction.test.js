"use strict";

/**
 * POST /api/talent/media — transaction boundary and failure semantics.
 *
 * The upload used to run Sharp, three R2 PutObjects, the moderation provider
 * and the CSAM screen INSIDE `knex.transaction`, pinning one of five pooled
 * Postgres connections for the whole 26s Lambda budget. That work now happens
 * before the transaction opens, which moves the failure modes around:
 *
 *   - bytes reach storage before the row reaches the database, so a failure
 *     must compensate by deleting the objects (no row ever points at nothing,
 *     and no object is left behind on the paths we control);
 *   - the response is now built from what actually committed, so a commit that
 *     does not land must 500 rather than return 200 with phantom image ids.
 *
 * These tests cover exactly those behaviours, plus the unchanged fail-closed
 * moderation posture.
 */

const mockProcessImage = jest.fn();
const mockPurge = jest.fn().mockResolvedValue(undefined);
const mockAnalyzeImageBuffer = jest.fn();

jest.mock("../../src/shared/lib/uploader", () => {
  const actual = jest.requireActual("../../src/shared/lib/uploader");
  const multer = require("multer");
  return {
    ...actual,
    // Memory storage so the suite never writes stray files into public/uploads.
    upload: multer({ storage: multer.memoryStorage() }),
    processImage: (...args) => mockProcessImage(...args),
  };
});

jest.mock("../../src/shared/lib/purge-image-artifacts", () => ({
  purgeStoredImageArtifacts: (...args) => mockPurge(...args),
}));

jest.mock("../../src/shared/lib/content-moderation", () => {
  const actual = jest.requireActual("../../src/shared/lib/content-moderation");
  return {
    ...actual,
    analyzeImageBuffer: (...args) => mockAnalyzeImageBuffer(...args),
  };
});

jest.mock("../../src/domains/talent/services/pits-queue", () => ({
  enqueuePitsJob: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/domains/talent/services/matte-precompute", () => ({
  enqueueMattePrecompute: jest.fn(),
}));

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  recordLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");
const {
  MODERATION_STATUS,
} = jest.requireActual("../../src/shared/lib/content-moderation");

const SESSION_SECRET = require("../../src/config").sessionSecret;

// A one-pixel PNG is enough: processImage is mocked, so the bytes are only
// carried far enough to satisfy multer's mimetype filter.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Storage fields processImage would return for a successful R2 upload. */
function storedFor(n) {
  return {
    path: `https://cdn.test/processed/${n}.webp`,
    publicUrl: `https://cdn.test/processed/${n}.webp`,
    storageKey: `profiles/test/processed/${n}.webp`,
    absolutePath: null,
    imageIntel: { width: 1200, height: 1600 },
    deliveryMimeType: "image/webp",
    deliverySizeBytes: 1234,
    deliveryWidthPx: 1200,
    deliveryHeightPx: 1600,
    processedBuffer: PNG_BYTES,
  };
}

const APPROVED = {
  status: MODERATION_STATUS.APPROVED,
  reason: null,
  flags: {},
};

describe("talent media upload — transaction boundary and failure semantics", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const sessionIds = [];
  let auth;

  // Pool occupancy sampled at the moment each file is encoded/uploaded. The
  // whole point of the restructure is that this is zero.
  let poolUsedDuringPrepare = [];

  beforeAll(async () => {
    await knex.migrate.latest();

    await knex("users").insert({
      id: userId,
      email: `media-txn-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `media-txn-${profileId}`,
      first_name: "Txn",
      last_name: "Talent",
      city: "Test",
      date_of_birth: "1990-01-01",
      gender: "Female",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });

    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId,
        role: "TALENT",
        email: `media-txn-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `connect.sid=s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    auth = (req) => req.set("Cookie", signed);
  });

  afterAll(async () => {
    await knex("images").where({ profile_id: profileId }).delete();
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").where({ id: userId }).delete();
    await knex.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPurge.mockResolvedValue(undefined);
    poolUsedDuringPrepare = [];
    await knex("images").where({ profile_id: profileId }).delete();

    let n = 0;
    mockProcessImage.mockImplementation(async () => {
      poolUsedDuringPrepare.push(knex.client.pool.numUsed());
      return storedFor((n += 1));
    });
    mockAnalyzeImageBuffer.mockResolvedValue(APPROVED);
  });

  function upload(fileCount) {
    let req = auth(request(app).post("/api/talent/media"));
    for (let i = 0; i < fileCount; i += 1) {
      req = req.attach("media", PNG_BYTES, {
        filename: `shot-${i + 1}.png`,
        contentType: "image/png",
      });
    }
    return req;
  }

  test("commits every prepared row and reports the committed sort/hero", async () => {
    const res = await upload(2);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.images).toHaveLength(2);

    const rows = await knex("images")
      .where({ profile_id: profileId })
      .orderBy("sort", "asc");
    expect(rows).toHaveLength(2);

    // The payload is now assembled from the committed rows, so sort and
    // is_primary cannot drift from the database (they used to be the values
    // assigned before normalizeProfileImageSort and the hero fallback ran).
    for (const image of res.body.images) {
      const row = rows.find((r) => r.id === image.id);
      expect(row).toBeDefined();
      expect(image.sort).toBe(row.sort);
      expect(image.is_primary).toBe(!!row.is_primary);
    }
    expect(rows.filter((r) => r.is_primary)).toHaveLength(1);
  });

  test("encoding, storage and moderation hold no pooled DB connection", async () => {
    const res = await upload(3);

    expect(res.status).toBe(200);
    expect(poolUsedDuringPrepare).toHaveLength(3);
    // A single checked-out connection here is the production bug: on Netlify
    // the pool is max 5 and this phase can run for tens of seconds.
    expect(Math.max(...poolUsedDuringPrepare)).toBe(0);
  });

  test("a moderation rejection is never persisted and its bytes are purged", async () => {
    mockAnalyzeImageBuffer
      .mockResolvedValueOnce(APPROVED)
      .mockResolvedValueOnce({
        status: MODERATION_STATUS.REJECTED,
        reason: "explicit_content",
        flags: {},
      });

    const res = await upload(2);

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.failedFiles).toHaveLength(1);
    expect(res.body.failedFiles[0].message).toMatch(/content moderation/i);

    const rows = await knex("images").where({ profile_id: profileId });
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_key).toBe("profiles/test/processed/1.webp");

    // Only the rejected file's bytes are removed; the accepted one is kept.
    expect(mockPurge).toHaveBeenCalledTimes(1);
    expect(mockPurge).toHaveBeenCalledWith(
      expect.objectContaining({ storage_key: "profiles/test/processed/2.webp" }),
    );
  });

  test("a moderation error still fails closed to review, not approve", async () => {
    mockAnalyzeImageBuffer.mockRejectedValueOnce(new Error("provider timeout"));

    const res = await upload(1);

    expect(res.status).toBe(200);
    const rows = await knex("images").where({ profile_id: profileId });
    expect(rows).toHaveLength(1);
    expect(rows[0].moderation_status).toBe(MODERATION_STATUS.REVIEW);
    // The hero fallback still runs so the owner has a cover image, and the
    // response reports the committed truth rather than a stale `false`.
    expect(!!rows[0].is_primary).toBe(true);
    expect(res.body.images[0].is_primary).toBe(true);
    expect(res.body.images[0].moderation_status).toBe(MODERATION_STATUS.REVIEW);
  });

  test("a storage failure aborts the batch and leaves no orphaned objects", async () => {
    mockProcessImage
      .mockImplementationOnce(async () => {
        poolUsedDuringPrepare.push(knex.client.pool.numUsed());
        return storedFor(1);
      })
      .mockImplementationOnce(async () => {
        throw new Error("R2 PutObject failed");
      });

    const res = await upload(2);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);

    // Nothing committed...
    const rows = await knex("images").where({ profile_id: profileId });
    expect(rows).toHaveLength(0);
    // ...and the bytes the first file already wrote are compensated for, so
    // storage does not accumulate objects no row will ever reference.
    expect(mockPurge).toHaveBeenCalledWith(
      expect.objectContaining({ storage_key: "profiles/test/processed/1.webp" }),
    );
  });

  test("a commit that does not land fails the request instead of returning 200", async () => {
    // Simulates the open production defect: knex resolves the transaction (so
    // it believes COMMIT succeeded) while the rows are not readable afterwards.
    const realTransaction = knex.transaction;
    Object.defineProperty(knex, "transaction", {
      configurable: true,
      writable: true,
      value: async function patchedTransaction(...args) {
        const result = await realTransaction.apply(knex, args);
        await knex("images").where({ profile_id: profileId }).del();
        return result;
      },
    });

    let res;
    try {
      res = await upload(2);
    } finally {
      Object.defineProperty(knex, "transaction", {
        configurable: true,
        writable: false,
        enumerable: true,
        value: realTransaction,
      });
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.images).toBeUndefined();
    expect(res.body.failedFiles).toHaveLength(2);

    // Both uploads are unreferenced now, so both are purged.
    expect(mockPurge).toHaveBeenCalledWith(
      expect.objectContaining({ storage_key: "profiles/test/processed/1.webp" }),
    );
    expect(mockPurge).toHaveBeenCalledWith(
      expect.objectContaining({ storage_key: "profiles/test/processed/2.webp" }),
    );
  });
});
