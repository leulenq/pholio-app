/**
 * Pholio Email Framework — Document Shell
 * ------------------------------------------------------------------
 * The bulletproof outer chrome every email is rendered into:
 *   • Forced LIGHT colour-scheme — the warm cream brand must never be
 *     auto-inverted into mud by dark-mode clients.
 *   • Outlook MSO ghost tables + PixelsPerInch fix for width control.
 *   • Web fonts (Playfair Display + Inter) with Georgia/Arial fallback.
 *   • Hidden preheader (+ whitespace dampener) to control inbox preview.
 *   • Fluid-hybrid responsive: fixed desktop column, full-width mobile.
 *
 * Compose body content from the component kit and pass it as `content`.
 */

const { theme } = require("./theme");
const { escapeHtml, wordmark } = require("./components");

function renderEmail({
  title = theme.brandName,
  preheader = "",
  content = "",
  // Set false for full-bleed bodies (e.g. an image/hero that should
  // touch the card edge); then pad sections yourself.
  padded = true,
  footerLinks = [],
} = {}) {
  const pre = escapeHtml(preheader);
  // Whitespace characters after the preheader stop clients from pulling
  // real body copy into the inbox preview line.
  const preheaderDamp = " ‌".repeat(80);

  const footerExtra = footerLinks
    .map(
      (l) =>
        `&nbsp;·&nbsp;<a href="${escapeHtml(l.href)}" style="color:${theme.muted};text-decoration:underline;">${escapeHtml(l.label)}</a>`,
    )
    .join("");

  const cardBody = padded
    ? `<tr><td class="ph-pad" style="padding:40px 44px;">${content}</td></tr>`
    : `<tr><td style="padding:0;">${content}</td></tr>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <!--[if !mso]><!-->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="${theme.fontHref}" rel="stylesheet" />
  <!--<![endif]-->
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    html, body { margin:0 !important; padding:0 !important; width:100% !important; background:${theme.canvas}; }
    * { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a { text-decoration:none; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }

    /* Hover lift on the primary button (supported clients only) */
    .ph-btn { transition: background-color 0.2s cubic-bezier(0.4,0,0.2,1); }
    .ph-btn:hover { background:${theme.goldHover} !important; border-color:${theme.goldHover} !important; }

    @media only screen and (max-width:620px) {
      .ph-container { width:100% !important; }
      .ph-pad { padding:30px 22px !important; }
      .ph-pad-hero { padding:36px 22px 30px !important; }
      .ph-col { display:block !important; width:100% !important; padding-bottom:16px !important; }
      .ph-btn { display:block !important; width:100% !important; box-sizing:border-box !important; }
    }

    /* Hold the line against forced dark-mode in clients that honour it */
    @media (prefers-color-scheme: dark) {
      body, .ph-bg { background:${theme.canvas} !important; }
      .ph-card { background:${theme.surface} !important; }
    }
  </style>
</head>
<body class="ph-bg" style="margin:0;padding:0;background:${theme.canvas};font-family:${theme.fontBody};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${pre}${preheaderDamp}</div>

  <table role="presentation" class="ph-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.canvas};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" align="center" width="${theme.contentWidth}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="ph-container" width="${theme.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${theme.contentWidth}px;max-width:${theme.contentWidth}px;margin:0 auto;">

          <!-- Wordmark -->
          <tr>
            <td align="center" style="padding-bottom:26px;">${wordmark()}</td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="ph-card" style="background:${theme.surface};border:1px solid ${theme.border};border-radius:${theme.radius}px;overflow:hidden;box-shadow:${theme.shadowCard};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${cardBody}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:26px 16px 0;">
              <p style="margin:0 0 8px;font-family:${theme.fontBody};font-size:12px;line-height:1.6;color:${theme.faint};">&copy; ${new Date().getFullYear()} ${theme.brandName} Studio &middot; ${theme.tagline}</p>
              <p style="margin:0;font-family:${theme.fontBody};font-size:11px;line-height:1.6;color:${theme.faint};">
                <a href="${theme.siteUrl}" style="color:${theme.muted};text-decoration:underline;">${theme.siteLabel}</a>${footerExtra}
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { renderEmail };
