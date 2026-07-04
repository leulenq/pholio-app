/**
 * Pholio transactional email HTML builders.
 * Inline styles only — required for email client compatibility.
 */

const BRAND = {
  canvas: "#FAF8F5",
  card: "#FFFFFF",
  gold: "#C9A55A",
  goldHover: "#B8956A",
  goldMuted: "#F5F0E8",
  goldGhost: "rgba(201, 165, 90, 0.14)",
  text: "#1A1815",
  textSecondary: "#6B6560",
  textMuted: "#9C958E",
  border: "#EDE9E3",
  quoteBorder: "#C9A55A",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLocalhostUrl(value) {
  if (!value) return false;
  try {
    const host = new URL(String(value).trim()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(String(value));
  }
}

function pickPublicBaseUrl(candidates, fallback) {
  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = String(raw).trim().replace(/\/$/, "");
    if (!isLocalhostUrl(normalized)) return normalized;
  }
  return fallback;
}

const PRODUCTION_APP_URL = "https://app.pholio.studio";
const PRODUCTION_MARKETING_URL = "https://www.pholio.studio";

/** App base URL for links inside outbound transactional emails (never localhost). */
function getEmailAppBaseUrl() {
  return pickPublicBaseUrl(
    [
      process.env.EMAIL_APP_URL,
      process.env.APP_URL,
      process.env.BASE_URL,
      process.env.URL,
      process.env.DEPLOY_PRIME_URL,
    ],
    PRODUCTION_APP_URL,
  );
}

/** Marketing site base URL for legal docs and public pages in emails. */
function getMarketingSiteUrl() {
  return pickPublicBaseUrl(
    [process.env.EMAIL_MARKETING_SITE_URL, process.env.MARKETING_SITE_URL],
    PRODUCTION_MARKETING_URL,
  );
}

/** Public brand mark used in email headers and inbox sender avatar (Gravatar/BIMI). */
function getBrandMarkUrl() {
  return pickPublicBaseUrl(
    [process.env.EMAIL_BRAND_MARK_URL, process.env.BRAND_MARK_URL],
    `${PRODUCTION_APP_URL}/brand/pholio-sender-avatar.png`,
  );
}

function buildEmailBrandMark({
  width = 168,
  href = getMarketingSiteUrl(),
} = {}) {
  const src = escapeHtml(getBrandMarkUrl());
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" style="text-decoration:none;display:inline-block;line-height:0;"><img src="${src}" alt="Pholio" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;outline:none;" /></a>`;
}

function getAppBaseUrl() {
  return (
    process.env.APP_URL ||
    (process.env.NODE_ENV === "production"
      ? PRODUCTION_APP_URL
      : "http://localhost:5173")
  );
}

/** Resolve a profile/media path to an absolute URL suitable for email clients. */
function resolveEmailAssetUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getEmailAppBaseUrl();
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function buildLegalLinksRow({ separator = " · " } = {}) {
  const marketing = getMarketingSiteUrl();
  const linkStyle = `color:${BRAND.textSecondary};text-decoration:underline;`;
  const items = [
    `<a href="${escapeHtml(`${marketing}/terms`)}" style="${linkStyle}">Terms of Service</a>`,
    `<a href="${escapeHtml(`${marketing}/privacy`)}" style="${linkStyle}">Privacy Policy</a>`,
    `<a href="${escapeHtml(`${marketing}/ai-notice`)}" style="${linkStyle}">AI Notice</a>`,
  ];
  return items.join(separator);
}

function buildEmailFooter({ includeLegal = true } = {}) {
  const marketing = getMarketingSiteUrl();
  const legalBlock = includeLegal
    ? `<p style="margin:10px 0 0;font-size:11px;line-height:1.7;color:${BRAND.textMuted};">
        ${buildLegalLinksRow()}
      </p>
      <p style="margin:8px 0 0;font-size:11px;line-height:1.6;color:${BRAND.textMuted};">
        Questions? <a href="mailto:support@pholio.studio" style="color:${BRAND.textSecondary};text-decoration:underline;">support@pholio.studio</a>
      </p>`
    : "";

  return `<tr>
    <td align="center" style="padding:28px 12px 0;">
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">
        © ${new Date().getFullYear()} Pholio Studio · Talent portfolios &amp; agency tools
      </p>
      <p style="margin:0;font-size:11px;line-height:1.6;color:${BRAND.textMuted};">
        <a href="${escapeHtml(marketing)}" style="color:${BRAND.textSecondary};text-decoration:underline;">pholio.studio</a>
      </p>
      ${legalBlock}
    </td>
  </tr>`;
}

/**
 * Shared Pholio email shell — warm editorial luxury.
 */
function getPholioEmailShell({ preheader = "", bodyHtml = "", includeLegalFooter = false }) {
  const preheaderText = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Pholio</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-card { padding: 28px 20px !important; }
      .email-card-flush { padding: 0 !important; }
      .email-body-pad { padding: 28px 20px !important; }
      .email-hero-pad { padding: 28px 20px !important; }
      .email-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .feature-col { display: block !important; width: 100% !important; padding-bottom: 12px !important; }
      .stat-col { display: block !important; width: 100% !important; padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheaderText}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              ${buildEmailBrandMark({ width: 168 })}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="email-card" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:36px 40px;box-shadow:0 4px 24px rgba(26,24,21,0.06);">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          ${buildEmailFooter({ includeLegal: includeLegalFooter })}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildCtaButton({ href, label }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;">
    <tr>
      <td align="center" style="border-radius:10px;background-color:${BRAND.gold};">
        <a href="${escapeHtml(href)}" class="email-cta" style="display:inline-block;padding:14px 32px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;background-color:${BRAND.gold};"> ${escapeHtml(label)} </a>
      </td>
    </tr>
  </table>`;
}

function buildSecondaryLink({ href, label }) {
  return `<p style="margin:14px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};word-break:break-all;">
    Or copy this link:<br />
    <a href="${escapeHtml(href)}" style="color:${BRAND.gold};text-decoration:underline;">${escapeHtml(href)}</a>
  </p>`;
}

function buildVerificationCodeBlock(code) {
  const digits = escapeHtml(
    String(code || "000000")
      .replace(/\D/g, "")
      .slice(0, 6)
      .padEnd(6, "0"),
  );
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 4px;">
    <tr>
      <td align="center" style="padding:20px 28px;background-color:${BRAND.canvas};border:1px solid ${BRAND.border};border-radius:12px;">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.textMuted};font-weight:600;">Verification code</p>
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:32px;letter-spacing:0.35em;color:${BRAND.text};font-weight:700;">${digits}</p>
      </td>
    </tr>
  </table>`;
}

function buildSecurityNote(text) {
  return `<p style="margin:24px 0 0;padding:16px 18px;background-color:${BRAND.canvas};border-radius:10px;font-size:13px;line-height:1.55;color:${BRAND.textSecondary};border:1px solid ${BRAND.border};">
    <strong style="color:${BRAND.text};">Security note:</strong> ${text}
  </p>`;
}

function buildGreeting(name) {
  return `<p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:${BRAND.text};font-weight:400;">
    Hi ${escapeHtml(name || "there")},
  </p>`;
}

function buildBodyCopy(html) {
  return `<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">${html}</p>`;
}

