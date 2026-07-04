/**
 * Pholio Email — Reusable Blocks (the design system foundation).
 *
 * Every Pholio email is composed from these blocks so the whole inbox
 * experience shares one language. Templates never write raw HTML structure —
 * they assemble blocks and hand them to renderEmail().
 *
 * Technical posture (so it works as real email):
 *   • Table-based layout, inline styles, 600px container.
 *   • Bulletproof button with MSO (Outlook) padding fallback.
 *   • Progressive web-font <link> with Georgia/Inter system fallbacks.
 *   • prefers-color-scheme dark variant that nods to the marketing velvet.
 */

const { COLOR, FONT, SPACE, RADIUS, LAYOUT } = require("./tokens");
const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

/* ── primitives ─────────────────────────────────────────────────────────── */

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A vertical content block: one full-width row inside the card's inner table.
 * `top`/`bottom` carry the spacing rhythm; `align` controls horizontal flow.
 */
function row(inner, { top = 0, bottom = 0, align = "left" } = {}) {
  return `<tr><td align="${align}" style="padding:${top}px 0 ${bottom}px 0;">${inner}</td></tr>`;
}

/* ── editorial type ─────────────────────────────────────────────────────── */

/**
 * The editorial moment of the email — a single serif headline.
 * `emphasis` italicizes a trailing clause in gold (marketing's serif-italic
 * flourish). No uppercase kicker sits above it — the headline stands alone.
 */
function heading(text, { emphasis } = {}) {
  const emphasisHtml = emphasis
    ? ` <span style="font-style:italic;color:${COLOR.gold};">${esc(emphasis)}</span>`
    : "";
  return row(
    `<h1 class="ph-h1" style="margin:0;font-family:${FONT.serif};font-weight:400;font-size:30px;line-height:1.14;letter-spacing:-0.02em;color:${COLOR.ink};">${esc(
      text,
    )}${emphasisHtml}</h1>`,
    { bottom: SPACE.lg },
  );
}

/** Body copy. Inter, generous line-height, warm secondary ink. */
function paragraph(text, { bottom = SPACE.md } = {}) {
  return row(
    `<p class="ph-body" style="margin:0;font-family:${FONT.sans};font-weight:400;font-size:16px;line-height:1.65;color:${COLOR.body};">${text}</p>`,
    { bottom },
  );
}

/** Editorial sign-off — serif italic, muted. Closes every email like a letter. */
function signoff(text = "— The Pholio team") {
  return row(
    `<p style="margin:0;font-family:${FONT.serif};font-style:italic;font-size:16px;line-height:1.5;color:${COLOR.muted};">${esc(
      text,
    )}</p>`,
    { top: SPACE.sm },
  );
}

/* ── accents & structure ────────────────────────────────────────────────── */

/** Short gold accent rule — the editorial flourish (under masthead / signoff). */
function goldRule({ top = 0, bottom = SPACE.lg } = {}) {
  return row(
    `<div style="width:36px;height:2px;background-color:${COLOR.gold};line-height:2px;font-size:0;">&nbsp;</div>`,
    { top, bottom },
  );
}

/** Full-width warm hairline — separates sections quietly. */
function divider({ top = SPACE.lg, bottom = SPACE.lg } = {}) {
  return row(
    `<div class="ph-hairline" style="height:1px;background-color:${COLOR.hairline};line-height:1px;font-size:0;">&nbsp;</div>`,
    { top, bottom },
  );
}

function spacer(height = SPACE.md) {
  return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
}

/* ── actions ────────────────────────────────────────────────────────────── */

/**
 * Bulletproof primary action — gold fill, dark ink label, uppercase tracked
 * (the marketing .btn-gold cadence). MSO comment gives Outlook real padding.
 */
