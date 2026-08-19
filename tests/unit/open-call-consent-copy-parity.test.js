"use strict";

/**
 * Server/client parity for the event-casting consent copy.
 *
 * `client/src/domains/opencall/components/consentCopy.js` renders the words the
 * anonymous applicant reads before pressing send;
 * `src/shared/lib/submission-disclosure-content.js` builds the snapshot that is
 * hashed into the consent record at submit. A divergence between the two is not
 * cosmetic — it means the applicant agreed to one sentence and the audit trail
 * recorded another, which is exactly the failure the compensation restatement
 * exists to prevent.
 *
 * Mechanism mirrors `tests/unit/open-call-intake-parity.test.js`: esbuild
 * bundles the browser ESM module to CJS so jest can require it and diff the two
 * directly, rather than eyeballing two files.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");

const server = require("../../src/shared/lib/submission-disclosure-content");
const {
  EVENT_PACKAGE_RETENTION_DAYS,
} = require("../../src/shared/constants/event-casting");

function loadBrowserMirror() {
  const entry = path.resolve(
    __dirname,
    "../../client/src/domains/opencall/components/consentCopy.js",
  );
  const outfile = path.join(
    os.tmpdir(),
    `open-call-consent-copy-mirror.${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile,
    logLevel: "silent",
  });
  const mirror = require(outfile);
  fs.unlinkSync(outfile);
  return mirror;
}

describe("open-call consent copy — server/client parity", () => {
  const client = loadBrowserMirror();
  const serverCopy = server.EVENT_CASTING_DISCLOSURE_CONTENT;

  test("every string the applicant reads is quoted verbatim from the server module", () => {
    const clientCopy = client.EVENT_CASTING_DISCLOSURE_COPY;
    for (const key of Object.keys(clientCopy)) {
      expect(serverCopy).toHaveProperty(key);
      expect(clientCopy[key]).toEqual(serverCopy[key]);
    }
  });

  test("the clauses the design names by hand are present, not just equal", () => {
    // Design §5.1's consent screen: the designers-see clause, the retention
    // clock, and the no-guarantee sentence. Named individually so a future
    // refactor that drops one from the client object fails here rather than
    // passing an all-keys-match loop with fewer keys.
    const clientCopy = client.EVENT_CASTING_DISCLOSURE_COPY;
    expect(clientCopy.thirdPartyAccess).toBe(serverCopy.thirdPartyAccess);
    expect(clientCopy.retentionTemplate).toBe(serverCopy.retentionTemplate);
    expect(clientCopy.retentionUndatedTemplate).toBe(serverCopy.retentionUndatedTemplate);
    expect(clientCopy.withdrawal).toBe(serverCopy.withdrawal);
    expect(clientCopy.staticAcknowledgements[1]).toBe(
      serverCopy.staticAcknowledgements[1],
    );
    expect(clientCopy.staticAcknowledgements[1]).toMatch(
      /does not guarantee selection, a booking, or payment/,
    );
    expect(clientCopy.adultAuthorityAcknowledgement).toBe(
      serverCopy.adultAuthorityAcknowledgement,
    );
  });

  test("the retention clock is ruling R4's, on both sides", () => {
    expect(client.EVENT_PACKAGE_RETENTION_DAYS).toBe(EVENT_PACKAGE_RETENTION_DAYS);
    expect(client.eventPackageRetentionDate("2026-10-10")).toBe(
      server.eventPackageRetentionDate("2026-10-10"),
    );
    expect(client.eventPackageRetentionDate(null)).toBe(
      server.eventPackageRetentionDate(null),
    );
  });

  test("the compensation sentence is restated identically, in every case", () => {
    const cases = [
      { organizerName: "Fashion Week Brooklyn", compensationType: "paid", compensationDetails: "$250 per show." },
      { organizerName: "Fashion Week Brooklyn", compensationType: "unpaid", compensationDetails: "" },
      { organizerName: "Fashion Week Brooklyn", compensationType: "stipend", compensationDetails: "Travel covered." },
      { organizerName: "", compensationType: "paid", compensationDetails: "" },
      { organizerName: "Fashion Week Brooklyn", compensationType: null, compensationDetails: null },
      { organizerName: "Fashion Week Brooklyn", compensationType: "nonsense", compensationDetails: "x" },
    ];
    for (const input of cases) {
      expect(client.buildCompensationRestatement(input)).toBe(
        server.buildCompensationRestatement(input),
      );
    }
  });

  test("the composed consent screen matches the recorded snapshot, clause for clause", () => {
    const context = {
      organizerName: "Fashion Week Brooklyn",
      eventName: "FWBK Queens",
      eventStartsOn: "2026-10-04",
      eventEndsOn: "2026-10-10",
      eventLocation: "Queens, NY",
      compensationType: "paid",
      compensationDetails: "$250 per show.",
    };

    const snapshot = server.buildSubmissionDisclosureSnapshot({
      agencyName: context.organizerName,
      purpose: "event_casting",
      eventContext: context,
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
    });

    const copy = client.buildConsentCopy({
      organizerName: context.organizerName,
      event: { name: context.eventName, endsOn: context.eventEndsOn },
      compensation: { type: context.compensationType, details: context.compensationDetails },
    });

    expect(copy.termsLabel).toBe(snapshot.termsLabel);
    expect(copy.handling).toBe(snapshot.handling);
    expect(copy.dataCategories).toBe(snapshot.dataCategories);
    expect(copy.thirdPartyAccess).toBe(snapshot.thirdPartyAccess);
    expect(copy.compensation).toBe(snapshot.compensation);
    expect(copy.retentionAndWithdrawal).toBe(snapshot.retentionAndWithdrawal);
    expect(copy.consentStatement).toBe(snapshot.consentStatement);
    // The adult acknowledgement list, in the order the snapshot records it.
    expect([copy.accuracyStatement, copy.adultStatement, copy.noGuaranteeStatement]).toEqual(
      snapshot.acknowledgements,
    );
  });

  test("an undated event falls back to the same sentences on both sides", () => {
    const snapshot = server.buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      purpose: "event_casting",
      eventContext: { organizerName: "Fashion Week Brooklyn" },
    });
    const copy = client.buildConsentCopy({
      organizerName: "Fashion Week Brooklyn",
      event: {},
      compensation: {},
    });

    expect(copy.handling).toBe(snapshot.handling);
    expect(copy.retentionAndWithdrawal).toBe(snapshot.retentionAndWithdrawal);
    expect(copy.compensation).toBe(snapshot.compensation);
    expect(copy.consentStatement).toBe(snapshot.consentStatement);
  });
});
