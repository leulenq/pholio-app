"use strict";

/**
 * The consent fork (design §b).
 *
 * The single most important assertion in this file is the boring one: the
 * representation disclosure is byte-for-byte what it was before event casting
 * existed. Its version string is bound into every live draft's consent
 * fingerprint, so one added key, one reordered field or one re-worded sentence
 * invalidates submissions people are halfway through making. It is asserted
 * against a frozen literal rather than a snapshot file so that a diff shows up
 * in review as changed test source, not as a regenerated artifact.
 *
 * The event branch is asserted on the four things the ruling table put there
 * on purpose: the third-party designer clause, the no-guarantee wording, the
 * verbatim compensation restatement, and the R4 retention window.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("event-consent-fork");

const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const {
  ACKNOWLEDGEMENT_VERSIONS,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  DISCLOSURE_VERSIONS,
  EVENT_CASTING_DISCLOSURE_CONTENT,
  EVENT_CASTING_DISCLOSURE_VERSION,
  acknowledgementVersionForPurpose,
  buildOpenCallDisclosure,
  buildSubmissionDisclosureSnapshot,
  disclosureVersionForPurpose,
  eventPackageRetentionDate,
} = require("../../src/shared/lib/submission-disclosure-content");
const {
  recordSubmissionDisclosureConsent,
} = require("../../src/domains/talent/services/submission-disclosure-consent");
const {
  CALL_PURPOSES,
  COMPENSATION_TYPES,
  EVENT_PACKAGE_RETENTION_DAYS,
} = require("../../src/shared/constants/event-casting");
const {
  eventDisclosureContextFromLink,
} = require("../../src/domains/agency/services/open-call-brief");

const EVENT_CONTEXT = Object.freeze({
  organizerName: "Fashion Week Brooklyn",
  eventName: "Autumn 2026 Runway",
  eventStartsOn: "2026-09-14",
  eventEndsOn: "2026-09-18",
  eventLocation: "Brooklyn Navy Yard",
  compensationType: COMPENSATION_TYPES.PAID,
  compensationDetails: "$350 per show day, paid within 30 days.",
});

/* ------------------------------------------------- representation frozen --- */