function buildHeadline(text) {
  return `<p style="margin:0 0 8px;font-size:17px;line-height:1.4;color:${BRAND.text};font-weight:600;">${text}</p>`;
}

/**
 * Premium welcome shell — flush hero band + padded body.
 */
function getWelcomeEmailShell({
  preheader = "",
  heroHtml = "",
  bodyHtml = "",
  settingsPath = "/dashboard/talent/settings",
}) {
  const preheaderText = escapeHtml(preheader);
  const settingsHref = escapeHtml(`${getAppBaseUrl()}${settingsPath}`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Pholio</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-card-flush { padding: 0 !important; }
      .email-body-pad { padding: 28px 20px !important; }
      .email-hero-pad { padding: 32px 20px 28px !important; }
      .email-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .feature-col { display: block !important; width: 100% !important; padding-bottom: 12px !important; }
      .stat-col { display: block !important; width: 100% !important; padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheaderText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              ${buildEmailBrandMark({ width: 156 })}
            </td>
          </tr>
          <tr>
            <td class="email-card email-card-flush" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(26,24,21,0.08);padding:0;">
              ${heroHtml}
              <div class="email-body-pad" style="padding:32px 36px 36px;">${bodyHtml}</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 12px 0;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">© ${new Date().getFullYear()} Pholio Studio · Talent portfolios &amp; agency tools</p>
              <p style="margin:0;font-size:11px;line-height:1.6;color:${BRAND.textMuted};">
                <a href="https://www.pholio.studio" style="color:${BRAND.textSecondary};text-decoration:underline;">pholio.studio</a>
                &nbsp;·&nbsp;
                <a href="${settingsHref}" style="color:${BRAND.textSecondary};text-decoration:underline;">Notification preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWelcomeHero({ eyebrow, title, subtitle, badge }) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.goldMuted};border-bottom:1px solid ${BRAND.border};">
    <tr>
      <td class="email-hero-pad" align="center" style="padding:40px 36px 36px;text-align:center;">
        ${badge ? `<p style="margin:0 0 14px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">${escapeHtml(badge)}</p>` : ""}
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.textMuted};font-weight:600;">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;font-weight:400;color:${BRAND.text};letter-spacing:-0.01em;">${title}</h1>
        <p style="margin:0 auto;max-width:420px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">${subtitle}</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:22px auto 0;">
          <tr>
            <td style="width:48px;height:1px;background-color:${BRAND.gold};opacity:0.5;font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:6px;height:6px;background-color:${BRAND.gold};border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:48px;height:1px;background-color:${BRAND.gold};opacity:0.5;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function buildSectionLabel(text) {
  return `<p style="margin:0 0 14px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">${escapeHtml(text)}</p>`;
}

