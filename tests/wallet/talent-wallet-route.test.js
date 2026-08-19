"use strict";

const request = require("supertest");
const express = require("express");

jest.mock("../../src/domains/auth/middleware/require-auth", () => ({
  requireRole: () => (req, res, next) => {
    req.session = { userId: "talent-user" };
    next();
  },
}));

const walletRouter = require("../../src/domains/wallet/routes/talent-wallet");

describe("GET /api/talent/wallet/pass", () => {
  test("does not issue an unsigned pass when Apple signing is absent", async () => {
    const keys = [
      "APPLE_WALLET_PASS_TYPE_IDENTIFIER",
      "APPLE_WALLET_TEAM_IDENTIFIER",
      "APPLE_WALLET_SIGNER_CERT_PEM",
      "APPLE_WALLET_SIGNER_KEY_PEM",
      "APPLE_WALLET_WWDR_PEM",
    ];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    keys.forEach((key) => delete process.env[key]);

    const app = express();
    app.use("/api/talent/wallet", walletRouter);
    const response = await request(app).get("/api/talent/wallet/pass");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: "Pholio ID Apple Wallet signing is not configured yet.",
      code: "WALLET_NOT_CONFIGURED",
    });

    Object.entries(saved).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
});
