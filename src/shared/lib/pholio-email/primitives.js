/**
 * Pholio Email — layout primitives.
 *
 * Everything here is a table. No flex, no grid, no max-width, no margins:
 * Outlook's Word engine supports none of them. Vertical space is a table row
 * with an explicit height; a hairline is a table cell with a background and a
 * collapsed line-height. These two constructs render identically everywhere,
 * including Outlook 2007, and are the whole layout system.
 */

const { COLOR, FONT, LAYOUT } = require("./tokens");

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A vertical gap. */
function space(height) {
  return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
}

/** A 1px rule spanning the content measure. */
function hairline(color = COLOR.rule) {
  return `<tr><td style="padding:0 ${LAYOUT.gutter}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="height:1px;line-height:1px;font-size:0;background:${color};">&nbsp;</td></tr></table></td></tr>`;
}

/** A full-bleed 1px rule — edge to edge, no gutter. */
function bleedRule(color = COLOR.ruleGold) {
  return `<tr><td style="height:1px;line-height:1px;font-size:0;background:${color};">&nbsp;</td></tr>`;
}

/** A content row inside the gutters. */
function row(inner, { align = "left" } = {}) {
  return `<tr><td align="${align}" style="padding:0 ${LAYOUT.gutter}px;">${inner}</td></tr>`;
}

/**
 * The outer shell. Cream all the way out — there is no card, no shadow and no
 * border, so the margin is the frame.
 *
 * `preheader` is the inbox preview line. It is padded with zero-width joiners
 * so the client does not trail body copy into the preview after it.
 */
function shell({ preheader = "", rows = [] } = {}) {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;font-size:1px;line-height:1px;">${esc(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";
  return `${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.paper}" style="margin:0;padding:0;border-collapse:collapse;background:${COLOR.paper};">
<tr><td align="center" style="padding:0;background:${COLOR.paper};">
<!--[if mso]><table role="presentation" align="center" width="${LAYOUT.width}" cellpadding="0" cellspacing="0" border="0"><tr><td width="${LAYOUT.width}"><![endif]-->
<table role="presentation" width="${LAYOUT.width}" cellpadding="0" cellspacing="0" border="0" style="width:${LAYOUT.width}px;max-width:${LAYOUT.width}px;border-collapse:collapse;background:${COLOR.paper};">
${rows.join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
}

/** Wraps a body fragment in a full document with dark-mode hints. */
function document_({ title = "Pholio", body = "" } = {}) {
  return `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title><style>
body{margin:0;padding:0;width:100%!important;background:${COLOR.paper};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;} img{border:0;outline:none;-ms-interpolation-mode:bicubic;}
@media only screen and (max-width:620px){
  .ph-gut{padding-left:26px!important;padding-right:26px!important}
  .ph-h1{font-size:27px!important;line-height:33px!important}
}
</style></head><body style="margin:0;padding:0;background:${COLOR.paper};font-family:${FONT.sans};">${body}</body></html>`;
}

module.exports = { esc, space, hairline, bleedRule, row, shell, document_ };