function buildFeatureGrid(items) {
  const cols = items
    .map(
      (item) => `
      <td class="feature-col" valign="top" width="33.33%" style="padding:0 6px 0 0;vertical-align:top;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.canvas};border:1px solid ${BRAND.border};border-radius:12px;height:100%;">
          <tr>
            <td style="padding:18px 16px;">
              <p style="margin:0 0 10px;font-size:22px;line-height:1;">${item.icon}</p>
              <p style="margin:0 0 6px;font-size:14px;line-height:1.35;color:${BRAND.text};font-weight:600;">${escapeHtml(item.title)}</p>
              <p style="margin:0;font-size:12px;line-height:1.55;color:${BRAND.textSecondary};">${item.description}</p>
            </td>
          </tr>
        </table>
      </td>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
    <tr>${cols}</tr>
  </table>`;
}

function buildFeatureGrid2x2(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const cells = pair
      .map(
        (item) => `
        <td class="feature-col" valign="top" width="50%" style="padding:0 6px 8px 0;vertical-align:top;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.canvas};border:1px solid ${BRAND.border};border-radius:12px;">
            <tr>
              <td style="padding:18px 16px;">
                <p style="margin:0 0 8px;font-size:20px;line-height:1;">${item.icon}</p>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.35;color:${BRAND.text};font-weight:600;">${escapeHtml(item.title)}</p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:${BRAND.textSecondary};">${item.description}</p>
              </td>
            </tr>
          </table>
        </td>`,
      )
      .join("");
    rows.push(`<tr>${cells}</tr>`);
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">${rows.join("")}</table>`;
}

function buildStepList(steps) {
  const rows = steps
    .map(
      (step, i) => `
    <tr>
      <td valign="top" width="36" style="padding:0 14px 16px 0;vertical-align:top;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td align="center" width="28" height="28" style="width:28px;height:28px;background-color:${BRAND.goldGhost};border:1px solid rgba(201,165,90,0.35);border-radius:50%;font-size:12px;font-weight:700;color:${BRAND.gold};line-height:28px;text-align:center;">${i + 1}</td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:0 0 16px;vertical-align:top;">
        <p style="margin:0 0 4px;font-size:14px;line-height:1.4;color:${BRAND.text};font-weight:600;">${escapeHtml(step.title)}</p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:${BRAND.textSecondary};">${step.description}</p>
      </td>
    </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">${rows}</table>`;
}

function buildStatRow(stats) {
  const cells = stats
    .map(
      (stat) => `
      <td class="stat-col" align="center" width="33.33%" style="padding:0 4px;text-align:center;">
        <p style="margin:0 0 2px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:${BRAND.gold};font-weight:400;">${escapeHtml(stat.value)}</p>
        <p style="margin:0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.textMuted};font-weight:600;">${escapeHtml(stat.label)}</p>
      </td>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background-color:${BRAND.canvas};border:1px solid ${BRAND.border};border-radius:12px;">
    <tr><td style="padding:20px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${cells}</tr></table></td></tr>
  </table>`;
}

function buildTextCta({ href, label }) {
  return `<p style="margin:16px 0 0;text-align:center;font-size:14px;line-height:1.5;">
    <a href="${escapeHtml(href)}" style="color:${BRAND.gold};text-decoration:underline;font-weight:600;">${escapeHtml(label)}</a>
  </p>`;
}

function buildConciergeNote(html) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
    <tr>
      <td style="padding:18px 20px;background-color:${BRAND.canvas};border-radius:12px;border:1px solid ${BRAND.border};border-left:3px solid ${BRAND.gold};">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">Concierge</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textSecondary};">${html}</p>
      </td>
    </tr>
  </table>`;
}

/**
 * New message from agency → talent (magic-link reply).
 */
function buildNewMessageEmailHtml({
  recipientName,
  senderName,
  messagePreview,
  replyUrl,
}) {
  const appUrl = getAppBaseUrl();
  const safeName = escapeHtml(recipientName || "there");
  const safeSender = escapeHtml(senderName || "An agency");
  const safePreview = escapeHtml(messagePreview || "");
  const ctaHref = replyUrl || `${appUrl}/login`;
  const ctaLabel = replyUrl ? "Reply on Pholio" : "View on Pholio";

  const bodyHtml = `
    <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:${BRAND.text};font-weight:400;">
      Hi ${safeName},
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
      You have a new message from <strong style="color:${BRAND.text};font-weight:600;">${safeSender}</strong>.
    </p>

    <!-- Message preview -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="border-left:3px solid ${BRAND.quoteBorder};padding:16px 20px;background-color:${BRAND.canvas};border-radius:0 12px 12px 0;">
          <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};font-style:italic;">&ldquo;${safePreview}&rdquo;</p>
        </td>
      </tr>
    </table>

    ${buildCtaButton({ href: ctaHref, label: ctaLabel })}

    ${
      replyUrl
        ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};">
             One tap to reply — no password needed. This link expires in 7 days.
           </p>`
        : ""
    }

    <p style="margin:32px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};border-top:1px solid ${BRAND.border};padding-top:24px;">
      Sent via Pholio on behalf of ${safeSender}.
    </p>`;

  return getPholioEmailShell({
    preheader: `${senderName}: "${(messagePreview || "").slice(0, 80)}…"`,
    bodyHtml,
  });
}

/**
 * Application status update.
 */
function buildApplicationStatusEmailHtml({ talentName, agencyName, status }) {
  const messages = {
    accepted: {
      headline: "Your application was accepted",
      body: `Congratulations! <strong style="color:${BRAND.text};">${escapeHtml(agencyName)}</strong> has accepted your application.`,
    },
    declined: {
      headline: "Application update",
      body: `<strong style="color:${BRAND.text};">${escapeHtml(agencyName)}</strong> has declined your application at this time. Keep building — the right fit is out there.`,
    },
  };

  const { headline, body } = messages[status] || {
    headline: "Application update",
    body: "Your application status has been updated.",
  };

  const bodyHtml = `
    <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:${BRAND.text};">
      Hi ${escapeHtml(talentName || "there")},
    </p>
    <p style="margin:0 0 8px;font-size:17px;line-height:1.4;color:${BRAND.text};font-weight:600;">
      ${headline}
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
      ${body}
    </p>
    ${buildCtaButton({ href: `${getAppBaseUrl()}/dashboard/talent/applications`, label: "View applications" })}`;

  return getPholioEmailShell({
    preheader: headline,
    bodyHtml,
  });
}

/**
 * Agency invite to talent.
 */
function buildAgencyInviteEmailHtml({ talentName, agencyName }) {
  const bodyHtml = `
    <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:${BRAND.text};">
      Hi ${escapeHtml(talentName || "there")},
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
      <strong style="color:${BRAND.text};">${escapeHtml(agencyName)}</strong> discovered your portfolio on Pholio and would like to work with you.
    </p>
    ${buildCtaButton({ href: `${getAppBaseUrl()}/dashboard/talent`, label: "View invitation" })}`;

  return getPholioEmailShell({
    preheader: `${agencyName} invited you to apply on Pholio`,
    bodyHtml,
  });
}

/**
 * Welcome — new talent account (post sign-up / first login).
 */
function buildWelcomeTalentEmailHtml({ firstName, roleLabel = "talent" }) {
  const appUrl = getAppBaseUrl();
  const safeName = escapeHtml(firstName || "there");

  const heroHtml = buildWelcomeHero({
    badge: "You're in",
    eyebrow: "Studio+ Portfolio",
    title: `Welcome, ${safeName}`,
    subtitle:
      "Your editorial workspace is live. Build a portfolio agencies actually want to open — comp card, measurements, and submissions in one refined flow.",
  });

  const bodyHtml = `
    ${buildBodyCopy(
      "Pholio is built for the moment before the room: when your book needs to feel intentional, your stats need to be precise, and your first impression needs to land like a casting folder — not a social feed.",
    )}
    ${buildStatRow([
      { value: "PDF", label: "Comp cards" },
      { value: "AI", label: "Photo curation" },
      { value: "1:1", label: "Agency apply" },
    ])}
    ${buildSectionLabel("Your toolkit")}
    ${buildFeatureGrid([
      {
        icon: "◆",
        title: "Editorial portfolio",
        description:
          "Curate hero shots, set order, and keep your book presentation-ready.",
      },
      {
        icon: "▣",
        title: "Comp card PDF",
        description:
          "Export a print-ready comp card with your measurements and best frames.",
      },
      {
        icon: "→",
        title: "Agency applications",
        description:
          "Apply with context — agencies see your full submission, not a DM thread.",
      },
    ])}
    ${buildSectionLabel("Your first 15 minutes")}
    ${buildStepList([
      {
        title: "Complete your essentials",
        description:
          "Measurements, location, bio, and contact — agencies filter on this first.",
      },
      {
        title: "Upload 4–8 strong images",
        description:
          "Lead with editorial quality. Pholio helps you curate order and primary hero.",
      },
      {
        title: "Generate your comp card",
        description: "Preview the PDF, then share or attach when you apply.",
      },
      {
        title: "Apply to your first agency",
        description:
          "Track status, messages, and replies — including one-tap magic-link responses.",
      },
    ])}
    ${buildCtaButton({ href: `${appUrl}/dashboard/talent`, label: "Open your dashboard" })}
    ${buildTextCta({ href: `${appUrl}/dashboard/talent/profile`, label: "Start with your profile →" })}
    ${buildConciergeNote(
      `Questions while you're setting up? Reply to this email or visit <a href="https://www.pholio.studio" style="color:${BRAND.gold};text-decoration:underline;">pholio.studio</a> — we're here for your first book.`,
    )}`;

  return getWelcomeEmailShell({
    preheader: `Welcome to Pholio — your ${roleLabel} portfolio starts here`,
    heroHtml,
    bodyHtml,
    settingsPath: "/dashboard/talent/settings",
  });
}

/**
 * Welcome — new agency account (partners sign-up).
 */
function buildWelcomeAgencyEmailHtml({ contactName, agencyName }) {
  const appUrl = getAppBaseUrl();
  const safeAgency = escapeHtml(agencyName || "your agency");
  const safeContact = escapeHtml(contactName || "there");

  const heroHtml = buildWelcomeHero({
    badge: "Agency live",
    eyebrow: "Command center",
    title: safeAgency,
    subtitle:
      "Your house is on Pholio. Review submissions, run castings, discover talent, and manage your roster — one premium surface built for scouts, bookers, and principals.",
  });

  const bodyHtml = `
    ${buildBodyCopy(
      `<strong style="color:${BRAND.text};">${safeContact}</strong> — <strong style="color:${BRAND.text};">${safeAgency}</strong> is ready. Pholio replaces the scattered inbox with a pipeline you can actually run: applicants, boards, interviews, messages, and signed talent in one auditable workspace.`,
    )}
    ${buildStatRow([
      { value: "Inbox", label: "Applicants" },
      { value: "Discover", label: "Scout talent" },
      { value: "Team", label: "RBAC seats" },
    ])}
    ${buildSectionLabel("Built for your house")}
    ${buildFeatureGrid2x2([
      {
        icon: "◎",
        title: "Applicant pipeline",
        description:
          "Review submissions with match scores, notes, tags, and status — from first look to signed.",
      },
      {
        icon: "◇",
        title: "Discover & invite",
        description:
          "Semantic search across talent. Invite the right faces without leaving the platform.",
      },
      {
        icon: "◈",
        title: "Casting boards",
        description:
          "Run live castings with requirements, scoring weights, and board-level intelligence.",
      },
      {
        icon: "◉",
        title: "Roster & interviews",
        description:
          "Coordinate callbacks, schedule interviews, and message talent with magic-link replies.",
      },
    ])}
    ${buildSectionLabel("Launch checklist")}
    ${buildStepList([
      {
        title: "Set your house identity",
        description:
          "Agency name, location, website, and description — this is what talent sees when you reach out.",
      },
      {
        title: "Upload branding",
        description:
          "Logo and brand color — your dashboard and talent touchpoints inherit your house look.",
      },
      {
        title: "Invite your team",
        description:
          "Add scouts, agents, and bookers with the right permissions — Principal, Agent, or Scout seats.",
      },
      {
        title: "Open your first board or review applicants",
        description:
          "Start with inbound submissions or spin up a casting board for your next project.",
      },
    ])}
    ${buildCtaButton({ href: `${appUrl}/dashboard/agency`, label: "Enter agency dashboard" })}
    ${buildTextCta({ href: `${appUrl}/dashboard/agency/settings`, label: "Configure house settings →" })}
    ${buildConciergeNote(
      `White-glove onboarding for ${safeAgency}? Reply to this email — our team can help migrate boards, roster exports, and team structure.`,
    )}`;

  return getWelcomeEmailShell({
    preheader: `${agencyName || "Your agency"} is now on Pholio`,
    heroHtml,
    bodyHtml,
    settingsPath: "/dashboard/agency/settings",
  });
}

/**
 * Verify email address (sign-up or email change).
 */
function buildEmailVerificationHtml({
  firstName,
  verifyUrl,
  verificationCode,
  expiresMinutes = 30,
}) {
  const bodyHtml = `
    ${buildGreeting(firstName)}
    ${buildHeadline("Verify your email address")}
    ${buildBodyCopy(
      "Thanks for signing up for Pholio. Confirm your email to secure your account and receive application updates.",
    )}
    ${buildCtaButton({ href: verifyUrl, label: "Verify email address" })}
    ${buildSecondaryLink({ href: verifyUrl, label: verifyUrl })}
    ${verificationCode ? buildVerificationCodeBlock(verificationCode) : ""}
    ${verificationCode ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};text-align:center;">Enter this code if the button doesn't work.</p>` : ""}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};">
      This link expires in ${expiresMinutes} minutes. If you didn't create a Pholio account, you can safely ignore this email.
    </p>`;

  return getPholioEmailShell({
    preheader: "Confirm your email to activate your Pholio account",
    bodyHtml,
  });
}

/**
 * Password reset request.
 */
function buildPasswordResetEmailHtml({
  firstName,
  resetUrl,
  expiresMinutes = 60,
}) {
  const bodyHtml = `
    ${buildGreeting(firstName)}
    ${buildHeadline("Reset your password")}
    ${buildBodyCopy(
      "We received a request to reset the password for your Pholio account. Click below to choose a new password.",
    )}
    ${buildCtaButton({ href: resetUrl, label: "Reset password" })}
    ${buildSecondaryLink({ href: resetUrl, label: resetUrl })}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};">
      This link expires in ${expiresMinutes} minutes.
    </p>
    ${buildSecurityNote(
      "If you didn't request a password reset, ignore this email — your password won't change unless you use the link above.",
    )}`;

  return getPholioEmailShell({
    preheader: "Reset your Pholio password",
    bodyHtml,
  });
}

/**
 * Password successfully changed (security confirmation).
 */
function buildPasswordChangedEmailHtml({ firstName, changedAt, supportUrl }) {
  const when = escapeHtml(changedAt || "just now");
  const support = supportUrl || "mailto:support@pholio.studio";
  const bodyHtml = `
    ${buildGreeting(firstName)}
    ${buildHeadline("Your password was changed")}
    ${buildBodyCopy(`Your Pholio password was updated <strong style="color:${BRAND.text};">${when}</strong>.`)}
    ${buildSecurityNote(
      `If this wasn't you, contact us immediately at <a href="${escapeHtml(support)}" style="color:${BRAND.gold};text-decoration:underline;">support@pholio.studio</a> so we can secure your account.`,
    )}
    ${buildCtaButton({ href: `${getAppBaseUrl()}/login`, label: "Sign in to Pholio" })}`;

  return getPholioEmailShell({
    preheader: "Your Pholio password was changed",
    bodyHtml,
  });
}

/**
 * Magic sign-in link (passwordless login).
 */
function buildMagicSignInEmailHtml({
  firstName,
  signInUrl,
  expiresMinutes = 15,
}) {
  const bodyHtml = `
    ${buildGreeting(firstName)}
    ${buildHeadline("Your sign-in link")}
    ${buildBodyCopy("Click below to sign in to Pholio. No password needed.")}
    ${buildCtaButton({ href: signInUrl, label: "Sign in to Pholio" })}
    ${buildSecondaryLink({ href: signInUrl, label: signInUrl })}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};">
      This link expires in ${expiresMinutes} minutes and can only be used once.
    </p>
    ${buildSecurityNote(
      "If you didn't request this link, you can safely ignore this email.",
    )}`;

  return getPholioEmailShell({
    preheader: "Sign in to Pholio — one tap, no password",
    bodyHtml,
  });
}

/**
 * Agency team member invite.
 */
function buildTeamInviteEmailHtml({
  inviteeName,
  agencyName,
  inviterName,
  roleLabel,
  acceptUrl,
}) {
  const bodyHtml = `
    ${buildGreeting(inviteeName)}
    ${buildHeadline(`You've been invited to ${escapeHtml(agencyName || "an agency")}`)}
    ${buildBodyCopy(
      `<strong style="color:${BRAND.text};">${escapeHtml(inviterName || "A team member")}</strong> invited you to join <strong style="color:${BRAND.text};">${escapeHtml(agencyName || "their agency")}</strong> on Pholio as <strong style="color:${BRAND.text};">${escapeHtml(roleLabel || "Agent")}</strong>.`,
    )}
    ${buildCtaButton({ href: acceptUrl, label: "Accept invitation" })}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.textMuted};">
      You'll need a Pholio account (or to sign in) to accept. This invitation expires in 7 days.
    </p>`;

  return getPholioEmailShell({
    preheader: `${inviterName} invited you to ${agencyName} on Pholio`,
    bodyHtml,
  });
}

/**
 * Guardian consent — premium shell with hero band + legal footer.
 */
function getGuardianConsentEmailShell({ preheader = "", heroHtml = "", bodyHtml = "" }) {
  const preheaderText = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Pholio · Guardian consent</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-card-flush { padding: 0 !important; }
      .email-body-pad { padding: 28px 20px !important; }
      .email-hero-pad { padding: 28px 20px !important; }
      .email-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .talent-photo-col { display: block !important; width: 100% !important; padding: 0 0 16px !important; text-align: center !important; }
      .talent-copy-col { display: block !important; width: 100% !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheaderText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              ${buildEmailBrandMark({ width: 156 })}
            </td>
          </tr>
          <tr>
            <td class="email-card email-card-flush" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(26,24,21,0.08);padding:0;">
              ${heroHtml}
              <div class="email-body-pad" style="padding:32px 36px 36px;">${bodyHtml}</div>
            </td>
          </tr>
          ${buildEmailFooter({ includeLegal: true })}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildTalentInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function buildGuardianConsentHero({ talentName, talentPhotoUrl, talentCity }) {
  const safeName = escapeHtml(talentName || "Talent profile");
  const safeCity = talentCity ? escapeHtml(talentCity) : null;
  const photoSrc = resolveEmailAssetUrl(talentPhotoUrl);
  const initials = escapeHtml(buildTalentInitials(talentName));

  const avatarHtml = photoSrc
    ? `<img src="${escapeHtml(photoSrc)}" alt="${safeName}" width="72" height="72" style="display:block;width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid ${BRAND.card};box-shadow:0 4px 16px rgba(26,24,21,0.12);" />`
    : `<table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td align="center" width="72" height="72" style="width:72px;height:72px;border-radius:50%;background-color:${BRAND.goldGhost};border:2px solid rgba(201,165,90,0.35);font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:${BRAND.gold};line-height:72px;text-align:center;">${initials}</td>
        </tr>
      </table>`;

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.goldMuted};border-bottom:1px solid ${BRAND.border};">
    <tr>
      <td class="email-hero-pad" style="padding:32px 36px 28px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td class="talent-photo-col" valign="middle" width="88" style="width:88px;padding-right:18px;vertical-align:middle;">
              ${avatarHtml}
            </td>
            <td class="talent-copy-col" valign="middle" style="vertical-align:middle;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">Consent request</p>
              <h1 style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:400;color:${BRAND.text};letter-spacing:-0.01em;">${safeName}</h1>
              ${safeCity ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.textMuted};">${safeCity}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function buildLeadParagraph(html) {
  return `<p style="margin:0 0 28px;font-size:16px;line-height:1.65;color:${BRAND.textSecondary};">${html}</p>`;
}

function buildSupportingCopy(html) {
  return `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">${html}</p>`;
}

