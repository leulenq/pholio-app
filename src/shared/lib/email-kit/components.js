/**
 * Pholio Email Framework — Component Kit
 * ------------------------------------------------------------------
 * Composable, email-client-safe building blocks. Every component
 * returns an inline-styled HTML string and pulls colour/type from
 * `theme`, so the whole library re-themes from one file.
 *
 * Design rules (enforced — see CLAUDE.md "Banned UI Patterns"):
 *   • The heading is the hero. NO eyebrow / kicker / uppercase label
 *     sitting above a heading.
 *   • NO "New / Beta / Live / AI-powered" badge chips.
 *   • NO corner metadata chips, NO frosted glass.
 * Editorial flourishes (ornament rule, metric captions BELOW a figure)
 * are intentional and allowed — they are not kickers.
 */

const { theme } = require("./theme");

/* ---------------------------------------------------------------- *
 * Utilities
 * ---------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Vertical rhythm. Use instead of stacking <br> or relying on margins
// (Outlook is unreliable with margins on block elements).
function spacer(height = 24) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr></table>`;
}

/* ---------------------------------------------------------------- *
 * Typography
 * ---------------------------------------------------------------- */

// Editorial display heading — used ALONE, never with an eyebrow above it.
function heading(text, { size = 30, align = "left", color = theme.ink } = {}) {
  return `<h1 style="margin:0;font-family:${theme.fontDisplay};font-size:${size}px;line-height:1.18;font-weight:500;letter-spacing:-0.01em;color:${color};text-align:${align};">${text}</h1>`;
}

function subheading(text, { align = "left" } = {}) {
  return `<h2 style="margin:0;font-family:${theme.fontBody};font-size:16px;line-height:1.4;font-weight:600;color:${theme.ink};text-align:${align};">${text}</h2>`;
}

// Larger intro paragraph that sits directly under a heading.
function lead(html, { align = "left" } = {}) {
  return `<p style="margin:0;font-family:${theme.fontBody};font-size:16px;line-height:1.65;color:${theme.muted};text-align:${align};">${html}</p>`;
}

function text(html, { align = "left", color = theme.muted, size = 15 } = {}) {
  return `<p style="margin:0;font-family:${theme.fontBody};font-size:${size}px;line-height:1.65;color:${color};text-align:${align};">${html}</p>`;
}

// Inline emphasis helper for use inside copy strings.
function strong(t) {
  return `<strong style="color:${theme.ink};font-weight:600;">${t}</strong>`;
}

function link(href, label) {
  return `<a href="${escapeHtml(href)}" style="color:${theme.gold};text-decoration:underline;font-weight:600;">${label ?? escapeHtml(href)}</a>`;
}

/* ---------------------------------------------------------------- *
 * Wordmark
 * ---------------------------------------------------------------- */

function wordmark({ align = "center", size = 26 } = {}) {
  return `<a href="${theme.siteUrl}" style="font-family:${theme.fontDisplay};font-size:${size}px;font-weight:500;letter-spacing:0.14em;color:${theme.gold};text-decoration:none;text-transform:uppercase;display:inline-block;text-align:${align};">${theme.brandName}</a>`;
}

/* ---------------------------------------------------------------- *
 * Dividers
 * ---------------------------------------------------------------- */

