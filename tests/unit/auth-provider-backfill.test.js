/**
 * Sign-in provider backfill.
 *
 * Settings describes how an account signs in, and the fallback it renders when
 * the provider is unknown used to be "Email and password" — a statement that is
 * false for every Google account that had not signed in since the column was
 * added. These pin the resolution: Firebase is the authority, the answer is
 * persisted once, and an unresolvable account stays null rather than being
 * declared a password login.
 */

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  getUser: jest.fn(),
}));

const { getUser } = require("../../src/domains/auth/services/firebase-admin");
const {
  ensureAuthProvider,
  normalizeProviderId,
} = require("../../src/domains/auth/services/auth-provider");

/** Minimal knex stand-in: records the update it was asked to make. */
function fakeKnex({ hasColumn = true } = {}) {
  const updates = [];
  const knex = () => ({
    where: () => ({
      update: (payload) => {
        updates.push(payload);
        return Promise.resolve(1);
      },
    }),
  });
  knex.schema = { hasColumn: () => Promise.resolve(hasColumn) };
  knex.updates = updates;
  return knex;
}

describe("normalizeProviderId", () => {
  it("maps Firebase provider ids to stored provider names", () => {
    expect(normalizeProviderId("google.com")).toBe("google");
    expect(normalizeProviderId("apple.com")).toBe("apple");
    expect(normalizeProviderId("facebook.com")).toBe("facebook");
    expect(normalizeProviderId("password")).toBe("password");
  });

  it("returns null for a missing provider id", () => {
    expect(normalizeProviderId(null)).toBeNull();
    expect(normalizeProviderId("")).toBeNull();
  });
});

describe("ensureAuthProvider", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns the stored provider without touching Firebase", async () => {
    const knex = fakeKnex();
    const provider = await ensureAuthProvider(knex, {
      id: "u1",
      auth_provider: "google",
      firebase_uid: "abc",
    });

    expect(provider).toBe("google");
    expect(getUser).not.toHaveBeenCalled();
    expect(knex.updates).toHaveLength(0);
  });

  it("resolves a null column from Firebase and persists it once", async () => {
    getUser.mockResolvedValue({ providerData: [{ providerId: "google.com" }] });
    const knex = fakeKnex();
    const user = { id: "u1", auth_provider: null, firebase_uid: "abc" };

    const provider = await ensureAuthProvider(knex, user);

    expect(provider).toBe("google");
    expect(knex.updates).toEqual([{ auth_provider: "google" }]);
    // The caller's row is updated in place, so the same request can read it.
    expect(user.auth_provider).toBe("google");
  });

  it("recognises an Instagram account from its uid namespace", async () => {
    const knex = fakeKnex();
    const provider = await ensureAuthProvider(knex, {
      id: "u1",
      auth_provider: null,
      firebase_uid: "instagram:12345",
    });

    expect(provider).toBe("instagram");
    expect(getUser).not.toHaveBeenCalled();
    expect(knex.updates).toEqual([{ auth_provider: "instagram" }]);
  });

  it("stays null when Firebase cannot answer — never guesses a password login", async () => {
    getUser.mockRejectedValue(new Error("Firebase Admin not initialized"));
    const knex = fakeKnex();

    const provider = await ensureAuthProvider(knex, {
      id: "u1",
      auth_provider: null,
      firebase_uid: "abc",
    });

    expect(provider).toBeNull();
    expect(knex.updates).toHaveLength(0);
  });

  it("stays null for an account with no Firebase identity at all", async () => {
    const knex = fakeKnex();
    const provider = await ensureAuthProvider(knex, {
      id: "u1",
      auth_provider: null,
      firebase_uid: null,
    });

    expect(provider).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});
