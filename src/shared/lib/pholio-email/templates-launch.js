/**
 * Pholio Email — the launch-day notice.
 *
 * Sent once, by scripts/send-launch-notifications.js, to each address left on
 * pholio-site's /opening page. The page promised exactly this: one email on
 * the day talent can join, then the address is deleted. The footer says the
 * deletion has happened, so the script deletes the row before it reports a send.
 *
 * Cream talent vocabulary. Plain text is written by hand, as in ./text.js.
 */

const { space, shell, document_ } = require("./primitives");
const B = require("./blocks");
const { footer } = require("./footer");
const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

const REASON =
  "You're getting this because you left this address at pholio.studio to hear when Pholio opened. It has now been deleted from that list, and nothing else will be sent to it.";

function buildLaunchOpenEmailHtml() {
  const rows = [
    space(44), B.wordmark(), space(52),
    B.statement("Pholio is open."),
    space(22),
    B.lede("You asked for one email on the day talent could join. This is it."),
    space(10),
    B.prose("Making an account and applying are free. Pholio is open to adults aged 18 and over."),
    space(30),
    B.act("Apply free", `${getEmailAppBaseUrl()}/onboarding`),
    footer("record", { reason: REASON }),
  ];
  return document_({
    title: "Pholio is open",
    body: shell({ preheader: "You asked for one email on the day talent could join.", rows }),
  });
}

function launchOpenEmailText() {
  return [
    "Pholio is open.",
    "",
    "You asked for one email on the day talent could join. This is it.",
    "",
    "Making an account and applying are free. Pholio is open to adults aged 18 and over.",
    "",
    `Apply free: ${getEmailAppBaseUrl()}/onboarding`,
    "",
    "—",
    "",
    REASON,
    `support@pholio.studio · ${getMarketingSiteUrl()}/terms · ${getMarketingSiteUrl()}/privacy`,
  ].join("\n");
}

module.exports = { buildLaunchOpenEmailHtml, launchOpenEmailText };