function button(label, url, { align = "left" } = {}) {
  const safeUrl = esc(url);
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr>
        <td class="ph-btn-cell" align="center" bgcolor="${COLOR.gold}" style="border-radius:${RADIUS.button}px;background-color:${COLOR.gold};">
          <!--[if mso]>&nbsp;<![endif]-->
          <a href="${safeUrl}" target="_blank" rel="noopener" class="ph-btn" style="display:inline-block;padding:15px 38px;font-family:${FONT.sans};font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${COLOR.ink};text-decoration:none;border-radius:${RADIUS.button}px;mso-padding-alt:15px 38px;">${esc(
            label,
          )}</a>
          <!--[if mso]>&nbsp;<![endif]-->
        </td>
      </tr>
    </table>`,
    { top: SPACE.xs, bottom: SPACE.xs, align },
  );
}

/** Quiet secondary action — a gold text link with a hairline under it. */
function textLink(label, url) {
  return row(
    `<a href="${esc(url)}" target="_blank" rel="noopener" style="font-family:${FONT.sans};font-size:14px;font-weight:600;color:${COLOR.goldDark};text-decoration:none;border-bottom:1px solid ${COLOR.goldSoft};padding-bottom:1px;">${esc(
      label,
    )}</a>`,
    { top: SPACE.xs, bottom: SPACE.xs },
  );
}

/* ── content panels ─────────────────────────────────────────────────────── */

/** Generic inset warm panel — the structured-product container. */
function panel(innerHtml, { top = SPACE.sm, bottom = SPACE.sm } = {}) {
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="ph-panel" style="background-color:${COLOR.panel};border:1px solid ${COLOR.panelBorder};border-radius:${RADIUS.panel}px;padding:${SPACE.lg}px;">${innerHtml}</td></tr>
    </table>`,
    { top, bottom },
  );
}

/**
 * Verification / sign-in code — large mono, widely tracked, in a warm panel.
 * The single most-scanned element in an auth email; it gets center stage.
 */
function codePanel(code, { caption } = {}) {
  const captionHtml = caption
    ? `<div style="font-family:${FONT.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.muted};padding-bottom:${SPACE.sm}px;">${esc(
        caption,
      )}</div>`
    : "";
  return panel(
    `<div style="text-align:center;">${captionHtml}<div class="ph-code" style="font-family:${FONT.mono};font-size:30px;font-weight:500;letter-spacing:0.28em;color:${COLOR.ink};">${esc(
      code,
    )}</div></div>`,
  );
}

/**
 * Key/value detail rows (role, timestamps, plan). Mono micro labels paired with
 * Inter values — the dashboard's metadata voice.
 */
function detailList(items = []) {
  const rows = items
    .map(
      ({ label, value }, i) =>
        `<tr>
          <td style="padding:${i === 0 ? 0 : SPACE.sm}px 0 0 0;font-family:${FONT.mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted};white-space:nowrap;vertical-align:top;width:38%;">${esc(
            label,
          )}</td>
          <td style="padding:${i === 0 ? 0 : SPACE.sm}px 0 0 0;font-family:${FONT.sans};font-size:14px;color:${COLOR.ink};vertical-align:top;">${esc(
            value,
          )}</td>
        </tr>`,
    )
    .join("");
  return panel(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`,
  );
}

/**
 * Pull-quote style callout — gold left rule, for a message preview or a
 * highlighted line. Editorial without being decorative.
 */
function callout(bodyHtml, { label } = {}) {
  const labelHtml = label
    ? `<div style="font-family:${FONT.mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted};padding-bottom:${SPACE.sm}px;">${esc(
        label,
      )}</div>`
    : "";
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="ph-panel" style="background-color:${COLOR.panel};border:1px solid ${COLOR.panelBorder};border-left:3px solid ${COLOR.gold};border-radius:${RADIUS.button}px;padding:${SPACE.lg}px;">${labelHtml}<div style="font-family:${FONT.sans};font-size:16px;line-height:1.6;color:${COLOR.ink};">${bodyHtml}</div></td></tr>
    </table>`,
    { top: SPACE.sm, bottom: SPACE.sm },
  );
}

/**
 * Person card — circular photo (or gold monogram), name, and a meta line.
 * Used where an email is about a specific person (guardian consent).
 */
