/**
 * Pholio Email — semantic blocks.
 *
 * Each export is named for the KIND of information it carries, not for its
 * shape. There is deliberately no generic "metadata panel": a security context,
 * a financial state, a quoted instruction and an account fact are different
 * kinds of thing and get different treatments. Adding a general-purpose tinted
 * container here would undo the whole system.
 */

const { COLOR, FONT, TRACK, LAYOUT } = require("./tokens");
const { esc, space, row } = require("./primitives");

const MEASURE = LAYOUT.width - LAYOUT.gutter * 2; // 496
const TNUM =
  "font-variant-numeric:tabular-nums;-webkit-font-feature-settings:'tnum';font-feature-settings:'tnum';";

/* ---------------------------------------------------------------- identity */

/** The wordmark. Ink on emails that deliberately carry no gold (billing). */
function wordmark({ tone = "gold" } = {}) {
  const color = tone === "ink" ? COLOR.ink : COLOR.gold;
  return row(
    `<span style="font-family:${FONT.serif};font-size:19px;line-height:22px;letter-spacing:.2em;text-transform:uppercase;color:${color};">Pholio</span>`,
  );
}

/** The signature at the foot, for emails where someone else speaks first. */
function signature() {
  return row(
    `<span style="font-family:${FONT.serif};font-size:14px;line-height:18px;letter-spacing:.26em;text-transform:uppercase;color:${COLOR.gold};">Pholio</span>`,
  );
}

/**
 * The gold sweep, built from five stepped 1px cells rather than a gradient.
 * Outlook has no gradient support and a background image would vanish when
 * images are blocked; stepping renders identically everywhere.
 */
function sweep() {
  const steps = ["#C9A55A", "#D8BE88", "#E4D2AE", "#EEE3CC", "#F4EDE0"];
  const cells = steps
    .map(
      (c) =>
        `<td width="28" style="width:28px;height:1px;line-height:1px;font-size:0;background:${c};">&nbsp;</td>`,
    )
    .join("");
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${cells}</tr></table>`,
  );
}

/* ------------------------------------------------------------------- voice */

/** The one serif line that carries the message. */
function statement(text, { size = 31 } = {}) {
  return row(
    `<div class="ph-h1" style="font-family:${FONT.serif};font-size:${size}px;line-height:1.2;letter-spacing:-.01em;color:${COLOR.ink};">${text}</div>`,
  );
}

/** A secondary serif line — a named next step, a date-as-headline. */
function subStatement(text) {
  return row(
    `<div style="font-family:${FONT.serif};font-size:23px;line-height:30px;color:${COLOR.ink};">${text}</div>`,
  );
}

/** Ink body copy — a confirmation the reader must not miss. */
function lede(text) {
  return row(
    `<div style="font-family:${FONT.sans};font-size:16px;line-height:26px;color:${COLOR.ink};">${text}</div>`,
  );
}

/** Secondary body copy — explanation, orientation, reassurance. */
function prose(text, { size = 15 } = {}) {
  return row(
    `<div style="font-family:${FONT.sans};font-size:${size}px;line-height:1.66;color:${COLOR.body};">${text}</div>`,
  );
}

/**
 * An advisory. One line of sans in warm gold-brown, no box, no icon — copied
 * from the dashboard's stale-submission treatment, which is the house answer
 * for "attention without alarm".
 */
function advisory(text, { tone = "gold" } = {}) {
  const color = tone === "attention" ? COLOR.attention : COLOR.goldText;
  return row(
    `<div style="font-family:${FONT.sans};font-size:14px;line-height:22px;color:${color};">${text}</div>`,
  );
}

/** A chapter label. Mono, widest tracking, gold that is legible as type. */
function kicker(text) {
  return row(
    `<div style="font-family:${FONT.mono};font-size:10px;line-height:14px;font-weight:600;letter-spacing:${TRACK.kicker};text-transform:uppercase;color:${COLOR.goldText};">${esc(text)}</div>`,
  );
}

/* ------------------------------------------------------------------ action */

/** The primary action. Ink fill, matching the shipped PholioButton. */
function act(label, url) {
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td bgcolor="${COLOR.ink}" style="background:${COLOR.ink};border-radius:3px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="6%" strokecolor="${COLOR.ink}" fillcolor="${COLOR.ink}"><w:anchorlock/><center style="color:${COLOR.paper};font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;">${esc(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${esc(url)}" style="display:inline-block;padding:15px 30px;font-family:${FONT.sans};font-size:14px;line-height:20px;font-weight:600;color:${COLOR.paper};text-decoration:none;">${esc(label)}</a><!--<![endif]-->
</td></tr></table>`,
  );
}

/** A caption bound to the action — a constraint on the link, not a paragraph. */
function actNote(text) {
  return row(
    `<div style="font-family:${FONT.mono};font-size:9px;line-height:1;font-weight:500;letter-spacing:${TRACK.time};text-transform:uppercase;color:${COLOR.body};">${esc(text)}</div>`,
  );
}

/* ------------------------------------------------------- information types */

