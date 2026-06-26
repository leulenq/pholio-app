/**
 * Pholio Stripe Checkout branding — per-session overrides via branding_settings.
 * @see https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-branding_settings
 */

const PHOLIO_CHECKOUT_BRAND = {
  displayName: "Pholio",
  backgroundColor: "#FAF8F5",
  buttonColor: "#C9A55A",
  borderStyle: "rounded",
  fontFamily: "noto_serif",
};

const BRAND_ASSET_PATHS = {
  icon: "/brand/pholio-brand-mark.png",
  logo: "/brand/pholio-wordmark-lockup-on-ink.png",
};

/**
 * Build branding_settings for a Checkout Session.
 * Prefers Stripe File IDs (uploaded via setup-stripe-billing --brand) over public URLs.
 */
function buildCheckoutBrandingSettings(appConfig) {
  const baseUrl = (appConfig.stripe?.baseUrl || appConfig.appUrl || "").replace(
    /\/$/,
    "",
  );

  const branding = {
    display_name: PHOLIO_CHECKOUT_BRAND.displayName,
    background_color: PHOLIO_CHECKOUT_BRAND.backgroundColor,
    button_color: PHOLIO_CHECKOUT_BRAND.buttonColor,
    border_style: PHOLIO_CHECKOUT_BRAND.borderStyle,
    font_family: PHOLIO_CHECKOUT_BRAND.fontFamily,
  };

  const iconFileId = process.env.STRIPE_BRAND_ICON_FILE_ID;
  const logoFileId = process.env.STRIPE_BRAND_LOGO_FILE_ID;

  if (iconFileId) {
    branding.icon = { type: "file", file: iconFileId };
  } else if (baseUrl) {
    branding.icon = { type: "url", url: `${baseUrl}${BRAND_ASSET_PATHS.icon}` };
  }

  if (logoFileId) {
    branding.logo = { type: "file", file: logoFileId };
  } else if (baseUrl) {
    branding.logo = { type: "url", url: `${baseUrl}${BRAND_ASSET_PATHS.logo}` };
  }

  return branding;
}

module.exports = {
  PHOLIO_CHECKOUT_BRAND,
  BRAND_ASSET_PATHS,
  buildCheckoutBrandingSettings,
};
