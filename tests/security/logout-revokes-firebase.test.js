/**
 * Logout must be server-authoritative.
 *
 * Destroying the Express session alone is not enough: the SPA's
 * PholioAuthBridge re-posts a cached Firebase ID token to /api/login whenever it
 * finds no session, so a logout that leaves the Firebase identity live gets
 * silently undone on the next tab focus.
 *
 * This is unavoidable from the marketing site's client — Firebase Web SDK
 * persistence is per-origin, so www.pholio.studio can never clear
 * app.pholio.studio's Firebase state — which is why revocation belongs on the
 * server and must not depend on either client having a Firebase config.
 */
const mockRevokeRefreshTokens = jest.fn();
const mockVerifyIdToken = jest.fn();

// Stub the SDK itself: getAuth() inside the service resolves admin.auth()
// through the module-local adminApp, so spying on the service's own export
// would not intercept its internal calls.
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(() => ({ name: "test-app" })),
  credential: { cert: jest.fn(() => ({})) },
  auth: jest.fn(() => ({
    revokeRefreshTokens: mockRevokeRefreshTokens,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

describe("logout revokes Firebase refresh tokens", () => {
  let firebaseAdmin;

  beforeAll(() => {
    // initializeFirebaseAdmin() bails unless all three are present.
    process.env.FIREBASE_PROJECT_ID = "test-project";
    process.env.FIREBASE_PRIVATE_KEY = "test-key";
    process.env.FIREBASE_CLIENT_EMAIL = "test@example.com";
  });

  beforeEach(() => {
    jest.resetModules();
    mockRevokeRefreshTokens.mockReset().mockResolvedValue(undefined);
    mockVerifyIdToken.mockReset().mockResolvedValue({ uid: "uid-1" });

    firebaseAdmin = require("../../src/domains/auth/services/firebase-admin");
    firebaseAdmin.initializeFirebaseAdmin();
  });

  test("revokeRefreshTokens calls through for a real uid", async () => {
    const result = await firebaseAdmin.revokeRefreshTokens("uid-1");
    expect(result).toBe(true);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith("uid-1");
  });

  test.each([null, undefined, ""])(
    "is a no-op for %p rather than throwing (accounts without a Firebase identity)",
    async (uid) => {
      await expect(firebaseAdmin.revokeRefreshTokens(uid)).resolves.toBe(false);
      expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
    },
  );

  test("never throws when Firebase is unreachable — logout must still complete", async () => {
    mockRevokeRefreshTokens.mockRejectedValue(new Error("network down"));
    await expect(firebaseAdmin.revokeRefreshTokens("uid-1")).resolves.toBe(false);
  });

  test("verifyIdToken asks Firebase to check revocation by default", async () => {
    // Without checkRevoked, a signed-out user's cached ID token stays valid for
    // up to an hour and the bridge can re-create the session with it. The
    // "Token revoked" error branch was unreachable before this.
    await firebaseAdmin.verifyIdToken("token-abc");
    expect(mockVerifyIdToken).toHaveBeenCalledWith("token-abc", true);
  });

  test("a revoked token is rejected, so a session cannot be re-established", async () => {
    const revoked = Object.assign(new Error("revoked"), {
      code: "auth/id-token-revoked",
    });
    mockVerifyIdToken.mockRejectedValue(revoked);

    await expect(firebaseAdmin.verifyIdToken("stale-token")).rejects.toThrow(
      "Token revoked",
    );
  });

  test("revocation can be opted out of explicitly", async () => {
    await firebaseAdmin.verifyIdToken("token-abc", { checkRevoked: false });
    expect(mockVerifyIdToken).toHaveBeenCalledWith("token-abc", false);
  });
});