/**
 * ACCOUNT FACTS — reference data, scanned for correctness rather than read.
 * Key/value on a hairline grid with no fill, the dashboard's `.app-detail__facts`
 * construction. Values right-aligned so the eye checks one vertical edge.
 */
function factList(items = []) {
  const rows = items
    .map(
      ({ label, value, caps = false }) =>
        `<tr><td width="38%" align="left" style="width:38%;padding:12px 0;border-bottom:1px solid ${COLOR.rule};font-family:${FONT.mono};font-size:9px;line-height:14px;font-weight:500;letter-spacing:${TRACK.key};text-transform:uppercase;color:${COLOR.body};">${esc(label)}</td>
<td align="right" style="padding:12px 0;border-bottom:1px solid ${COLOR.rule};font-family:${FONT.mono};font-size:11px;line-height:14px;font-weight:500;letter-spacing:.1em;${caps ? "text-transform:uppercase;" : ""}color:${COLOR.ink};">${esc(value)}</td></tr>`,
    )
    .join("");
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`,
  );
}

/**
 * SECURITY CONTEXT — machine-observed evidence, so it is set as a log record:
 * mono throughout, values sharing one left edge. The reader is running three
 * parallel comparisons against memory and needs a single column to travel down,
 * which is why these values are left-aligned where account facts are not.
 */
function record(items = []) {
  const rows = items
    .map(({ label, value }, i, all) => {
      const ruleColor = i === all.length - 1 ? COLOR.ruleStrong : COLOR.rule;
      return `<tr><td width="96" valign="top" style="width:96px;padding:13px 0;font-family:${FONT.mono};font-size:9px;line-height:14px;font-weight:500;letter-spacing:${TRACK.key};text-transform:uppercase;color:${COLOR.body};">${esc(label)}</td>
<td valign="top" style="padding:13px 0;font-family:${FONT.mono};font-size:11px;line-height:14px;font-weight:500;letter-spacing:.06em;color:${COLOR.ink};">${esc(value)}</td></tr>
<tr><td colspan="2" style="height:1px;line-height:1px;font-size:0;background:${ruleColor};">&nbsp;</td></tr>`;
    })
    .join("");
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">${rows}</table>`,
  );
}

/**
 * FINANCIAL STATE — an account statement. Date rail, description, right-aligned
 * amounts on tabular figures, and the consequence as a bottom line under a 2px
 * rule. Settled rows are de-emphasised by SIZE, not by a fainter grey, so they
 * stay legible while reading as spent — the dashboard's own convention for a
 * zero that must remain in the row without claiming a live measurement's weight.
 */
function statement_ledger({ lines = [], bottom } = {}) {
  const body = lines
    .map((l) => {
      const dim = l.settled;
      const dateSize = dim ? 10 : 11;
      const descSize = dim ? 13 : 14;
      const amtSize = dim ? 11 : 14;
      const color = dim ? COLOR.body : COLOR.ink;
      const note = l.note
        ? ` &middot; <span style="color:${COLOR.attention};">${esc(l.note)}</span>`
        : "";
      return `<tr>
<td width="76" valign="top" style="width:76px;padding:15px 0;border-bottom:1px solid ${COLOR.rule};font-family:${FONT.mono};font-size:${dateSize}px;line-height:21px;letter-spacing:.08em;color:${color};${TNUM}">${esc(l.date)}</td>
<td valign="top" style="padding:15px 12px 15px 0;border-bottom:1px solid ${COLOR.rule};font-family:${FONT.sans};font-size:${descSize}px;line-height:21px;color:${color};">${esc(l.description)}${note}</td>
<td width="86" valign="top" align="right" style="width:86px;padding:15px 0;border-bottom:1px solid ${COLOR.rule};font-family:${FONT.mono};font-size:${amtSize}px;line-height:21px;color:${color};text-align:right;${TNUM}">${esc(l.amount || "")}</td>
</tr>`;
    })
    .join("");

  const bottomRow = bottom
    ? `<tr><td colspan="3" style="padding:20px 0 22px;border-bottom:2px solid ${COLOR.ruleStrong};">
<div style="font-family:${FONT.mono};font-size:10px;line-height:14px;letter-spacing:${TRACK.time};text-transform:uppercase;color:${COLOR.body};">${esc(bottom.label)}</div>
<div style="height:9px;line-height:9px;font-size:0;">&nbsp;</div>
<div style="font-family:${FONT.serif};font-size:33px;line-height:1;letter-spacing:-.015em;color:${COLOR.ink};${TNUM}">${esc(bottom.value)}</div>
${bottom.note ? `<div style="height:11px;line-height:11px;font-size:0;">&nbsp;</div><div style="font-family:${FONT.sans};font-size:13px;line-height:1.6;color:${COLOR.body};">${esc(bottom.note)}</div>` : ""}
</td></tr>`
    : "";

  return row(
    `<table role="presentation" width="${MEASURE}" cellpadding="0" cellspacing="0" border="0" style="width:${MEASURE}px;border-collapse:collapse;border-top:1px solid ${COLOR.ruleStrong};">${body}${bottomRow}</table>`,
  );
}

