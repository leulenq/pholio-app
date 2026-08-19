/**
 * Pholio Email — footers, by tier.
 *
 * Transactional mail is exempt from CAN-SPAM's unsubscribe and postal-address
 * requirements, and RFC 8058 one-click unsubscribe applies to bulk and marketing
 * mail rather than password resets. So there is no postal address here and no
 * blanket opt-out: Pholio is remote, and inventing an address would be a lie.
 *
 *   secure — verification, reset, password changed, new device, deletion.
 *            Carries the anti-impersonation promise. No preference link: an
 *            opt-out on a security email is a dark pattern.
 *   record — welcome, decisions, receipts, packages, messages. Carries a
 *            SCOPED preference, because turning off submission updates must not
 *            silence a booker writing to you.
 *   open   — reserved for the open-call calendar, the only genuinely
 *            non-transactional mail. Needs a real address and a real
 *            unsubscribe before it can ship; deliberately not implemented.
 */

const { COLOR, FONT } = require("./tokens");
const { esc, space, hairline, row } = require("./primitives");
const { getMarketingSiteUrl } = require("./urls");

const NEVER_ASKS =
  "Pholio will never ask for your password or a code by phone, message or reply.";

function link(label, href) {
  return `<a href="${esc(href)}" style="color:${COLOR.body};text-decoration:underline;">${esc(label)}</a>`;
}

function line(html) {
  return row(
    `<div style="font-family:${FONT.sans};font-size:12px;line-height:20px;color:${COLOR.body};">${html}</div>`,
  );
}

function legalLinks() {
  const site = getMarketingSiteUrl();
  return [
    link("support@pholio.studio", "mailto:support@pholio.studio"),
    link("Terms", `${site}/terms`),
    link("Privacy", `${site}/privacy`),
  ].join("&nbsp;&middot;&nbsp;");
}

/**
 * @param {"secure"|"record"} tier
 * @param {Object}   opts
 * @param {string}   opts.reason      Why this arrived, as a sentence about the
 *                                    actual event — the friendliest and the most
 *                                    compliant version of that line.
 * @param {Object}  [opts.preference] { label, href } — record tier only.
 * @param {string}  [opts.extra]      An extra leading link (e.g. Billing).
 */
function footer(tier, { reason, preference, extra } = {}) {
  const parts = [space(44), hairline(COLOR.ruleStrong), space(22)];

  if (reason) parts.push(line(esc(reason)), space(10));

  if (tier === "secure") {
    parts.push(
      line(`<strong style="color:${COLOR.ink};font-weight:600;">${NEVER_ASKS}</strong>`),
      space(10),
    );
  }

  if (tier === "record" && preference) {
    parts.push(
      line(
        `${link(preference.label, preference.href)}${preference.note ? ` &mdash; ${esc(preference.note)}` : ""}`,
      ),
      space(10),
    );
  }

  const links = extra ? `${link(extra.label, extra.href)}&nbsp;&middot;&nbsp;${legalLinks()}` : legalLinks();
  parts.push(line(links), space(48));

  return parts.join("\n");
}

module.exports = { footer, NEVER_ASKS };