describe("the representation disclosure does not move", () => {
  // Byte-for-byte. Copied from the output before the fork existed.
  const FROZEN_ADULT = {
    termsLabel: "Submission Terms",
    handling:
      "Your package is delivered to Lumen as a separate recipient for representation review.",
    dataCategories:
      "Shared data includes your name, age, city, contact details, measurements, selected images and book, comp card, note, and linked social profiles included in the package.",
    retentionAndWithdrawal:
      "Pholio retains the package for up to 24 months. Withdrawal revokes access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the agency.",
    acknowledgements: [
      "Your statistics and digitals are accurate, current, and unretouched.",
      "You are 18 or older and authorised to submit your own work.",
      "A submission is a request for review and does not guarantee representation.",
    ],
    consentMethod: "talent_checkbox",
    consentStatement:
      "I have reviewed this package and consent to submitting it to Lumen through Pholio.",
    attestations: {
      packageAccuracy: true,
      adultAuthority: true,
      disclosureConsent: true,
    },
  };

  const FROZEN_MINOR = {
    termsLabel: "Submission Terms",
    handling:
      "Your package is delivered to Lumen as a separate recipient for representation review.",
    dataCategories:
      "Shared data includes the minor's name, under-18 age band, city, nationality, languages, guardian-authorized measurements, selected images and book, and comp card. Direct contact, social links, portfolio URL, optional note, and raw date of birth are omitted; the agency can communicate through Pholio.",
    retentionAndWithdrawal:
      "Pholio retains the package for up to 24 months. Withdrawal revokes access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the agency.",
    acknowledgements: [
      "Your statistics and digitals are accurate, current, and unretouched.",
      "A parent or guardian authorized this submission to Lumen.",
      "A submission is a request for review and does not guarantee representation.",
    ],
    consentMethod: "minor_guardian_authorization",
    consentStatement:
      "Guardian authorization verified for submission to Lumen through Pholio.",
    attestations: {
      packageAccuracy: "system_validated",
      adultAuthority: null,
      disclosureConsent: "guardian_authorization",
    },
  };

  test("the adult path is byte-identical, keys and order included", () => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Lumen",
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
    });
    expect(JSON.stringify(built)).toBe(JSON.stringify(FROZEN_ADULT));
  });

  test("the minor path is byte-identical", () => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Lumen",
      isMinor: true,
      accountGuardianConsent: true,
      minorAgencyAuthorized: true,
    });
    expect(JSON.stringify(built)).toBe(JSON.stringify(FROZEN_MINOR));
  });

  test("naming the purpose explicitly changes nothing", () => {
    expect(
      JSON.stringify(
        buildSubmissionDisclosureSnapshot({
          agencyName: "Lumen",
          accuracyConfirmed: true,
          adultAuthorityConfirmed: true,
          purpose: CALL_PURPOSES.REPRESENTATION,
        }),
      ),
    ).toBe(JSON.stringify(FROZEN_ADULT));
  });

  test("an event context handed to a representation call is ignored", () => {
    expect(
      JSON.stringify(
        buildSubmissionDisclosureSnapshot({
          agencyName: "Lumen",
          accuracyConfirmed: true,
          adultAuthorityConfirmed: true,
          eventContext: EVENT_CONTEXT,
        }),
      ),
    ).toBe(JSON.stringify(FROZEN_ADULT));
  });

  test("the representation version is not bumped", () => {
    expect(CURRENT_SUBMISSION_DISCLOSURE_VERSION).toBe("2026-06-29");
    expect(CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION).toBe("2026-06-29.2");
    expect(DISCLOSURE_VERSIONS[CALL_PURPOSES.REPRESENTATION]).toBe("2026-06-29");
    expect(ACKNOWLEDGEMENT_VERSIONS[CALL_PURPOSES.REPRESENTATION]).toBe("2026-06-29.2");
  });

  test("the event purpose carries its own version", () => {
    expect(DISCLOSURE_VERSIONS[CALL_PURPOSES.EVENT_CASTING]).toBe(
      EVENT_CASTING_DISCLOSURE_VERSION,
    );
    expect(EVENT_CASTING_DISCLOSURE_VERSION).not.toBe(
      CURRENT_SUBMISSION_DISCLOSURE_VERSION,
    );
    expect(disclosureVersionForPurpose(CALL_PURPOSES.EVENT_CASTING)).toBe(
      EVENT_CASTING_DISCLOSURE_VERSION,
    );
    expect(acknowledgementVersionForPurpose(CALL_PURPOSES.EVENT_CASTING)).toBe(
      ACKNOWLEDGEMENT_VERSIONS[CALL_PURPOSES.EVENT_CASTING],
    );
  });

  test("an unknown purpose falls back to representation rather than inventing one", () => {
    expect(disclosureVersionForPurpose("audition")).toBe(
      CURRENT_SUBMISSION_DISCLOSURE_VERSION,
    );
    expect(
      JSON.stringify(
        buildSubmissionDisclosureSnapshot({
          agencyName: "Lumen",
          accuracyConfirmed: true,
          adultAuthorityConfirmed: true,
          purpose: "audition",
        }),
      ),
    ).toBe(JSON.stringify(FROZEN_ADULT));
  });
});

/* --------------------------------------------------------- event branch --- */

