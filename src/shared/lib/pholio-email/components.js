/**
 * Pholio Email — AGENCY components (the older dark composition).
 *
 * Used only by templates-agency.js. The talent system uses ./primitives.js and
 * ./blocks.js instead. Do not mix the two in one email.
 */
const { COLOR, FONT, SPACE, RADIUS, LAYOUT } = require("./tokens-agency");
const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(inner, { top = 0, bottom = 0, align = "left" } = {}) {
  return `<tr><td align="${align}" style="padding:${top}px 0 ${bottom}px 0;">${inner}</td></tr>`;
}

function heading(text, { emphasis } = {}) {
  const emphasisHtml = emphasis
    ? ` <span style="font-style:italic;color:${COLOR.gold};">${esc(emphasis)}</span>`
    : "";
  return row(
    `<h1 class="ph-h1" style="margin:0;font-family:${FONT.serif};font-weight:500;font-size:42px;line-height:1.08;letter-spacing:-0.02em;color:${COLOR.ink};text-wrap:balance;">${esc(text)}${emphasisHtml}</h1>`,
    { bottom: SPACE.lg },
  );
}

function paragraph(html, { bottom = SPACE.md } = {}) {
  return row(
    `<p class="ph-body" style="margin:0;font-family:${FONT.sans};font-size:16px;line-height:1.72;color:${COLOR.body};">${html}</p>`,
    { bottom },
  );
}

function note(html, { tone = "default" } = {}) {
  const color = tone === "danger" ? COLOR.danger : COLOR.muted;
  return row(
    `<p style="margin:0;font-family:${FONT.sans};font-size:13px;line-height:1.65;color:${color};">${html}</p>`,
    { top: SPACE.sm, bottom: SPACE.xs },
  );
}

function signoff(text = "Pholio") {
  return row(
    `<p style="margin:0;font-family:${FONT.serif};font-style:italic;font-size:17px;line-height:1.5;color:${COLOR.muted};">— ${esc(text)}</p>`,
    { top: SPACE.md },
  );
}

function goldRule({ bottom = SPACE.lg } = {}) {
  return row(`<div style="width:64px;height:1px;background-color:${COLOR.gold};line-height:1px;font-size:0;">&nbsp;</div>`, { bottom });
}

function divider({ top = SPACE.lg, bottom = SPACE.lg } = {}) {
  return row(`<div class="ph-hairline" style="height:1px;background-color:${COLOR.hairlineSoft};line-height:1px;font-size:0;">&nbsp;</div>`, { top, bottom });
}

function button(label, url, { align = "left" } = {}) {
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr><td align="center" bgcolor="${COLOR.gold}" style="border-radius:${RADIUS.button}px;background-color:${COLOR.gold};">
        <a class="ph-btn" href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 34px;font-family:${FONT.sans};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.goldInk};text-decoration:none;border-radius:${RADIUS.button}px;">${esc(label)}</a>
      </td></tr>
    </table>`,
    { top: SPACE.sm, bottom: SPACE.sm, align },
  );
}

function panel(innerHtml, { top = SPACE.sm, bottom = SPACE.sm } = {}) {
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="ph-panel" style="background-color:${COLOR.panel};border:1px solid ${COLOR.hairline};border-radius:${RADIUS.panel}px;padding:${SPACE.lg}px;">${innerHtml}</td></tr></table>`,
    { top, bottom },
  );
}

function codePanel(code, { caption = "Code" } = {}) {
  return panel(
    `<div style="text-align:center;"><div style="font-family:${FONT.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.muted};padding-bottom:${SPACE.sm}px;">${esc(caption)}</div><div class="ph-code" style="font-family:${FONT.mono};font-size:34px;font-weight:600;letter-spacing:0.3em;color:${COLOR.ink};">${esc(code)}</div></div>`,
  );
}

