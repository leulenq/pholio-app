"use strict";

/**
 * The deliverable for an agency whose only channel is an inbox.
 *
 * Most routes in the registry end at a web form: the talent uploads the files
 * and the form asks for the stats. A handful — Muse New York is the one in the
 * published set — publish an email address instead, and for those the archive
 * on its own is not a deliverable. The talent still has to compose a submission
 * email, which is the point at which a first-time applicant either writes
 * something that reads like a fan letter or gives up.
 *
 * So the archive carries the draft. Its register is the whole design:
 *
 *   - Factual only. No "I'd love to", no "dream", no claim about the talent's
 *     potential. A booker reads hundreds of these and the ones that get read
 *     are the ones that are just the facts and the files.
 *   - Nothing invented. The recipient comes from the registry or is marked as
 *     something the talent must fill in; the stats come from the profile; the
 *     count comes from the archive. This module never asserts a fact that no
 *     other part of Pholio could substantiate.
 *   - Not a send button. Pholio does not deliver this, does not build a mailto,
 *     and does not integrate an email client. The talent sends it themselves,
 *     from their own address, which is what the agency asked for.
 */

const EMAIL_CHANNEL_TYPE = "official_email";

/** Does this route take submissions by email rather than through a form? */
function isEmailChannel(channel) {
  return String(channel?.type || "") === EMAIL_CHANNEL_TYPE;
}

/**
 * The submission address — only ever one the registry published.
 *
 * The v1 schema constrains `channel.url` to an `https://` page, so today's
 * email routes carry the page that publishes the address rather than the
 * address itself. When that is the case the draft says so and leaves a marked
 * blank: a plausible-looking address that Pholio guessed would be a submission
 * sent into a void, and the talent would have no way to know.
 *
 * `mailto:` is read anyway, so that a registry entry which does publish an
 * address needs no change here to be used.
 *
 * @returns {{ address: string|null, publishedAt: string|null }}
 */
function publishedRecipient(channel) {
  const url = String(channel?.url || "").trim();
  const mailto = url.match(/^mailto:([^?\s]+)/i);
  if (mailto) {
    const address = decodeURIComponent(mailto[1]).trim();
    return { address: address || null, publishedAt: null };
  }
  return { address: null, publishedAt: url || null };
}

function recipientLine(recipient) {
  if (recipient.address) return `To: ${recipient.address}`;
  if (recipient.publishedAt) {
    return `To: [the submission address published at ${recipient.publishedAt} — copy it from their page]`;
  }
  return "To: [the agency's published submission address]";
}

/**
 * "Model submission — Mia Voss, 178 cm / 5'10\", New York".
 *
 * A subject line is the only thing a booker sees before deciding to open the
 * mail, and the convention across every agency inbox is the same three facts.
 * Each is dropped if the profile does not carry it, so the line never reads
 * with a hole in it.
 */
function subjectLine({ talentName, height, city }) {
  const parts = [talentName, height, city].filter(Boolean);
  return parts.length ? `Subject: Model submission — ${parts.join(", ")}` : "Subject: Model submission";
}

function attachmentSentence(fileCount, agencyName) {
  const what =
    fileCount === 1 ? "Attached is one digital" : `Attached are ${fileCount} digitals`;
  return agencyName
    ? `${what} prepared to the requirements ${agencyName} publishes.`
    : `${what} prepared to the requirements this agency publishes.`;
}

/**
 * @param {object} args
 * @param {object} args.channel      `scope.channel` for the route.
 * @param {string} args.agencyName
 * @param {object} args.statsBlock   From `buildStatsBlock`.
 * @param {number} args.fileCount    Images actually in the archive.
 * @param {string|null} [args.heightLabel] The height as the stats block renders it.
 * @param {string|null} [args.city]
 * @returns {string}
 */
function renderEmailDraft({ channel, agencyName, statsBlock, fileCount, heightLabel, city }) {
  const recipient = publishedRecipient(channel);
  const talentName = statsBlock?.name || null;

  const lines = [
    recipientLine(recipient),
    subjectLine({ talentName, height: heightLabel || null, city: city || null }),
    "",
    "Hello,",
    "",
    attachmentSentence(fileCount, agencyName),
  ];

  if (statsBlock?.text) lines.push("", statsBlock.text);
  if (talentName) lines.push("", talentName);
  lines.push("");

  return lines.join("\n");
}

module.exports = {
  EMAIL_CHANNEL_TYPE,
  isEmailChannel,
  publishedRecipient,
  renderEmailDraft,
  subjectLine,
};