describe("the event casting disclosure says what an event has to say", () => {
  const snapshot = buildSubmissionDisclosureSnapshot({
    agencyName: "Fashion Week Brooklyn",
    accuracyConfirmed: true,
    adultAuthorityConfirmed: true,
    purpose: CALL_PURPOSES.EVENT_CASTING,
    eventContext: EVENT_CONTEXT,
  });

  test("it names the organizer and the event it is casting for", () => {
    expect(snapshot.purpose).toBe(CALL_PURPOSES.EVENT_CASTING);
    expect(snapshot.termsLabel).toBe("Event Casting Terms");
    expect(snapshot.handling).toBe(
      "Your package is delivered to Fashion Week Brooklyn for casting consideration for Autumn 2026 Runway.",
    );
    expect(snapshot.consentStatement).toContain("Autumn 2026 Runway");
    expect(snapshot.event).toEqual({
      name: "Autumn 2026 Runway",
      startsOn: "2026-09-14",
      endsOn: "2026-09-18",
      location: "Brooklyn Navy Yard",
    });
  });

  test("the third-party designer clause is mandatory and exact", () => {
    expect(snapshot.thirdPartyAccess).toBe(
      "Designers see your name, digitals, height, measurements, availability and walk video through a read-only link. They cannot see your email, phone, socials or date of birth, and they have no Pholio account.",
    );
  });

  test("the acknowledgement promises nothing", () => {
    expect(snapshot.acknowledgements).toContain(
      "A submission is a request for review and does not guarantee selection, a booking, or payment.",
    );
    expect(snapshot.acknowledgements).not.toContain(
      "A submission is a request for review and does not guarantee representation.",
    );
  });

  test("18+ is stated in the consent, not only on the arrival page (R8)", () => {
    expect(snapshot.acknowledgements).toContain(
      "You are 18 or older. This call does not accept applicants under 18.",
    );
  });

  test("compensation is restated verbatim from what the organizer typed", () => {
    expect(snapshot.compensation).toBe(
      "Fashion Week Brooklyn states this is PAID. $350 per show day, paid within 30 days.",
    );
    expect(snapshot.compensationDisclosure).toEqual({
      type: "paid",
      details: "$350 per show day, paid within 30 days.",
      statement: snapshot.compensation,
    });
  });

  test.each([
    [COMPENSATION_TYPES.UNPAID, "UNPAID"],
    [COMPENSATION_TYPES.STIPEND, "A STIPEND"],
  ])("%s is stated as %s", (type, label) => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventContext: {
        ...EVENT_CONTEXT,
        compensationType: type,
        compensationDetails: "",
      },
    });
    expect(built.compensation).toBe(`Fashion Week Brooklyn states this is ${label}.`);
  });

  test("a call with no stated compensation says so rather than staying silent", () => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventContext: { ...EVENT_CONTEXT, compensationType: null },
    });
    expect(built.compensation).toBe(
      "Fashion Week Brooklyn has not stated what this event pays.",
    );
  });

  test("retention is the event end plus 90 days, not 24 months (R4)", () => {
    expect(EVENT_PACKAGE_RETENTION_DAYS).toBe(90);
    expect(eventPackageRetentionDate("2026-09-18")).toBe("2026-12-17");
    expect(snapshot.retentionAndWithdrawal).toContain("2026-12-17");
    expect(snapshot.retentionAndWithdrawal).toContain("90 days after Autumn 2026 Runway ends");
    expect(snapshot.retentionAndWithdrawal).not.toContain("24 months");
    expect(snapshot.retentionAndWithdrawal).toContain("cannot recall");
  });

  test("an undated event still commits to a retention window", () => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventContext: { ...EVENT_CONTEXT, eventName: "", eventEndsOn: null },
    });
    expect(built.retentionAndWithdrawal).toContain("90 days after the event ends");
    expect(built.handling).toBe(
      "Your package is delivered to Fashion Week Brooklyn for casting consideration for this event.",
    );
  });

  test("the guardian path still reads as a guardian path", () => {
    const built = buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      isMinor: true,
      accountGuardianConsent: true,
      minorAgencyAuthorized: true,
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventContext: EVENT_CONTEXT,
    });
    expect(built.consentMethod).toBe("minor_guardian_authorization");
    expect(built.acknowledgements).toContain(
      "A parent or guardian authorized this submission to Fashion Week Brooklyn.",
    );
  });

  test("the content module exposes the event copy for the client to render", () => {
    expect(EVENT_CASTING_DISCLOSURE_CONTENT.thirdPartyAccess).toBe(
      snapshot.thirdPartyAccess,
    );
  });
});

describe("the open-call allowance sentence is representation-only", () => {
  test("a representation open call keeps its promise about the monthly limit", () => {
    expect(buildOpenCallDisclosure("Lumen")).toEqual({
      invited: true,
      statement:
        "This is an invited open call submission to Lumen. It does not count toward your monthly discovery limit.",
    });
  });

  test("passing no options is byte-identical to the old single-argument call", () => {
    expect(JSON.stringify(buildOpenCallDisclosure("Lumen", {}))).toBe(
      JSON.stringify(buildOpenCallDisclosure("Lumen")),
    );
  });

  test("an event cast never mentions an allowance it does not spend", () => {
    const disclosure = buildOpenCallDisclosure("Fashion Week Brooklyn", {
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventName: "Autumn 2026 Runway",
    });
    expect(disclosure).toEqual({
      invited: true,
      purpose: CALL_PURPOSES.EVENT_CASTING,
      statement:
        "This is an invited submission to Fashion Week Brooklyn's casting for Autumn 2026 Runway.",
    });
    expect(disclosure.statement).not.toMatch(/monthly|allowance|discovery limit/i);
  });
});

describe("eventDisclosureContextFromLink", () => {
  test("maps a stored event link into the shape the copy interpolates", () => {
    expect(
      eventDisclosureContextFromLink(
        {
          call_kind: "event_casting",
          event_name: "Autumn 2026 Runway",
          event_starts_on: "2026-09-14",
          event_ends_on: "2026-09-18",
          event_location: "Brooklyn Navy Yard",
          compensation_type: "paid",
          compensation_details: "$350 per show day, paid within 30 days.",
        },
        "Fashion Week Brooklyn",
      ),
    ).toEqual(EVENT_CONTEXT);
  });

  test("a representation link has no event context to build", () => {
    expect(eventDisclosureContextFromLink({ call_kind: "representation" })).toBeNull();
  });
});

/* ------------------------------------------------------- the audit row --- */