function detailList(items = []) {
  const rows = items.map(({ label, value }, i) => `<tr><td style="padding:${i ? SPACE.sm : 0}px ${SPACE.md}px 0 0;font-family:${FONT.mono};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${COLOR.muted};white-space:nowrap;vertical-align:top;width:34%;">${esc(label)}</td><td style="padding:${i ? SPACE.sm : 0}px 0 0 0;font-family:${FONT.sans};font-size:14px;line-height:1.55;color:${COLOR.ink};vertical-align:top;">${esc(value)}</td></tr>`).join("");
  return panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`);
}

function callout(bodyHtml, { label } = {}) {
  const labelHtml = label ? `<div style="font-family:${FONT.mono};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${COLOR.gold};padding-bottom:${SPACE.sm}px;">${esc(label)}</div>` : "";
  return panel(`${labelHtml}<div style="font-family:${FONT.serif};font-size:22px;line-height:1.45;color:${COLOR.ink};">${bodyHtml}</div>`);
}

function personCard({ name, meta, photoUrl }) {
  const initial = esc((name || "P").trim().charAt(0).toUpperCase());
  const avatar = photoUrl
    ? `<img src="${esc(photoUrl)}" width="72" height="92" alt="" style="display:block;width:72px;height:92px;object-fit:cover;border-radius:${RADIUS.frame}px;border:1px solid ${COLOR.hairline};" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="72" height="92" align="center" valign="middle" bgcolor="${COLOR.panelWarm}" style="width:72px;height:92px;border-radius:${RADIUS.frame}px;border:1px solid ${COLOR.hairline};font-family:${FONT.serif};font-size:32px;color:${COLOR.gold};">${initial}</td></tr></table>`;
  const metaHtml = meta ? `<div style="font-family:${FONT.sans};font-size:13px;color:${COLOR.muted};padding-top:4px;">${esc(meta)}</div>` : "";
  return panel(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:${SPACE.md}px;">${avatar}</td><td valign="middle"><div style="font-family:${FONT.serif};font-size:24px;letter-spacing:-0.01em;color:${COLOR.ink};">${esc(name || "Pending talent")}</div>${metaHtml}</td></tr></table>`);
}

function masthead() {
  return `<tr><td style="padding:0 0 ${SPACE.xl}px 0;"><a href="${esc(getEmailAppBaseUrl())}" target="_blank" rel="noopener" style="text-decoration:none;"><span class="ph-wordmark" style="font-family:${FONT.serif};font-size:28px;letter-spacing:-0.02em;color:${COLOR.ink};">Pholio</span></a></td></tr>`;
}

function footer() {
  const marketingUrl = getMarketingSiteUrl();
  const link = (label, url) => `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:${COLOR.muted};text-decoration:none;border-bottom:1px solid ${COLOR.hairline};">${esc(label)}</a>`;
  return `<tr><td style="padding:${SPACE.xl}px 0 0 0;"><div style="height:1px;background-color:${COLOR.hairlineSoft};line-height:1px;font-size:0;">&nbsp;</div><p style="margin:${SPACE.md}px 0 0;font-family:${FONT.sans};font-size:12px;line-height:1.7;color:${COLOR.ghost};">Pholio Studio · Talent portfolios and agency tools. ${link("Privacy", `${marketingUrl}/privacy`)} &nbsp; ${link("Terms", `${marketingUrl}/terms`)} &nbsp; <a href="mailto:support@pholio.studio" style="color:${COLOR.muted};text-decoration:none;border-bottom:1px solid ${COLOR.hairline};">support@pholio.studio</a></p></td></tr>`;
}

function renderEmail({ previewText = "", blocks = [] } = {}) {
  return `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Pholio</title><style>
  body{margin:0;padding:0;width:100%!important;background:${COLOR.stage};} table{border-collapse:collapse;} img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;} a{color:${COLOR.gold};}
  @media only screen and (max-width:760px){.ph-container{width:100%!important}.ph-frame{padding:34px 22px!important}.ph-h1{font-size:32px!important}.ph-code{font-size:28px!important;letter-spacing:.2em!important}.ph-btn{display:block!important;text-align:center!important}.ph-panel{padding:22px!important}}
</style></head><body class="ph-canvas" style="margin:0;padding:0;background-color:${COLOR.stage};font-family:${FONT.sans};-webkit-font-smoothing:antialiased;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="min-width:100%;background-color:${COLOR.stage};background-image:radial-gradient(circle at 18% 0%, rgba(201,165,90,.22) 0, rgba(201,165,90,.08) 28%, rgba(5,4,3,0) 58%),radial-gradient(circle at 85% 22%, rgba(245,241,234,.09) 0, rgba(5,4,3,0) 44%);"><tr><td align="center" style="padding:0;"><table role="presentation" class="ph-container" width="${LAYOUT.width}" cellpadding="0" cellspacing="0" border="0" style="width:${LAYOUT.width}px;max-width:${LAYOUT.width}px;"><tr><td class="ph-frame" style="padding:${LAYOUT.gutter}px ${LAYOUT.gutter}px ${SPACE.xl}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${masthead()}${blocks.join("\n")}${footer()}</table></td></tr></table></td></tr></table></body></html>`;
}

module.exports = { esc, row, heading, paragraph, note, signoff, goldRule, divider, button, panel, codePanel, detailList, callout, personCard, renderEmail };
