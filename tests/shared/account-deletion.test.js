jest.mock("../../src/shared/lib/uploader", () => ({
  s3: {
    send: jest.fn(),
  },
}));

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  deleteUser: jest.fn(),
}));

const { s3 } = require("../../src/shared/lib/uploader");
const { deleteUser } = require("../../src/domains/auth/services/firebase-admin");
const {
  buildAccountDeletionResponse,
  deleteUserAccount,
  processPendingDeletions,
} = require("../../src/shared/lib/account-deletion");

describe("buildAccountDeletionResponse", () => {
  it("returns 202 and a pending-erasure redirect when provider deletion is incomplete", () => {
    expect(buildAccountDeletionResponse({ deleted: true, fullyErased: false })).toEqual({
      status: 202,
      payload: {
        deleted: true,
        fullyErased: false,
        erasureStatus: "pending_provider_purge",
        redirect: "/login?erasure=pending",
      },
    });
  });

  it("returns 200 only for verified complete erasure", () => {
    expect(buildAccountDeletionResponse({ deleted: true, fullyErased: true })).toEqual({
      status: 200,
      payload: {
        deleted: true,
        fullyErased: true,
        erasureStatus: "complete",
        redirect: "/login",
      },
    });
  });
});

function createKnexMock(seed = {}, { tables } = {}) {
  const state = {
    users: [...(seed.users || [])],
    profiles: [...(seed.profiles || [])],
    images: [...(seed.images || [])],
    sessions: [...(seed.sessions || [])],
    moderation_queue: [...(seed.moderation_queue || [])],
    account_deletion_failures: [...(seed.account_deletion_failures || [])],
  };

  const existingTables = new Set([
    "users",
    "profiles",
    "images",
    "sessions",
    "moderation_queue",
    "account_deletion_failures",
    ...(tables || []),
  ]);

  const rowMatches = (row, whereClause) =>
    Object.entries(whereClause || {}).every(([key, value]) => row[key] === value);

  const knex = (tableName) => {
    let whereClause = null;

    const builder = {
      where(criteria) {
        whereClause = criteria || null;
        return builder;
      },
      first: async () => {
        const rows = state[tableName] || [];
        return rows.find((row) => rowMatches(row, whereClause));
      },
      select: async (...columns) => {
        const rows = (state[tableName] || []).filter((row) =>
          rowMatches(row, whereClause),
        );
        if (!columns.length) {
          return rows.map((row) => ({ ...row }));
        }
        return rows.map((row) => {
          const selected = {};
          for (const column of columns) {
            selected[column] = row[column];
          }
          return selected;
        });
      },
      del: async () => {
        const rows = state[tableName] || [];
        const remaining = rows.filter((row) => !rowMatches(row, whereClause));
        const deleted = rows.length - remaining.length;
        state[tableName] = remaining;
        return deleted;
      },
      insert: async (row) => {
        if (!state[tableName]) state[tableName] = [];
        const normalized = { ...row };
        for (const [key, value] of Object.entries(normalized)) {
          if (value === "NOW") normalized[key] = new Date().toISOString();
        }
        state[tableName].push(normalized);
        return [normalized.id];
      },
      update: async (updates) => {
        const rows = state[tableName] || [];
        let updatedCount = 0;
        for (const row of rows) {
          if (rowMatches(row, whereClause)) {
            Object.assign(row, updates);
            for (const [key, value] of Object.entries(row)) {
              if (value === "NOW") row[key] = new Date().toISOString();
            }
            updatedCount++;
          }
        }
        return updatedCount;
      },
    };

    return builder;
  };

  knex.schema = {
    hasTable: async (tableName) => existingTables.has(tableName),
  };
  knex.fn = { now: () => "NOW" };

  knex.__state = state;
  return knex;
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("orchestrates deletion when profile has no images and both provider purges succeed", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-1", firebase_uid: "firebase-1" }],
      profiles: [{ id: "profile-1", user_id: "user-1" }],
      images: [],
    });

    deleteUser.mockResolvedValue(undefined);

    const result = await deleteUserAccount(knex, "user-1");

    expect(deleteUser).toHaveBeenCalledWith("firebase-1");
    expect(s3.send).not.toHaveBeenCalled();
    expect(knex.__state.users).toEqual([]);
    expect(result).toMatchObject({
      deleted: true,
      userFound: true,
      imagesScanned: 0,
      r2KeysAttempted: 0,
      deletedR2Objects: 0,
      failedR2Objects: 0,
      firebaseAttempted: true,
      firebaseDeleted: true,
      fullyErased: true,
      pendingFailureIds: [],
    });
    expect(knex.__state.account_deletion_failures).toEqual([]);
  });

  it("deletes the DB row but reports partial erasure and durably records the failure when Firebase delete fails", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-2", firebase_uid: "firebase-2" }],
      profiles: [{ id: "profile-2", user_id: "user-2" }],
      images: [],
    });

    deleteUser.mockRejectedValue(new Error("firebase unavailable"));

    const result = await deleteUserAccount(knex, "user-2");

    expect(deleteUser).toHaveBeenCalledWith("firebase-2");
    // The DB row is still gone — Pholio's own systems no longer hold the
    // account — but the operation must NOT claim full erasure.
    expect(knex.__state.users).toEqual([]);
    expect(result.deleted).toBe(true);
    expect(result.firebaseAttempted).toBe(true);
    expect(result.firebaseDeleted).toBe(false);
    expect(result.fullyErased).toBe(false);
    expect(result.pendingFailureIds).toHaveLength(1);

    expect(knex.__state.account_deletion_failures).toHaveLength(1);
    expect(knex.__state.account_deletion_failures[0]).toMatchObject({
      user_id: "user-2",
      firebase_uid: "firebase-2",
      provider: "firebase",
      status: "pending",
    });
    expect(knex.__state.account_deletion_failures[0].last_error).toContain(
      "firebase unavailable",
    );
  });

  it("reports partial erasure and records failed keys for retry when R2 object deletes fail", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-3", firebase_uid: null }],
      profiles: [{ id: "profile-3", user_id: "user-3" }],
      images: [
        {
          profile_id: "profile-3",
          storage_key: "pholio-media/profile-3/originals/headshot.jpg",
        },
      ],
    });

    const originalBucket = require("../../src/config").r2.bucket;
    require("../../src/config").r2.bucket = "test-bucket";
    s3.send.mockRejectedValue(new Error("network error"));

    try {
      const result = await deleteUserAccount(knex, "user-3");

      expect(s3.send).toHaveBeenCalled();
      expect(knex.__state.users).toEqual([]);
      expect(result.fullyErased).toBe(false);
      expect(result.failedR2Objects).toBeGreaterThan(0);
      expect(result.pendingFailureIds).toHaveLength(1);

      expect(knex.__state.account_deletion_failures).toHaveLength(1);
      expect(knex.__state.account_deletion_failures[0]).toMatchObject({
        user_id: "user-3",
        provider: "r2",
        status: "pending",
      });
      const payload = JSON.parse(knex.__state.account_deletion_failures[0].payload);
      expect(Array.isArray(payload.failedKeys)).toBe(true);
      expect(payload.failedKeys.length).toBeGreaterThan(0);
    } finally {
      require("../../src/config").r2.bucket = originalBucket;
    }
  });

  it("cleans up sessions and moderation_queue rows that have no FK cascade, without touching unrelated rows", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-4", firebase_uid: null }],
      profiles: [{ id: "profile-4", user_id: "user-4" }],
      images: [],
      sessions: [
        { sid: "sid-mine", sess: JSON.stringify({ userId: "user-4" }), expired: null },
        { sid: "sid-other", sess: JSON.stringify({ userId: "user-other" }), expired: null },
      ],
      moderation_queue: [
        { id: "mod-1", profile_id: "profile-4", status: "pending" },
        { id: "mod-2", profile_id: "profile-other", status: "pending" },
      ],
    });

    const result = await deleteUserAccount(knex, "user-4");

    expect(result.fullyErased).toBe(true);
    expect(knex.__state.sessions).toEqual([
      { sid: "sid-other", sess: JSON.stringify({ userId: "user-other" }), expired: null },
    ]);
    expect(knex.__state.moderation_queue).toEqual([
      { id: "mod-2", profile_id: "profile-other", status: "pending" },
    ]);
  });

  it("does not throw when account_deletion_failures has not been migrated yet", async () => {
    const knex = createKnexMock(
      {
        users: [{ id: "user-5", firebase_uid: "firebase-5" }],
        profiles: [{ id: "profile-5", user_id: "user-5" }],
        images: [],
      },
      { tables: [] },
    );
    // Simulate the migration not having run: remove it from the known-table set.
    knex.schema.hasTable = async (tableName) =>
      tableName !== "account_deletion_failures";

    deleteUser.mockRejectedValue(new Error("firebase down"));

    const result = await deleteUserAccount(knex, "user-5");

    expect(knex.__state.users).toEqual([]);
    expect(result.fullyErased).toBe(false);
    expect(result.pendingFailureIds).toEqual([]);
  });
});

