"use strict";

/**
 * Production-readiness audit finding #1 and #2 (src/shared/lib/email.js).
 *
 * #1 — the mock transporter used to resolve successfully whenever SMTP_HOST
 * was unset, in every runtime including production. Every caller in
 * email.js awaits `sendMail`, so that meant guardian consent — a
 * minor-safety control — could report `email_sent: true`
 * (guardian-consent.js reads exactly this) with no real email ever sent, and
 * with zero signal anywhere. The fix must fail CLOSED: throw at send time in
 * any runtime that is not explicitly development/test
 * (`isDeployedRuntime()`), while leaving local dev and the test suite itself
 * working without real SMTP credentials.
 *
 * #2 — nodemailer's defaults (2min connect / 30s greeting / 10min socket)
 * each individually exceed a serverless function's ~26s budget. The real
 * transporter must be constructed with tighter timeouts.
 *
 * Each test that needs a different NODE_ENV / SMTP configuration resets the
 * module registry and re-requires email.js, mirroring
 * tests/security/auth-passthrough-fail-closed.test.js — config.js and
 * email.js both read process.env at require time.
 */

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

afterEach(() => {
  restoreEnv();
  jest.resetModules();
});

describe("mock transporter — no SMTP configured", () => {
  test.each([["development"], ["test"]])(
    "in %p, sendMail still resolves like today (no real SMTP needed locally)",
    async (nodeEnv) => {
      jest.resetModules();
      process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };
      delete process.env.SMTP_HOST;

      const { sendEmail } = require("../../src/shared/lib/email");
      const info = await sendEmail({
        to: "talent@example.com",
        subject: "hello",
        html: "<p>hi</p>",
      });
      expect(info.messageId).toMatch(/^mock-/);
    },
  );

  test.each([
    ["production"],
    ["Production"],
    ["staging"],
    [undefined],
  ])(
    "in %p (a deployed runtime), sendMail throws instead of faking success",
    async (nodeEnv) => {
      jest.resetModules();
      process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      // config.js only requires SESSION_SECRET for the exact string
      // "production" — supply it so require() doesn't throw for an
      // unrelated reason and mask what this test is checking.
      process.env.SESSION_SECRET =
        ORIGINAL_ENV.SESSION_SECRET || "test-secret-for-email-fail-closed";
      delete process.env.SMTP_HOST;

      const { sendEmail } = require("../../src/shared/lib/email");
      await expect(
        sendEmail({
          to: "guardian@example.com",
          subject: "Consent requested",
          html: "<p>hi</p>",
        }),
      ).rejects.toThrow(/deployed runtime|SMTP_HOST/i);
    },
  );

  test("a rejected send never logs the guardian's full email address, only the domain", async () => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      SESSION_SECRET:
        ORIGINAL_ENV.SESSION_SECRET || "test-secret-for-email-fail-closed",
    };
    delete process.env.SMTP_HOST;

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { sendEmail } = require("../../src/shared/lib/email");
      await expect(
        sendEmail({
          to: "very-identifying-guardian@example.com",
          subject: "Consent requested",
          html: "<p>hi</p>",
        }),
      ).rejects.toThrow();

      const loggedText = errorSpy.mock.calls.flat().map(String).join(" | ");
      expect(loggedText).not.toContain("very-identifying-guardian@example.com");
      expect(loggedText).toContain("example.com");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("real transporter — SMTP configured", () => {
  function loadWithMockedNodemailer() {
    jest.resetModules();
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: "real-1" });
    const createTransport = jest.fn(() => ({
      sendMail: mockSendMail,
      verify: jest.fn().mockResolvedValue(true),
    }));
    jest.doMock("nodemailer", () => ({ createTransport }));

    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      SESSION_SECRET:
        ORIGINAL_ENV.SESSION_SECRET || "test-secret-for-email-fail-closed",
      SMTP_HOST: "smtp.resend.com",
      SMTP_PORT: "465",
      SMTP_USER: "resend",
      SMTP_PASS: "test-api-key",
    };

    require("../../src/shared/lib/email");
    return { createTransport, mockSendMail };
  }

  test("connects with bounded timeouts that fit a ≤26s function budget", () => {
    const { createTransport } = loadWithMockedNodemailer();

    expect(createTransport).toHaveBeenCalledTimes(1);
    const options = createTransport.mock.calls[0][0];

    expect(typeof options.connectionTimeout).toBe("number");
    expect(typeof options.greetingTimeout).toBe("number");
    expect(typeof options.socketTimeout).toBe("number");

    // nodemailer's own defaults are 120000 / 30000 / 600000 — assert these
    // are meaningfully tighter, not just "set to something".
    expect(options.connectionTimeout).toBeLessThan(120000);
    expect(options.greetingTimeout).toBeLessThan(30000);
    expect(options.socketTimeout).toBeLessThan(600000);

    const worstCaseTotalMs =
      options.connectionTimeout + options.greetingTimeout + options.socketTimeout;
    expect(worstCaseTotalMs).toBeLessThanOrEqual(26000);
  });

  test("a configured SMTP host still sends for real, unaffected by the fail-closed mock path", async () => {
    const { mockSendMail } = loadWithMockedNodemailer();
    const { sendEmail } = require("../../src/shared/lib/email");

    await sendEmail({
      to: "talent@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});