function divider({ space = 28 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${space}px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${theme.border};">&nbsp;</div></td></tr></table>`;
}

// Editorial flourish: gold rule · dot · gold rule. A decorative divider,
// not an eyebrow.
function ornament({ space = 24, align = "center" } = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:${space}px ${align === "center" ? "auto" : "0"};">
    <tr>
      <td style="width:44px;height:1px;background:${theme.gold};opacity:0.55;font-size:0;line-height:0;">&nbsp;</td>
      <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
      <td style="width:5px;height:5px;background:${theme.gold};border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
      <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
      <td style="width:44px;height:1px;background:${theme.gold};opacity:0.55;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;
}

/* ---------------------------------------------------------------- *
 * Buttons — bulletproof (VML rounded rect for Outlook)
 * ---------------------------------------------------------------- */

function button(
  href,
  label,
  { variant = "primary", width = 232, align = "left" } = {},
) {
  const isPrimary = variant === "primary";
  const fill = isPrimary ? theme.gold : theme.surface;
  const textColor = isPrimary ? theme.ink : theme.ink;
  const stroke = isPrimary ? theme.gold : theme.borderStrong;
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${align === "center" ? 'align="center" style="margin:0 auto;"' : ""}>
    <tr>
      <td>
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="22%" strokecolor="${stroke}" fillcolor="${fill}">
          <w:anchorlock/>
          <center style="color:${textColor};font-family:${theme.fontBody};font-size:15px;font-weight:600;">${safeLabel}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${safeHref}" class="ph-btn" style="display:inline-block;min-width:${width - 64}px;padding:14px 32px;font-family:${theme.fontBody};font-size:15px;font-weight:600;line-height:20px;color:${textColor};text-align:center;text-decoration:none;border-radius:${theme.radiusSm}px;background:${fill};border:1px solid ${stroke};">${safeLabel}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

// Quiet text-link CTA — used below a primary button as a secondary path.
function textCta(href, label, { align = "left" } = {}) {
  return `<p style="margin:0;text-align:${align};font-family:${theme.fontBody};font-size:14px;line-height:1.5;"><a href="${escapeHtml(href)}" style="color:${theme.gold};text-decoration:none;font-weight:600;">${escapeHtml(label)} &rarr;</a></p>`;
}

// "Button not working? Copy this link" fallback for auth flows.
function fallbackLink(href) {
  return `<p style="margin:0;font-family:${theme.fontBody};font-size:13px;line-height:1.55;color:${theme.faint};word-break:break-all;">Or paste this link into your browser:<br /><a href="${escapeHtml(href)}" style="color:${theme.gold};text-decoration:underline;">${escapeHtml(href)}</a></p>`;
}

/* ---------------------------------------------------------------- *
 * Panels & callouts
 * ---------------------------------------------------------------- */

// Generic nested surface (sunken cream panel).
function panel(innerHtml, { pad = 20 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.surfaceSunken};border:1px solid ${theme.border};border-radius:${theme.radiusSm}px;"><tr><td style="padding:${pad}px;">${innerHtml}</td></tr></table>`;
}

// Left-ruled accent callout (concierge note, security note, tips).
function callout(html, { title, accent = theme.gold } = {}) {
  const titleHtml = title
    ? `<p style="margin:0 0 4px;font-family:${theme.fontBody};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${accent};font-weight:700;">${escapeHtml(title)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.surfaceSunken};border:1px solid ${theme.border};border-left:3px solid ${accent};border-radius:${theme.radiusSm}px;"><tr><td style="padding:16px 20px;">${titleHtml}<p style="margin:0;font-family:${theme.fontBody};font-size:13px;line-height:1.6;color:${theme.muted};">${html}</p></td></tr></table>`;
}

// Blockquote-style message preview (agency → talent etc).
function quote(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${theme.gold};padding:16px 22px;background:${theme.surfaceSunken};border-radius:0 ${theme.radiusSm}px ${theme.radiusSm}px 0;"><p style="margin:0;font-family:${theme.fontDisplay};font-size:17px;line-height:1.6;color:${theme.body};font-style:italic;">&ldquo;${html}&rdquo;</p></td></tr></table>`;
}

// Verification / one-time code block.
function codeBlock(code, { label = "Verification code" } = {}) {
  const digits = escapeHtml(String(code ?? "").trim());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.surfaceSunken};border:1px solid ${theme.border};border-radius:${theme.radiusSm}px;"><tr><td align="center" style="padding:22px 28px;"><p style="margin:0 0 10px;font-family:${theme.fontBody};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${theme.faint};font-weight:600;">${escapeHtml(label)}</p><p style="margin:0;font-family:${theme.fontMono};font-size:34px;letter-spacing:0.34em;color:${theme.ink};font-weight:700;">${digits}</p></td></tr></table>`;
}

/* ---------------------------------------------------------------- *
 * Data display
 * ---------------------------------------------------------------- */

// Three serif figures with captions BELOW (a caption, not a kicker).
function statRow(stats) {
  const cells = stats
    .map(
      (s) => `<td class="ph-col" align="center" width="${Math.floor(100 / stats.length)}%" style="padding:0 6px;text-align:center;vertical-align:top;">
        <p style="margin:0 0 3px;font-family:${theme.fontDisplay};font-size:26px;line-height:1.1;color:${theme.gold};font-weight:500;">${escapeHtml(s.value)}</p>
        <p style="margin:0;font-family:${theme.fontBody};font-size:11px;letter-spacing:0.08em;color:${theme.faint};font-weight:500;">${escapeHtml(s.label)}</p>
      </td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.surfaceSunken};border:1px solid ${theme.border};border-radius:${theme.radiusSm}px;"><tr><td style="padding:22px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr></table>`;
}

// Label : value detail rows (booking details, account info).
function detailList(rows) {
  const body = rows
    .map(
      (r, i) => `<tr>
        <td style="padding:${i === 0 ? "0" : "10px"} 16px 10px 0;font-family:${theme.fontBody};font-size:13px;color:${theme.faint};vertical-align:top;white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td style="padding:${i === 0 ? "0" : "10px"} 0 10px 0;font-family:${theme.fontBody};font-size:14px;color:${theme.ink};font-weight:500;text-align:right;vertical-align:top;">${r.value}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.surfaceSunken};border:1px solid ${theme.border};border-radius:${theme.radiusSm}px;"><tr><td style="padding:18px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr></table>`;
}

// Editorial feature rows: glyph + title + description (no chips).
function featureList(items) {
  const rows = items
    .map(
      (it, i) => `<tr>
        <td width="40" valign="top" style="padding:${i === 0 ? "0" : "18px"} 16px 0 0;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" width="34" height="34" style="width:34px;height:34px;background:${theme.goldGhost};border:1px solid ${theme.goldLine};border-radius:50%;font-family:${theme.fontBody};font-size:15px;color:${theme.gold};line-height:34px;text-align:center;">${it.icon ?? "&bull;"}</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:${i === 0 ? "0" : "18px"} 0 0 0;vertical-align:top;">
          <p style="margin:0 0 3px;font-family:${theme.fontBody};font-size:15px;line-height:1.4;color:${theme.ink};font-weight:600;">${escapeHtml(it.title)}</p>
          <p style="margin:0;font-family:${theme.fontBody};font-size:13px;line-height:1.6;color:${theme.muted};">${it.description}</p>
        </td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

// Numbered editorial steps (getting-started flows).
function stepList(steps) {
  const rows = steps
    .map(
      (s, i) => `<tr>
        <td width="36" valign="top" style="padding:${i === 0 ? "0" : "16px"} 14px 0 0;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" width="28" height="28" style="width:28px;height:28px;background:${theme.gold};border-radius:50%;font-family:${theme.fontBody};font-size:13px;font-weight:700;color:${theme.ink};line-height:28px;text-align:center;">${i + 1}</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:${i === 0 ? "0" : "16px"} 0 0 0;vertical-align:top;">
          <p style="margin:0 0 3px;font-family:${theme.fontBody};font-size:14px;line-height:1.4;color:${theme.ink};font-weight:600;">${escapeHtml(s.title)}</p>
          <p style="margin:0;font-family:${theme.fontBody};font-size:13px;line-height:1.6;color:${theme.muted};">${s.description}</p>
        </td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

/* ---------------------------------------------------------------- *
 * Hero
 * ---------------------------------------------------------------- */

// Tinted hero band — heading + supporting line + ornament. NO eyebrow,
// NO badge. The headline carries the message on its own.
function hero({ title, subtitle }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.goldSoft};border-bottom:1px solid ${theme.border};">
    <tr>
      <td class="ph-pad-hero" align="center" style="padding:44px 40px 38px;text-align:center;">
        ${heading(title, { size: 32, align: "center" })}
        ${subtitle ? `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>${lead(subtitle, { align: "center" })}` : ""}
        ${ornament({ space: 22 })}
      </td>
    </tr>
  </table>`;
}

module.exports = {
  escapeHtml,
  spacer,
  heading,
  subheading,
  lead,
  text,
  strong,
  link,
  wordmark,
  divider,
  ornament,
  button,
  textCta,
  fallbackLink,
  panel,
  callout,
  quote,
  codeBlock,
  statRow,
  detailList,
  featureList,
  stepList,
  hero,
};