/** WHO WROTE — a person, their role, where they work, and when. */
function correspondent({ name, role, org, when } = {}) {
  const initial = esc((name || "P").trim().charAt(0).toUpperCase());
  const meta = [role, org].filter(Boolean).map(esc).join(" &middot; ");
  return row(
    `<table role="presentation" width="${MEASURE}" cellpadding="0" cellspacing="0" border="0" style="width:${MEASURE}px;border-collapse:collapse;"><tr>
<td width="40" valign="top" style="width:40px;">
  <table role="presentation" width="40" cellpadding="0" cellspacing="0" border="0" style="width:40px;border-collapse:separate;"><tr>
    <td align="center" valign="middle" height="40" bgcolor="${COLOR.well}" style="width:40px;height:40px;background:${COLOR.well};border:1px solid ${COLOR.rule};border-radius:3px;font-family:${FONT.sans};font-size:13px;font-weight:600;line-height:38px;color:${COLOR.goldDeep};">${initial}</td>
  </tr></table>
</td>
<td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>
<td valign="top">
  <div style="font-family:${FONT.serif};font-size:17px;font-weight:500;line-height:21px;color:${COLOR.ink};padding-bottom:3px;">${esc(name)}</div>
  <div style="font-family:${FONT.sans};font-size:12px;line-height:16px;color:${COLOR.body};">${meta}</div>
</td>
<td valign="top" align="right" style="padding:6px 0 0 16px;font-family:${FONT.mono};font-size:9px;font-weight:500;line-height:12px;letter-spacing:${TRACK.time};text-transform:uppercase;color:${COLOR.body};white-space:nowrap;">${esc(when)}</td>
</tr></table>`,
  );
}

/**
 * WHAT THEY WROTE — the only white surface in the email, so white itself means
 * "not Pholio talking". Set in the serif, at reading size: the message is the
 * document here, not a row in a thread.
 */
function messageInset(text) {
  return row(
    `<table role="presentation" width="${MEASURE}" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.white}" style="width:${MEASURE}px;border-collapse:separate;background:${COLOR.white};border:1px solid ${COLOR.ruleStrong};border-radius:3px;"><tr>
<td style="padding:24px 26px;font-family:${FONT.serif};font-size:16px;line-height:26px;color:${COLOR.ink};">${text}</td>
</tr></table>`,
  );
}

/**
 * A REQUEST FROM SOMEONE ELSE — a full-bleed tinted band rather than a card.
 * A card would read as a widget; an edge-to-edge change of ground says the page
 * has changed hands and these are the agency's conditions, not Pholio's advice.
 * Items carry an em rule rather than a bullet or a tick — a tick would imply a
 * done state that an email cannot hold.
 */
function askBand({ source, items = [] } = {}) {
  const list = items
    .map((text, i) => {
      const last = i === items.length - 1;
      return `<tr>
<td width="24" valign="top" style="width:24px;padding:20px 0 0 0;"><table role="presentation" width="8" cellpadding="0" cellspacing="0" border="0" style="width:8px;border-collapse:collapse;"><tr><td style="height:1px;line-height:1px;font-size:0;background:${COLOR.gold};">&nbsp;</td></tr></table></td>
<td valign="top" style="padding:8px 0 ${last ? 0 : 17}px 0;font-family:${FONT.sans};font-size:17px;line-height:26px;font-weight:500;color:${COLOR.ink};">${esc(text)}</td>
</tr>${last ? "" : `<tr><td colspan="2" style="height:1px;line-height:1px;font-size:0;background:${COLOR.ruleGold};">&nbsp;</td></tr>`}`;
    })
    .join("");

  return `<tr><td style="height:1px;line-height:1px;font-size:0;background:${COLOR.ruleGold};">&nbsp;</td></tr>
<tr><td style="background:${COLOR.tint};padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
${space(28)}
${row(`<div style="font-family:${FONT.mono};font-size:10px;line-height:14px;font-weight:500;letter-spacing:${TRACK.label};text-transform:uppercase;color:${COLOR.goldText};">${esc(source)}</div>`)}
${space(14)}
${row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${list}</table>`)}
${space(30)}
</table></td></tr>
<tr><td style="height:1px;line-height:1px;font-size:0;background:${COLOR.ruleGold};">&nbsp;</td></tr>`;
}

/**
 * A STANDING — the state the product actually tracks. An outlined square with
 * colour in the border and text only; never a filled pill. Rendered as the same
 * object the talent will meet in the dashboard, so the email teaches the
 * vocabulary rather than inventing a parallel one.
 */
function standing(label, { border = COLOR.bronzeRule, color = COLOR.goldText } = {}) {
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td style="border:1px solid ${border};padding:7px 10px 6px;font-family:${FONT.mono};font-size:9px;line-height:11px;letter-spacing:${TRACK.stamp};text-transform:uppercase;font-weight:500;color:${color};white-space:nowrap;">${esc(label)}</td>
</tr></table>`,
  );
}

module.exports = {
  wordmark, signature, sweep,
  statement, subStatement, lede, prose, advisory, kicker,
  act, actNote, actNote2: actNote,
  factList, record, statement_ledger, correspondent, messageInset, askBand, standing,
  MEASURE,
};
