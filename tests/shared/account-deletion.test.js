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
const { deleteUserAccount } = require("../../src/shared/lib/account-deletion");

function createKnexMock(seed = {}) {
  const state = {
    users: [...(seed.users || [])],
    profiles: [...(seed.profiles || [])],
    images: [...(seed.images || [])],
  };

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
    };

    return builder;
  };

  knex.__state = state;
  return knex;
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("orchestrates deletion when profile has no images", async () => {
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
    });
  });

  it("continues deleting DB user when Firebase delete fails", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-2", firebase_uid: "firebase-2" }],
      profiles: [{ id: "profile-2", user_id: "user-2" }],
      images: [],
    });

    deleteUser.mockRejectedValue(new Error("firebase unavailable"));

    const result = await deleteUserAccount(knex, "user-2");

    expect(deleteUser).toHaveBeenCalledWith("firebase-2");
    expect(knex.__state.users).toEqual([]);
    expect(result.deleted).toBe(true);
    expect(result.firebaseAttempted).toBe(true);
    expect(result.firebaseDeleted).toBe(false);
  });
});
