const mockSendMail = jest.fn().mockResolvedValue({
  messageId: "guardian-email-test",
});

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

// email.js picks the real (nodemailer) transporter vs. the dev mock at
// require-time, based on config.smtp.host. Set fake SMTP env before
// requiring it so this test exercises the real send path (through the
// nodemailer mock above) instead of the console.log-only dev fallback.
process.env.SMTP_HOST = "smtp.test.example.com";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";

const {
  buildApplicationStatusEmailHtml,
  buildGuardianConsentEmailHtml,
} = require("../../src/shared/lib/pholio-email");
const {
  sendApplicationStatusEmail,
  sendGuardianConsentEmail,
} = require("../../src/shared/lib/email");

describe("application status email", () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  test("renders completed representation separately from an offer or decline", () => {
    const html = buildApplicationStatusEmailHtml({
      talentName: "Mia Voss",
      agencyName: "North Star Models",
      status: "represented",
    });

    // Copy was rewritten in the talent email redesign; the assertions pin the
    // distinction the test exists for, not the old prose: a completed agreement
    // must read as completed, never as an offer still to be accepted, and never
    // as a decline.
    expect(html).toMatch(/You.{1,6}re represented by North Star Models/);
    expect(html).toContain("The agreement is complete.");
    expect(html).not.toMatch(/wants to sign you|passed on your submission/);
  });

  test("sends a representation-confirmed subject", async () => {
    await sendApplicationStatusEmail({
      to: "talent@example.com",
      talentName: "Mia Voss",
      agencyName: "North Star Models",
      status: "represented",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Representation confirmed by North Star Models",
        html: expect.stringContaining("The agreement is complete."),
      }),
    );
  });
});

describe("guardian consent email", () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  test("names the agency and disclosure scope before authorization", () => {
    const html = buildGuardianConsentEmailHtml({
      guardianName: "Pat Guardian",
      talentName: "Mia Voss",
      talentCity: "Los Angeles",
      agencyName: "DNA Model Management",
      consentUrl: "https://app.pholio.studio/guardian-consent?token=test",
    });

    expect(html).toContain("Review this submission first.");
    expect(html).toContain("representation submission to");
    expect(html).toContain(
      "Profile details, measurements, digitals",
    );
    expect(html).toContain(
      "A submission to another agency requires a separate guardian authorization.",
    );
    expect(html).toContain("Review authorization");
  });

  test("escapes an agency name in the rendered email", () => {
    const html = buildGuardianConsentEmailHtml({
      talentName: "Mia Voss",
      agencyName: "<script>Agency</script>",
      consentUrl: "https://app.pholio.studio/guardian-consent?token=test",
    });

    expect(html).not.toContain("<script>Agency</script>");
    expect(html).toContain("&lt;script&gt;Agency&lt;/script&gt;");
  });

  test("sends an agency-specific subject and HTML through the live email path", async () => {
    await sendGuardianConsentEmail({
      to: "guardian@example.com",
      guardianName: "Pat Guardian",
      talentName: "Mia Voss",
      talentCity: "Los Angeles",
      agencyName: "DNA Model Management",
      consentUrl: "https://app.pholio.studio/guardian-consent?token=test",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guardian@example.com",
        subject:
          "Consent requested for Mia Voss to submit to DNA Model Management",
        html: expect.stringContaining("DNA Model Management"),
      }),
    );
  });

  test("preserves the account-level consent email when no agency is supplied", () => {
    const html = buildGuardianConsentEmailHtml({
      talentName: "Mia Voss",
      consentUrl: "https://app.pholio.studio/guardian-consent?token=test",
    });

    expect(html).toContain("Review this consent request.");
    expect(html).toContain("would like to use Pholio");
    expect(html).not.toContain("another agency requires");
  });
});

describe("talent email system", () => {
  const {
    buildWelcomeTalentEmailHtml,
    buildPasswordResetEmailHtml,
    buildCardDeclinedEmailHtml,
    buildApplicationStatusEmailHtml,
    buildNewMessageEmailHtml,
    text,
  } = require("../../src/shared/lib/pholio-email");

  const ALL = [
    buildWelcomeTalentEmailHtml({ firstName: "Maya", signInMethod: "Google", email: "maya@example.com" }),
    buildPasswordResetEmailHtml({ firstName: "Maya", resetUrl: "https://app.pholio.studio/reset" }),
    buildCardDeclinedEmailHtml({ attempted: { date: "16 AUG" }, nextAttempt: { date: "21 AUG", day: "Thursday" }, pausesOn: { date: "24 August", day: "Sunday" }, amount: "£9.99" }),
    buildApplicationStatusEmailHtml({ agencyName: "Storm", status: "kept_on_file", board: "Women" }),
    buildNewMessageEmailHtml({ senderName: "Sofia Rendall", agencyName: "Storm", messagePreview: "Hello" }),
  ];

  test("plain-text parts carry no CSS — the <style> block used to leak into them", () => {
    const parts = [
      text.welcomeTalent({ firstName: "Maya" }),
      text.passwordReset({ firstName: "Maya", resetUrl: "https://x" }),
      text.applicationStatus({ agencyName: "Storm", status: "kept_on_file" }),
      text.cardDeclined({ attempted: {}, nextAttempt: {}, pausesOn: { date: "24 August" } }),
    ];
    for (const body of parts) {
      expect(body).not.toMatch(/font-family|<style|line-height|border-collapse/);
      expect(body.trim().length).toBeGreaterThan(80);
    }
  });

  test("gold #C9A55A is never used as reading text — only the wordmark", () => {
    for (const html of ALL) {
      const goldText = [...html.matchAll(/color:#C9A55A/gi)];
      // The wordmark is a logotype and is exempt; nothing else may use it.
      expect(goldText.length).toBeLessThanOrEqual(1);
      // The faint dashboard grey flattens to 2.38:1 on cream — never as text.
      expect(html).not.toMatch(/color:#A5A29E/i);
    }
  });

  test("no invented postal address — Pholio is remote", () => {
    for (const html of ALL) {
      expect(html).not.toMatch(/Shelton Street|WC2H|London [A-Z]{1,2}\d/);
    }
  });

  test("renders at 600px, not the 720px Outlook crops", () => {
    for (const html of ALL) {
      expect(html).toContain('width="600"');
      expect(html).not.toContain('width="720"');
    }
  });

  test("an opaque decline never guesses a reason", () => {
    const html = buildCardDeclinedEmailHtml({ attempted: { date: "16 AUG" }, nextAttempt: { date: "21 AUG" } });
    expect(html).toMatch(/They didn.{1,6}t tell us why/);
    expect(html).not.toMatch(/expired|insufficient funds|billing address/i);
  });

  test("a stated decline names it instead", () => {
    const html = buildCardDeclinedEmailHtml({
      reason: { kind: "stated", sentence: "The card ending 4242 expired in July." },
      attempted: { date: "16 AUG" },
    });
    expect(html).toContain("The card ending 4242 expired in July.");
    expect(html).not.toMatch(/They didn.{1,6}t tell us why/);
  });

  test("kept on file is never presented as a rejection", () => {
    const html = buildApplicationStatusEmailHtml({ agencyName: "Storm", status: "kept_on_file", board: "Women" });
    expect(html).toMatch(/That.{1,6}s not a no\./);
    expect(html).not.toMatch(/unsuccessful|rejected|unfortunately/i);
  });

  test("a decline carries no apology — Pholio did not make the decision", () => {
    const html = buildApplicationStatusEmailHtml({ agencyName: "Storm", status: "declined" });
    expect(html).not.toMatch(/sorry|apologi[sz]e|unfortunately/i);
  });
});