describe("processPendingDeletions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves pending R2 failure on successful retry", async () => {
    const knex = createKnexMock({
      account_deletion_failures: [
        {
          id: "fail-1",
          user_id: "user-1",
          provider: "r2",
          status: "pending",
          payload: JSON.stringify({ failedKeys: ["key-1", "key-2"] }),
          attempts: 1,
        },
      ],
    });

    const originalBucket = require("../../src/config").r2.bucket;
    require("../../src/config").r2.bucket = "test-bucket";
    s3.send.mockResolvedValue({});

    try {
      const result = await processPendingDeletions(knex);
      expect(result).toEqual({ processed: 1, resolved: 1, failed: 0 });
      expect(knex.__state.account_deletion_failures[0]).toMatchObject({
        id: "fail-1",
        status: "resolved",
        attempts: 2,
        payload: null,
        last_error: null,
      });
      expect(knex.__state.account_deletion_failures[0].resolved_at).toBeTruthy();
    } finally {
      require("../../src/config").r2.bucket = originalBucket;
    }
  });

  it("keeps failure pending and records remaining failed keys if R2 retry partially fails", async () => {
    const knex = createKnexMock({
      account_deletion_failures: [
        {
          id: "fail-2",
          user_id: "user-2",
          provider: "r2",
          status: "pending",
          payload: JSON.stringify({ failedKeys: ["key-1", "key-2"] }),
          attempts: 1,
        },
      ],
    });

    const originalBucket = require("../../src/config").r2.bucket;
    require("../../src/config").r2.bucket = "test-bucket";
    
    // First key succeeds, second fails
    s3.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("R2 down"));

    try {
      const result = await processPendingDeletions(knex);
      expect(result).toEqual({ processed: 1, resolved: 0, failed: 1 });
      expect(knex.__state.account_deletion_failures[0]).toMatchObject({
        id: "fail-2",
        status: "pending",
        attempts: 2,
        last_error: "1/2 object deletes failed",
      });
      const payload = JSON.parse(knex.__state.account_deletion_failures[0].payload);
      expect(payload.failedKeys).toEqual(["key-2"]);
    } finally {
      require("../../src/config").r2.bucket = originalBucket;
    }
  });

  it("resolves pending Firebase failure on successful retry", async () => {
    const knex = createKnexMock({
      account_deletion_failures: [
        {
          id: "fail-3",
          user_id: "user-3",
          firebase_uid: "fb-3",
          provider: "firebase",
          status: "pending",
          payload: null,
          attempts: 1,
        },
      ],
    });

    deleteUser.mockResolvedValue(undefined);

    const result = await processPendingDeletions(knex);
    expect(result).toEqual({ processed: 1, resolved: 1, failed: 0 });
    expect(deleteUser).toHaveBeenCalledWith("fb-3");
    expect(knex.__state.account_deletion_failures[0]).toMatchObject({
      status: "resolved",
      attempts: 2,
    });
  });

  it("resolves pending Firebase failure if user is not found (user-not-found)", async () => {
    const knex = createKnexMock({
      account_deletion_failures: [
        {
          id: "fail-4",
          user_id: "user-4",
          firebase_uid: "fb-4",
          provider: "firebase",
          status: "pending",
          payload: null,
          attempts: 1,
        },
      ],
    });

    const error = new Error("User deletion failed: auth/user-not-found");
    error.code = "auth/user-not-found";
    deleteUser.mockRejectedValue(error);

    const result = await processPendingDeletions(knex);
    expect(result).toEqual({ processed: 1, resolved: 1, failed: 0 });
    expect(knex.__state.account_deletion_failures[0]).toMatchObject({
      status: "resolved",
      attempts: 2,
    });
  });

  it("keeps Firebase failure pending on other errors", async () => {
    const knex = createKnexMock({
      account_deletion_failures: [
        {
          id: "fail-5",
          user_id: "user-5",
          firebase_uid: "fb-5",
          provider: "firebase",
          status: "pending",
          payload: null,
          attempts: 1,
        },
      ],
    });

    deleteUser.mockRejectedValue(new Error("connection timeout"));

    const result = await processPendingDeletions(knex);
    expect(result).toEqual({ processed: 1, resolved: 0, failed: 1 });
    expect(knex.__state.account_deletion_failures[0]).toMatchObject({
      status: "pending",
      attempts: 2,
      last_error: "connection timeout",
    });
  });
});