function personCard({ name, meta, photoUrl }) {
  const initial = esc((name || "P").trim().charAt(0).toUpperCase());
  const avatar = photoUrl
    ? `<img src="${esc(
        photoUrl,
      )}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:28px;object-fit:cover;border:1px solid ${COLOR.panelBorder};" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="56" height="56" align="center" valign="middle" bgcolor="${COLOR.gold}" style="width:56px;height:56px;border-radius:28px;font-family:${FONT.serif};font-size:24px;color:${COLOR.card};">${initial}</td></tr></table>`;
  const metaHtml = meta
    ? `<div style="font-family:${FONT.sans};font-size:13px;color:${COLOR.muted};padding-top:2px;">${esc(
        meta,
      )}</div>`
    : "";
  return panel(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" style="padding-right:${SPACE.md}px;">${avatar}</td>
        <td valign="middle">
          <div style="font-family:${FONT.serif};font-size:19px;letter-spacing:-0.01em;color:${COLOR.ink};">${esc(
            name,
          )}</div>${metaHtml}
        </td>
      </tr>
    </table>`,
  );
}

/** A small contextual note (security caveat, expiry, "why am I getting this"). */
function note(html) {
  return row(
    `<p style="margin:0;font-family:${FONT.sans};font-size:13px;line-height:1.6;color:${COLOR.muted};">${html}</p>`,
    { top: SPACE.sm },
  );
}

/* ── shell: masthead, footer, document ──────────────────────────────────── */

function masthead() {
  const appUrl = getEmailAppBaseUrl();
  return `
  <tr>
    <td align="center" style="padding:0 0 ${SPACE.xl}px 0;">
      <a href="${appUrl}" target="_blank" rel="noopener" style="text-decoration:none;">
        <span class="ph-wordmark" style="font-family:${FONT.serif};font-size:24px;letter-spacing:-0.01em;color:${COLOR.ink};">Pholio</span>
      </a>
    </td>
  </tr>`;
}

function footer() {
  const appUrl = getEmailAppBaseUrl();
  const marketingUrl = getMarketingSiteUrl();
  const link = (label, url) =>
    `<a href="${url}" target="_blank" rel="noopener" style="color:${COLOR.muted};text-decoration:none;">${label}</a>`;
  const dot = `<span style="color:${COLOR.hairline};"> &nbsp;·&nbsp; </span>`;
  return `
  <tr>
    <td style="padding:${SPACE.xl}px ${SPACE.xs}px 0 ${SPACE.xs}px;">
      <div style="font-family:${FONT.mono};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR.muted};">PHOLIO</div>
      <div style="font-family:${FONT.sans};font-size:13px;line-height:1.6;color:${COLOR.muted};padding-top:6px;">The talent portfolio &amp; agency platform.</div>
      <div style="font-family:${FONT.sans};font-size:13px;line-height:1.6;color:${COLOR.muted};padding-top:${SPACE.sm}px;">
        ${link("Open Pholio", appUrl)}${dot}${link("Help", `${marketingUrl}/support`)}${dot}${link(
          "Privacy",
          `${marketingUrl}/privacy`,
        )}
      </div>
    </td>
  </tr>`;
}

/**
 * The card: a white surface holding the email's content blocks.
 */
function card(blocksHtml) {
  return `
  <tr>
    <td class="ph-card" style="background-color:${COLOR.card};border:1px solid ${COLOR.hairline};border-radius:${RADIUS.card}px;padding:${LAYOUT.gutter}px;box-shadow:0 20px 40px -16px rgba(26,24,21,0.10);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${blocksHtml}
      </table>
    </td>
  </tr>`;
}

const HEAD_STYLE = `
  body { margin:0; padding:0; width:100% !important; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${COLOR.goldDark}; }
  @media only screen and (max-width:620px){
    .ph-container{ width:100% !important; }
    .ph-card{ padding:28px 22px !important; }
    .ph-h1{ font-size:26px !important; }
    .ph-code{ font-size:26px !important; letter-spacing:0.2em !important; }
  }
  @media (prefers-color-scheme: dark){
    .ph-canvas{ background-color:${COLOR.darkCanvas} !important; }
    .ph-card{ background-color:${COLOR.darkCard} !important; border-color:rgba(255,255,255,0.08) !important; box-shadow:none !important; }
    .ph-panel{ background-color:${COLOR.darkPanel} !important; border-color:rgba(255,255,255,0.07) !important; }
    .ph-h1, .ph-wordmark, .ph-code{ color:${COLOR.darkInk} !important; }
    .ph-body{ color:${COLOR.darkBody} !important; }
    .ph-hairline{ background-color:rgba(255,255,255,0.08) !important; }
    .ph-btn{ color:${COLOR.ink} !important; }
  }
`;

/**
 * renderEmail — the one composition entry point templates call.
 * @param {{subject?:string, previewText?:string, blocks:string[]}} opts
 */
function renderEmail({ subject = "Pholio", previewText = "", blocks = [] } = {}) {
  const content = blocks.join("\n");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
  <style>${HEAD_STYLE}</style>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(
    previewText,
  )}</div>
  <table role="presentation" class="ph-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.canvas}" style="background-color:${COLOR.canvas};">
    <tr>
      <td align="center" style="padding:${SPACE.xl}px ${SPACE.md}px;">
        <table role="presentation" class="ph-container" width="${LAYOUT.width}" cellpadding="0" cellspacing="0" border="0" style="width:${LAYOUT.width}px;max-width:${LAYOUT.width}px;margin:0 auto;">
          ${masthead()}
          ${card(content)}
          ${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  esc,
  row,
  heading,
  paragraph,
  signoff,
  goldRule,
  divider,
  spacer,
  button,
  textLink,
  panel,
  codePanel,
  detailList,
  callout,
  personCard,
  note,
  renderEmail,
};
