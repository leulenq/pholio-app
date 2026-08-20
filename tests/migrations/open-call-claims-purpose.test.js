"use strict";

/**
 * The quota exemption is keyed per call, not per organizer
 * (`docs/open-call-applicant-flow-design-2026-08.md` §1 C4).
 *
 * The bug this suite pins: a model who applied to FWBK Brooklyn had her claim
 * consumed, and `mintClaim` then refused to mint anything for FWBK Queens
 * because `uq_open_call_claims_agency_profile` said one exemption per (agency,
 * profile) forever. Her Queens application silently burned a monthly discovery
 * slot on a path the product promises is free.
 *
 * Both halves live here on purpose — the schema's partial uniques and the
 * service's key selection are one mechanism, and a test that mocked either side
 * would pass while production stayed broken. It migrates a throwaway SQLite
 * file to latest for the same reason `event-casting-schema.test.js` does: the
 * interesting failures are ordering failures.
 */

const crypto = require("crypto");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("open-call-claims-purpose");
const db = require("../../src/shared/db/knex");

const purposeMigration = require("../../migrations/20260819100000_open_call_claims_per_purpose");

const {
  CALL_KINDS,
  CALL_PURPOSES,
} = require("../../src/shared/constants/event-casting");
const {
  CLAIM_STATUSES,
  consumeClaim,
  mintClaim,
  resolveActiveClaim,
} = require("../../src/domains/talent/services/open-call-claims");

const uuid = () => crypto.randomUUID();

// One organizer running two editions, plus a representation agency.
const organizerId = uuid();
const agencyId = uuid();
const brooklynId = uuid();
const queensId = uuid();
const organizerReprLinkId = uuid();
const reprLinkOneId = uuid();
const reprLinkTwoId = uuid();

const profileId = uuid();
const otherProfileId = uuid();

async function insertProfile(id, slug) {
  const userId = uuid();
  await db("users").insert({ id: userId, email: `${slug}@example.test`, role: "TALENT" });
  await db("profiles").insert({
    id,
    user_id: userId,
    slug,
    first_name: "Test",
    city: "New York",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
  });
}

async function indexNames(table) {
  const rows = await db("sqlite_master")
    .select("name")
    .where({ type: "index", tbl_name: table });
  return rows.map((row) => row.name);
}

function mintArgs(linkId, agency, profile) {
  return { linkId, arrivalId: null, agencyId: agency, profileId: profile };
}