function buildInfoPanel({ title, items }) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td valign="top" width="10" style="padding:0 10px 10px 0;vertical-align:top;">
          <span style="display:inline-block;width:6px;height:6px;margin-top:7px;border-radius:50%;background-color:${BRAND.gold};"></span>
        </td>
        <td valign="top" style="padding:0 0 10px;vertical-align:top;">
          <p style="margin:0;font-size:14px;line-height:1.55;color:${BRAND.textSecondary};">${item}</p>
        </td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background-color:${BRAND.canvas};border:1px solid ${BRAND.border};border-radius:12px;">
    <tr>
      <td style="padding:18px 20px;">
        <p style="margin:0 0 12px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">${escapeHtml(title)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>
      </td>
    </tr>
  </table>`;
}

function buildLegalConsentBlock() {
  const marketing = getMarketingSiteUrl();
  const linkStyle = `color:${BRAND.gold};text-decoration:underline;font-weight:600;`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;">
    <tr>
      <td style="padding:18px 20px;background-color:${BRAND.canvas};border-radius:12px;border:1px solid ${BRAND.border};">
        <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.gold};font-weight:700;">Legal &amp; privacy</p>
        <p style="margin:0;font-size:13px;line-height:1.65;color:${BRAND.textSecondary};">
          Confirming consent authorizes Pholio to collect and share this talent&apos;s profile information
          (including measurements and imagery) with agencies as described in our
          <a href="${escapeHtml(`${marketing}/privacy`)}" style="${linkStyle}">Privacy Policy</a>.
          Platform use is governed by our
          <a href="${escapeHtml(`${marketing}/terms`)}" style="${linkStyle}">Terms of Service</a>
          and
          <a href="${escapeHtml(`${marketing}/ai-notice`)}" style="${linkStyle}">AI Notice</a>.
        </p>
      </td>
    </tr>
  </table>`;
}

