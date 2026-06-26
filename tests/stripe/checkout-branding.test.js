const {
  buildCheckoutBrandingSettings,
  PHOLIO_CHECKOUT_BRAND,
} = require("../../src/shared/lib/stripe-checkout-branding");

describe("stripe-checkout-branding", () => {
  const originalIcon = process.env.STRIPE_BRAND_ICON_FILE_ID;
  const originalLogo = process.env.STRIPE_BRAND_LOGO_FILE_ID;

  afterEach(() => {
    if (originalIcon === undefined) {
      delete process.env.STRIPE_BRAND_ICON_FILE_ID;
    } else {
      process.env.STRIPE_BRAND_ICON_FILE_ID = originalIcon;
    }
    if (originalLogo === undefined) {
      delete process.env.STRIPE_BRAND_LOGO_FILE_ID;
    } else {
      process.env.STRIPE_BRAND_LOGO_FILE_ID = originalLogo;
    }
  });

  it("builds Pholio branding with file IDs when configured", () => {
    process.env.STRIPE_BRAND_ICON_FILE_ID = "file_icon_test";
    process.env.STRIPE_BRAND_LOGO_FILE_ID = "file_logo_test";

    const branding = buildCheckoutBrandingSettings({
      stripe: { baseUrl: "https://app.pholio.studio" },
    });

    expect(branding.display_name).toBe("Pholio");
    expect(branding.background_color).toBe(PHOLIO_CHECKOUT_BRAND.backgroundColor);
    expect(branding.button_color).toBe(PHOLIO_CHECKOUT_BRAND.buttonColor);
    expect(branding.font_family).toBe("noto_serif");
    expect(branding.icon).toEqual({ type: "file", file: "file_icon_test" });
    expect(branding.logo).toEqual({ type: "file", file: "file_logo_test" });
  });

  it("falls back to public brand URLs when file IDs are absent", () => {
    delete process.env.STRIPE_BRAND_ICON_FILE_ID;
    delete process.env.STRIPE_BRAND_LOGO_FILE_ID;

    const branding = buildCheckoutBrandingSettings({
      appUrl: "http://localhost:3000",
    });

    expect(branding.icon.url).toBe(
      "http://localhost:3000/brand/pholio-brand-mark.png",
    );
    expect(branding.logo.url).toBe(
      "http://localhost:3000/brand/pholio-wordmark-lockup-on-ink.png",
    );
  });
});
