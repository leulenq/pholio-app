/**
 * Pholio Email — guardian authorization.
 *
 * The launch is 18+, so this is parked rather than live; it is re-rendered in
 * the cream vocabulary but its COPY IS UNCHANGED. That copy was reviewed against
 * a real consent requirement — the guardian must know which agency, and exactly
 * what is disclosed, BEFORE deciding — and tests pin the wording. Do not
 * paraphrase it to make it prettier.
 */

const { COLOR, FONT } = require("./tokens");
const { esc, space, row, shell, document_ } = require("./primitives");
const B = require("./blocks");
const { footer } = require("./footer");

const strong = (v) => `<strong style="color:${COLOR.ink};font-weight:600;">${esc(v)}</strong>`;
const greet = (name) => (name ? `${esc(name)},` : "Hello,");

/** Scope disclosure — left-aligned because the value is prose, not a scalar. */
function disclosure(items) {
  const rows = items
    .map(
      ({ label, value }, i, all) =>
        `<tr>
<td width="30%" valign="top" style="width:30%;padding:13px 16px 13px 0;border-bottom:1px solid ${i === all.length - 1 ? COLOR.ruleStrong : COLOR.rule};font-family:${FONT.mono};font-size:9px;line-height:16px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:${COLOR.body};">${esc(label)}</td>
<td valign="top" style="padding:13px 0;border-bottom:1px solid ${i === all.length - 1 ? COLOR.ruleStrong : COLOR.rule};font-family:${FONT.sans};font-size:14px;line-height:22px;color:${COLOR.ink};">${esc(value)}</td>
</tr>`,
    )
    .join("");
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`,
  );
}

function buildGuardianConsentEmailHtml({
  guardianName, talentName, talentPhotoUrl, talentCity, agencyName, consentUrl, expiresDays = 7,
} = {}) {
  const talent = talentName || "a minor in your care";
  const scoped = Boolean(agencyName);

  const rows = [space(44), B.wordmark(), space(46)];

  rows.push(
    B.statement(scoped ? "Review this submission first." : "Review this consent request."),
    space(24),
  );

  rows.push(
    B.prose(
      scoped
        ? `${greet(guardianName)} ${strong(talent)} would like to send a representation submission to ${strong(agencyName)}. Because the talent is under 18, Pholio requires your authorization before profile details, measurements, images, or contact details are disclosed.`
        : `${greet(guardianName)} ${strong(talent)} would like to use Pholio. Because the talent is under 18, Pholio requires guardian consent before measurements, full-length images, or public sharing are enabled.`,
      { size: 15.5 },
    ),
    space(30),
  );

  if (scoped) {
    rows.push(
      disclosure([
        { label: "Agency", value: agencyName },
        {
          label: "Disclosure",
          value:
            "Profile details, measurements, digitals, selected portfolio images, comp card, contact details, and optional note or social links",
        },
      ]),
      space(26),
      B.prose(
        `This authorization applies only to ${strong(agencyName)}. A submission to another agency requires a separate guardian authorization.`,
        { size: 15 },
      ),
    );
  } else {
    rows.push(B.prose("Nothing sensitive is shared or made public until you authorize it.", { size: 15 }));
  }

  rows.push(
    space(32),
    B.act(scoped ? "Review authorization" : "Review request", consentUrl),
    space(24),
    B.prose(
      `This request expires in ${esc(String(expiresDays))} day${Number(expiresDays) === 1 ? "" : "s"}. If you were not expecting it, ignore this email and no disclosure will happen.`,
      { size: 13 },
    ),
    footer("secure", {
      reason: `Sent because ${scoped ? `${talentName || "a minor"} asked to submit to ${agencyName}` : "guardian consent was requested"} on Pholio.`,
    }),
  );

  return document_({
    title: scoped ? "Guardian authorization" : "Guardian consent",
    body: shell({
      preheader: scoped
        ? `Authorization is requested before ${talent} submits to ${agencyName}.`
        : `Guardian consent is requested for ${talent} on Pholio.`,
      rows,
    }),
  });
}

module.exports = { buildGuardianConsentEmailHtml };
