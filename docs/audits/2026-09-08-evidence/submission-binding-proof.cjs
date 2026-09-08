"use strict";
// Offline proof against actual pure consent functions. No DB, config or providers.
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const { buildSubmissionPackageFingerprint: fingerprint } = require(path.join(root,
  "src/domains/talent/services/submission-disclosure-consent"));
const { buildSubmissionDisclosureSnapshot: disclosure } = require(path.join(root,
  "src/shared/lib/submission-disclosure-content"));
const base = { agencyId: "agency-a", imageIds: ["photo-a"], openCallLinkId: "call-a",
  availability: { from: "2026-10-04", to: "2026-10-10" }, note: "My application" };
const original = { ...base, externalCompCardId: "card-a", compensationDetails: "$500",
  eventEndsOn: "2026-10-10", disclosureVersion: "old" };
const changed = { ...base, externalCompCardId: "card-b", compensationDetails: "No pay",
  eventEndsOn: "2027-10-10", disclosureVersion: "new" };
assert.equal(fingerprint(original), fingerprint(changed));
console.log("PROVED: replacing external comp card, compensation, event end date and disclosure version leaves consent fingerprint identical.");
const shared = { agencyName: "Organizer", purpose: "event_casting", isMinor: false,
  accuracyConfirmed: true, adultAuthorityConfirmed: true };
const before = disclosure({ ...shared, eventContext: { organizerName: "Organizer", eventName: "Show",
  eventEndsOn: "2026-10-10", compensationType: "paid", compensationDetails: "$500" } });
const after = disclosure({ ...shared, eventContext: { organizerName: "Organizer", eventName: "Show",
  eventEndsOn: "2027-10-10", compensationType: "unpaid", compensationDetails: "No pay" } });
assert.notEqual(JSON.stringify(before), JSON.stringify(after));
console.log("PROVED: disclosure builder produces different consent records for those event changes despite identical package fingerprint.");