describe("open call claims are keyed per call", () => {
  beforeAll(async () => {
    await migrate(db);

    await db("agencies").insert([
      { id: organizerId, name: "Fashion Week Brooklyn" },
      { id: agencyId, name: "Representation House" },
    ]);
    await insertProfile(profileId, "claims-talent");
    await insertProfile(otherProfileId, "claims-second-talent");
    await db("agency_open_call_links").insert([
      {
        id: brooklynId,
        agency_id: organizerId,
        code: "fwbk-brooklyn",
        label: "Brooklyn edition",
        call_kind: CALL_KINDS.EVENT_CASTING,
      },
      {
        id: queensId,
        agency_id: organizerId,
        code: "fwbk-queens",
        label: "Queens edition",
        call_kind: CALL_KINDS.EVENT_CASTING,
      },
      {
        id: organizerReprLinkId,
        agency_id: organizerId,
        code: "fwbk-roster",
        label: "Roster call",
        call_kind: CALL_KINDS.REPRESENTATION,
      },
      {
        id: reprLinkOneId,
        agency_id: agencyId,
        code: "repr-website",
        label: "Website",
        call_kind: CALL_KINDS.REPRESENTATION,
      },
      {
        id: reprLinkTwoId,
        agency_id: agencyId,
        code: "repr-newsletter",
        label: "Newsletter",
        call_kind: CALL_KINDS.REPRESENTATION,
      },
    ]);
  }, 120000);

  afterEach(async () => {
    await db("agency_open_call_claims").del();
  });

  describe("schema", () => {
    test("claims carry the call purpose, defaulting to representation", async () => {
      expect(
        await db.schema.hasColumn("agency_open_call_claims", "call_purpose"),
      ).toBe(true);
      const id = uuid();
      await db("agency_open_call_claims").insert({
        id,
        link_id: brooklynId,
        agency_id: organizerId,
        profile_id: profileId,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      const row = await db("agency_open_call_claims").where({ id }).first();
      expect(row.call_purpose).toBe(CALL_PURPOSES.REPRESENTATION);
    });

    test("the blanket agency+profile unique is gone", async () => {
      expect(await indexNames("agency_open_call_claims")).not.toContain(
        "uq_open_call_claims_agency_profile",
      );
    });

    test("both per-purpose partial uniques exist", async () => {
      expect(await indexNames("agency_open_call_claims")).toEqual(
        expect.arrayContaining([
          "uq_open_call_claims_agency_profile_repr",
          "uq_open_call_claims_link_profile_event",
        ]),
      );
    });

    test("two live event claims for one organizer are allowed, one per edition", async () => {
      const rows = [brooklynId, queensId].map((linkId) => ({
        id: uuid(),
        link_id: linkId,
        agency_id: organizerId,
        profile_id: profileId,
        call_purpose: CALL_PURPOSES.EVENT_CASTING,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }));
      await expect(db("agency_open_call_claims").insert(rows)).resolves.toBeDefined();
      await expect(
        db("agency_open_call_claims").insert({
          ...rows[0],
          id: uuid(),
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    test("a second live representation claim for one agency is still rejected", async () => {
      const claim = {
        id: uuid(),
        link_id: reprLinkOneId,
        agency_id: agencyId,
        profile_id: profileId,
        call_purpose: CALL_PURPOSES.REPRESENTATION,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await db("agency_open_call_claims").insert(claim);
      await expect(
        db("agency_open_call_claims").insert({
          ...claim,
          id: uuid(),
          // A different link of the same agency is still the same claim.
          link_id: reprLinkTwoId,
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });
  });

  describe("minting", () => {
    test("a consumed Brooklyn claim does not block Queens — the C4 bug", async () => {
      const brooklyn = await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      expect(brooklyn.claim).toBeTruthy();
      expect(brooklyn.minted).toBe(true);
      expect(brooklyn.claim.call_purpose).toBe(CALL_PURPOSES.EVENT_CASTING);
      await consumeClaim(db, brooklyn.claim.id, null);

      const queens = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      expect(queens.claim).toBeTruthy();
      expect(queens.minted).toBe(true);
      expect(queens.claim.id).not.toBe(brooklyn.claim.id);
      expect(queens.claim.link_id).toBe(queensId);
      expect(queens.claim.call_purpose).toBe(CALL_PURPOSES.EVENT_CASTING);
    });

    test("a consumed event claim blocks re-minting for that same edition", async () => {
      const first = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      await consumeClaim(db, first.claim.id, null);
      const again = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      expect(again).toEqual({ claim: null, minted: false });
    });

    test("re-arrival on an edition refreshes that edition's claim, not another's", async () => {
      const brooklyn = await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      const queens = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      const again = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      expect(again.minted).toBe(false);
      expect(again.claim.id).toBe(queens.claim.id);
      expect(again.claim.link_id).toBe(queensId);
      const untouched = await db("agency_open_call_claims")
        .where({ id: brooklyn.claim.id })
        .first();
      expect(untouched.link_id).toBe(brooklynId);
      expect(untouched.status).toBe(CLAIM_STATUSES.ACTIVE);
    });

    test("a consumed representation claim still blocks re-minting for that agency", async () => {
      const first = await mintClaim(db, mintArgs(reprLinkOneId, agencyId, profileId));
      expect(first.claim.call_purpose).toBe(CALL_PURPOSES.REPRESENTATION);
      await consumeClaim(db, first.claim.id, null);

      // Another link of the same agency is not another chance at the exemption.
      const second = await mintClaim(db, mintArgs(reprLinkTwoId, agencyId, profileId));
      expect(second).toEqual({ claim: null, minted: false });
    });

    test("a spent event claim leaves the organizer's representation call open", async () => {
      const brooklyn = await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      await consumeClaim(db, brooklyn.claim.id, null);
      const roster = await mintClaim(
        db,
        mintArgs(organizerReprLinkId, organizerId, profileId),
      );
      expect(roster.claim).toBeTruthy();
      expect(roster.claim.call_purpose).toBe(CALL_PURPOSES.REPRESENTATION);
    });

    test("one edition's claims are per profile", async () => {
      await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      const other = await mintClaim(db, mintArgs(brooklynId, organizerId, otherProfileId));
      expect(other.claim).toBeTruthy();
      expect(other.minted).toBe(true);
    });
  });

  describe("resolving the claim a submission may spend", () => {
    test("an event submission resolves the claim for its own edition", async () => {
      const brooklyn = await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      const queens = await mintClaim(db, mintArgs(queensId, organizerId, profileId));

      const forQueens = await resolveActiveClaim(db, profileId, organizerId, {
        callPurpose: CALL_PURPOSES.EVENT_CASTING,
        linkId: queensId,
      });
      expect(forQueens.id).toBe(queens.claim.id);

      const forBrooklyn = await resolveActiveClaim(db, profileId, organizerId, {
        callPurpose: CALL_PURPOSES.EVENT_CASTING,
        linkId: brooklynId,
      });
      expect(forBrooklyn.id).toBe(brooklyn.claim.id);
    });

    test("an edition with no claim resolves nothing, even when a sibling edition has one", async () => {
      await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      const resolved = await resolveActiveClaim(db, profileId, organizerId, {
        callPurpose: CALL_PURPOSES.EVENT_CASTING,
        linkId: queensId,
      });
      expect(resolved).toBeNull();
    });

    test("a representation submission never spends an event claim", async () => {
      /* The C4 bug through the side door. The event key is (link, profile) and
         the representation key is (agency, profile), so an agency-keyed lookup
         with no purpose filter matches the Queens claim too — and `consumeClaim`
         then spends the Queens exemption on a representation application. The
         later Queens submission is taxed AND cannot re-mint, because a consumed
         claim blocks its own key forever. */
      const brooklyn = await mintClaim(db, mintArgs(brooklynId, organizerId, profileId));
      expect(brooklyn.claim.call_purpose).toBe(CALL_PURPOSES.EVENT_CASTING);

      expect(
        await resolveActiveClaim(db, profileId, organizerId, {
          callPurpose: CALL_PURPOSES.REPRESENTATION,
          linkId: null,
        }),
      ).toBeNull();
      // …and with no options at all, which is what every non-event submit passes.
      expect(await resolveActiveClaim(db, profileId, organizerId)).toBeNull();

      // The event claim is untouched and still spendable by its own edition.
      const forBrooklyn = await resolveActiveClaim(db, profileId, organizerId, {
        callPurpose: CALL_PURPOSES.EVENT_CASTING,
        linkId: brooklynId,
      });
      expect(forBrooklyn.id).toBe(brooklyn.claim.id);
    });

    test("with both live, a representation submission resolves only the representation claim", async () => {
      const event = await mintClaim(db, mintArgs(queensId, organizerId, profileId));
      const repr = await mintClaim(
        db,
        mintArgs(organizerReprLinkId, organizerId, profileId),
      );

      const resolved = await resolveActiveClaim(db, profileId, organizerId, {
        callPurpose: CALL_PURPOSES.REPRESENTATION,
      });
      expect(resolved.id).toBe(repr.claim.id);
      expect(resolved.call_purpose).toBe(CALL_PURPOSES.REPRESENTATION);
      expect(resolved.id).not.toBe(event.claim.id);
    });

    test("representation resolves by agency, with or without options", async () => {
      const { claim } = await mintClaim(db, mintArgs(reprLinkOneId, agencyId, profileId));
      expect((await resolveActiveClaim(db, profileId, agencyId)).id).toBe(claim.id);
      expect(
        (
          await resolveActiveClaim(db, profileId, agencyId, {
            callPurpose: CALL_PURPOSES.REPRESENTATION,
            linkId: null,
          })
        ).id,
      ).toBe(claim.id);
    });
  });
});

/**
 * Runs last: it takes the claim key down to its pre-migration shape and back
 * up, so nothing may depend on it having finished in the state it started.
 */
describe("backfilling the purpose of existing claims", () => {
  const eventClaimId = uuid();
  const reprClaimId = uuid();

  test("down, then up, reads the purpose off the link", async () => {
    // The blanket key cannot represent two editions, so nothing survives the
    // rollback here by design — `down` recreates an index these rows would
    // violate, which is exactly the honest failure it is documented to be.
    await db("agency_open_call_claims").del();

    await purposeMigration.down(db);
    expect(
      await db.schema.hasColumn("agency_open_call_claims", "call_purpose"),
    ).toBe(false);
    expect(await indexNames("agency_open_call_claims")).toContain(
      "uq_open_call_claims_agency_profile",
    );

    // Two pre-migration claims: one minted through what is now an event call,
    // one through a representation call.
    await db("agency_open_call_claims").insert([
      {
        id: eventClaimId,
        link_id: brooklynId,
        agency_id: organizerId,
        profile_id: profileId,
        status: CLAIM_STATUSES.CONSUMED,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: reprClaimId,
        link_id: reprLinkOneId,
        agency_id: agencyId,
        profile_id: profileId,
        status: CLAIM_STATUSES.ACTIVE,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    await purposeMigration.up(db);

    const event = await db("agency_open_call_claims").where({ id: eventClaimId }).first();
    const repr = await db("agency_open_call_claims").where({ id: reprClaimId }).first();
    expect(event.call_purpose).toBe(CALL_PURPOSES.EVENT_CASTING);
    expect(repr.call_purpose).toBe(CALL_PURPOSES.REPRESENTATION);

    const names = await indexNames("agency_open_call_claims");
    expect(names).not.toContain("uq_open_call_claims_agency_profile");
    expect(names).toEqual(
      expect.arrayContaining([
        "uq_open_call_claims_agency_profile_repr",
        "uq_open_call_claims_link_profile_event",
      ]),
    );
  }, 60000);

  test("the backfilled event claim no longer blocks a sibling edition", async () => {
    // The whole point: the consumed Brooklyn row survived the migration as an
    // event claim, so Queens is now mintable.
    const queens = await db("agency_open_call_claims").insert({
      id: uuid(),
      link_id: queensId,
      agency_id: organizerId,
      profile_id: profileId,
      call_purpose: CALL_PURPOSES.EVENT_CASTING,
      status: CLAIM_STATUSES.ACTIVE,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(queens).toBeDefined();
  });

  test("migrate.latest is a no-op after the hand-run up", async () => {
    const [, log] = await db.migrate.latest();
    expect(log).toEqual([]);
  }, 60000);
});

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});
