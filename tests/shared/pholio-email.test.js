const mockSendMail = jest.fn().mockResolvedValue({
  messageId: "guardian-email-test",
});

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

const {
  buildGuardianConsentEmailHtml,
} = require("../../src/shared/lib/pholio-email");
const {
  sendGuardianConsentEmail,
} = require("../../src/shared/lib/email");

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

    expect(html).toContain("Authorization to submit to DNA Model Management.");
    expect(html).toContain("representation submission to");
    expect(html).toContain(
      "Profile and contact details, measurements, digitals",
    );
    expect(html).toContain(
      "A submission to another agency requires a separate guardian authorization.",
    );
    expect(html).toContain("Review &amp; authorize");
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

    expect(html).toContain("A consent request for your review.");
    expect(html).toContain("build a modeling portfolio");
    expect(html).not.toContain("another agency requires");
  });
});