/**
 * Guardian consent verification for minor talent profiles.
 */
function buildGuardianConsentEmailHtml({
  guardianName,
  talentName,
  talentPhotoUrl,
  talentCity,
  agencyName,
  consentUrl,
  expiresDays = 7,
}) {
  const marketing = getMarketingSiteUrl();
  const safeTalent = escapeHtml(talentName || "this talent");
  const greetingName = guardianName ? escapeHtml(guardianName) : null;
  const safeAgency = agencyName ? escapeHtml(agencyName) : null;
  const heroHtml = buildGuardianConsentHero({
    talentName,
    talentPhotoUrl,
    talentCity,
  });

  const bodyHtml = `
    <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:${BRAND.text};font-weight:400;">
      ${greetingName ? `Hi ${greetingName},` : "Hello,"}
    </p>
    ${buildLeadParagraph(
      safeAgency
        ? `<strong style="color:${BRAND.text};font-weight:600;">${safeTalent}</strong> listed you as their parent or legal guardian and needs your permission to send their profile, measurements, and images to <strong style="color:${BRAND.text};font-weight:600;">${safeAgency}</strong> for representation review.`
        : `<strong style="color:${BRAND.text};font-weight:600;">${safeTalent}</strong> listed you as their parent or legal guardian on Pholio and needs your verified consent to continue building their portfolio.`,
    )}
    ${buildInfoPanel({
      title: "What you are confirming",
      items: [
        "You are the parent or legal guardian of this talent.",
        safeAgency
          ? `Pholio may disclose this talent's measurements, full-length photos, and profile details to ${safeAgency}.`
          : "Pholio may collect measurements, full-length photos, and profile details for agency submissions.",
        safeAgency
          ? `This permission applies only to ${safeAgency}; another agency requires a separate request.`
          : "Agencies may review this portfolio only after your consent is recorded.",
      ],
    })}
    ${buildSectionLabel("What happens next")}
    ${buildStepList([
      {
        title: "Review the request",
        description:
          "Open the secure link below to see who requested consent and what Pholio will collect.",
      },
      {
        title: "Confirm on Pholio",
        description:
          safeAgency
            ? `One click authorizes this submission to ${safeAgency}.`
            : "One click records verified guardian consent on this talent's profile.",
      },
      {
        title: "They can finish their book",
        description:
          safeAgency
            ? `After confirmation, they can submit this package to ${safeAgency}.`
            : "After confirmation, they can complete measurements, upload imagery, and apply to agencies.",
      },
    ])}
    ${buildCtaButton({ href: consentUrl, label: "Review & confirm consent" })}
    ${buildSupportingCopy(
      `This link is unique to you, works once, and expires in <strong style="color:${BRAND.textSecondary};">${expiresDays} days</strong>.`,
    )}
    ${buildLegalConsentBlock()}
    ${buildSecurityNote(
      `If you did not expect this email or do not consent, ignore it — no consent will be recorded. Learn more at <a href="${escapeHtml(marketing)}" style="color:${BRAND.gold};text-decoration:underline;">pholio.studio</a>.`,
    )}`;

  return getGuardianConsentEmailShell({
    preheader: talentName
      ? `${talentName} needs your guardian consent on Pholio`
      : "A talent on Pholio needs your guardian consent",
    heroHtml,
    bodyHtml,
  });
}

module.exports = {
  BRAND,
  escapeHtml,
  getAppBaseUrl,
  getEmailAppBaseUrl,
  getMarketingSiteUrl,
  resolveEmailAssetUrl,
  getPholioEmailShell,
  buildNewMessageEmailHtml,
  buildApplicationStatusEmailHtml,
  buildAgencyInviteEmailHtml,
  buildWelcomeTalentEmailHtml,
  buildWelcomeAgencyEmailHtml,
  buildEmailVerificationHtml,
  buildPasswordResetEmailHtml,
  buildPasswordChangedEmailHtml,
  buildMagicSignInEmailHtml,
  buildTeamInviteEmailHtml,
  buildGuardianConsentEmailHtml,
};