describe("the recorded consent event", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const agencyId = uuidv4();
  const linkId = uuidv4();
  const representationApplicationId = uuidv4();
  const eventApplicationId = uuidv4();

  /** SQLite hands JSON columns back as text; Postgres hands back objects. */
  function readJson(value) {
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  beforeAll(async () => {
    await migrate(knex);
    await knex("users").insert([
      { id: userId, email: `consent-${userId}@example.com`, password_hash: "x", role: "TALENT" },
      {
        id: agencyId,
        email: `organizer-${agencyId}@example.com`,
        password_hash: "x",
        role: "AGENCY",
      },
    ]);
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `consent-${profileId}`,
      first_name: "Event",
      last_name: "Applicant",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 178,
      bust_cm: 84,
      waist_cm: 61,
      hips_cm: 89,
      phone: "555-0100",
      nationality: "American",
      languages: JSON.stringify(["English"]),
      bio_raw: "",
      bio_curated: "",
    });
    await knex("agencies").insert({
      id: agencyId,
      name: "Fashion Week Brooklyn",
      slug: `fwb-${agencyId}`,
      status: "ACTIVE",
      org_kind: "event_organizer",
    });
    await knex("agency_open_call_links").insert({
      id: linkId,
      agency_id: agencyId,
      code: "eventcall01",
      label: "Autumn 2026",
      status: "active",
      call_kind: "event_casting",
      compensation_type: "paid",
      compensation_details: "$350 per show day, paid within 30 days.",
      event_name: "Autumn 2026 Runway",
      event_starts_on: "2026-09-14",
      event_ends_on: "2026-09-18",
    });
    // Inserted one at a time on purpose: a batch insert with differing keys is
    // compiled to a UNION that writes an explicit NULL for the key the other
    // row omits, which defeats `call_purpose`'s NOT NULL default.
    await knex("applications").insert({
      id: representationApplicationId,
      profile_id: profileId,
      agency_id: agencyId,
      status: "pending",
    });
    await knex("applications").insert({
      id: eventApplicationId,
      profile_id: profileId,
      agency_id: agencyId,
      status: "pending",
      call_purpose: "event_casting",
      open_call_link_id: linkId,
    });
  }, 60000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  test("a representation submission records exactly what it always did", async () => {
    await knex.transaction(async (trx) => {
      await recordSubmissionDisclosureConsent(trx, {
        applicationId: representationApplicationId,
        userId,
        profileId,
        agencyId,
        packageFingerprint: "a".repeat(64),
        disclosureSnapshot: buildSubmissionDisclosureSnapshot({ agencyName: "Lumen" }),
      });
    });

    const row = await knex("application_submission_consent_events")
      .where({ application_id: representationApplicationId })
      .first();
    expect(row.consent_text_version).toBe(CURRENT_SUBMISSION_DISCLOSURE_VERSION);
    expect(row.acknowledgement_version).toBe(CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION);
    expect(row.purpose).toBe(CALL_PURPOSES.REPRESENTATION);
    expect(row.open_call_link_id).toBeNull();
    expect(row.compensation_disclosure).toBeNull();
  });

  test("an event submission carries its purpose, its call and the pay it read", async () => {
    const snapshot = buildSubmissionDisclosureSnapshot({
      agencyName: "Fashion Week Brooklyn",
      purpose: CALL_PURPOSES.EVENT_CASTING,
      eventContext: EVENT_CONTEXT,
    });

    await knex.transaction(async (trx) => {
      await recordSubmissionDisclosureConsent(trx, {
        applicationId: eventApplicationId,
        userId,
        profileId,
        agencyId,
        packageFingerprint: "b".repeat(64),
        disclosureSnapshot: snapshot,
        purpose: CALL_PURPOSES.EVENT_CASTING,
        openCallLinkId: linkId,
        compensationDisclosure: snapshot.compensationDisclosure,
      });
    });

    const row = await knex("application_submission_consent_events")
      .where({ application_id: eventApplicationId })
      .first();
    expect(row.purpose).toBe(CALL_PURPOSES.EVENT_CASTING);
    expect(row.open_call_link_id).toBe(linkId);
    expect(row.consent_text_version).toBe(EVENT_CASTING_DISCLOSURE_VERSION);
    expect(row.acknowledgement_version).toBe(
      ACKNOWLEDGEMENT_VERSIONS[CALL_PURPOSES.EVENT_CASTING],
    );
    expect(readJson(row.compensation_disclosure)).toEqual({
      type: "paid",
      details: "$350 per show day, paid within 30 days.",
      statement:
        "Fashion Week Brooklyn states this is PAID. $350 per show day, paid within 30 days.",
    });
    // The frozen sentence survives an organizer editing the live call later.
    expect(readJson(row.disclosure_snapshot).thirdPartyAccess).toBe(
      snapshot.thirdPartyAccess,
    );
  });
});
