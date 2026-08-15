"use strict";

/**
 * Trust registry pipeline + directory honesty (design §b, §c, rulings R3–R5).
 *
 * The expensive failures this suite exists to catch are all failures of
 * honesty, not of plumbing:
 *
 *  - a certificate number that is not in the committed registry snapshot
 *    reaching the database (ruling R4);
 *  - a reference entry or an event organizer appearing in the directory a
 *    talent picks application destinations from (ruling R5 + the org_kind gap
 *    flagged in migration 20260815093000);
 *  - a verification that has left the pack continuing to be asserted.
 *
 * It runs against a real migrated schema rather than a hand-built one, because
 * the natural keys — the (registry, certificate_number) unique, the derived
 * call-window ids — are the thing under test.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const signature = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("talent-trust-registry");

const { acceptedLegal } = require("../setup/legal-fixture");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const SESSION_SECRET = require("../../src/config").sessionSecret;

const {
  TrustRegistryValidationError,
  validateTrustRegistry,
} = require("../../scripts/validate-trust-registry");
const {
  callWindowId,
  syncTrustRegistry,
} = require("../../scripts/sync-trust-registry");
const {
  validateRegistry,
} = require("../../scripts/validate-spec-registry");
const {
  publishRegistry,
} = require("../../src/domains/spec-registry/store/publisher");
const {
  listRegistryRoutes,
} = require("../../src/domains/spec-registry/preflight-service");

const TRUST_PACK_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "trust-registry",
  "v1",
);
const REFERENCE_DATE = "2026-08-15";

/** Real, from the committed 2026-08-15 NY DOL pull. */
const WILHELMINA_CERTIFICATE = "26-69UG6-LSFW";
const MUSE_CERTIFICATE = "26-67AN4-LSFW";

const talent = {
  userId: uuidv4(),
  profileId: uuidv4(),
  sessionId: `trust-registry-${uuidv4()}`,
};

const AGENCY_VERIFIED = uuidv4();
const AGENCY_PLAIN = uuidv4();
const AGENCY_REFERENCE = uuidv4();
const AGENCY_ORGANIZER = uuidv4();

function signedCookie(sessionId) {
  return [
    `connect.sid=${encodeURIComponent(`s:${signature.sign(sessionId, SESSION_SECRET)}`)}; Path=/; HttpOnly`,
  ];
}

function clonePack(pack) {
  return JSON.parse(JSON.stringify(pack));
}

async function seedSession() {
  await knex("users").insert({
    id: talent.userId,
    email: `trust-registry-${talent.userId}@example.com`,
    password_hash: "test-only",
    role: "TALENT",
    email_verified: true,
    ...acceptedLegal(),
  });
  await knex("profiles").insert({
    id: talent.profileId,
    user_id: talent.userId,
    slug: `trust-registry-${talent.profileId}`,
    first_name: "Mia",
    last_name: "Voss",
    city: "New York",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  });
  await knex("sessions").insert({
    sid: talent.sessionId,
    sess: JSON.stringify({
      cookie: {
        path: "/",
        httpOnly: true,
        originalMaxAge: 86400000,
        expires: new Date(Date.now() + 86400000).toISOString(),
      },
      userId: talent.userId,
      role: "TALENT",
    }),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe("trust registry", () => {
  let pack;

  beforeAll(async () => {
    await migrate(knex);
    await seedSession();
    await publishRegistry(knex, validateRegistry());
    pack = validateTrustRegistry({ registryRoot: TRUST_PACK_ROOT });
  }, 180000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  describe("validator", () => {
    let packDir;

    beforeAll(() => {
      packDir = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-trust-pack-"));
      fs.mkdirSync(path.join(packDir, "schemas"));
      fs.mkdirSync(path.join(packDir, "raw"));
      fs.mkdirSync(path.join(packDir, "verifications"));
      fs.mkdirSync(path.join(packDir, "call-windows"));
      for (const name of ["verification-entry.schema.json", "call-window.schema.json"]) {
        fs.copyFileSync(
          path.join(TRUST_PACK_ROOT, "schemas", name),
          path.join(packDir, "schemas", name),
        );
      }
      fs.copyFileSync(
        path.join(TRUST_PACK_ROOT, "raw", "nydol-hder-iq9y-2026-08-15.json"),
        path.join(packDir, "raw", "nydol-hder-iq9y-2026-08-15.json"),
      );
    });

    afterAll(() => {
      fs.rmSync(packDir, { recursive: true, force: true });
    });

    function writeEntry(name, overrides) {
      const base = pack.verifications.find(
        (entry) => entry.certificateNumber === WILHELMINA_CERTIFICATE,
      );
      fs.writeFileSync(
        path.join(packDir, "verifications", `${name}.json`),
        JSON.stringify({ ...base, ...overrides }, null, 2),
      );
    }

    afterEach(() => {
      for (const file of fs.readdirSync(path.join(packDir, "verifications"))) {
        fs.rmSync(path.join(packDir, "verifications", file));
      }
    });

    test("the shipped pack is valid, and every entry is a real snapshot row", () => {
      expect(pack.summary).toMatchObject({ snapshots: 1, snapshotRows: 75 });
      expect(pack.verifications.length).toBeGreaterThan(0);
      expect(
        pack.verifications.map((entry) => entry.certificateNumber),
      ).toContain(WILHELMINA_CERTIFICATE);
    });

    test("a transcribed copy of a real row passes", () => {
      writeEntry("wilhelmina", {});
      expect(() =>
        validateTrustRegistry({ registryRoot: packDir }),
      ).not.toThrow();
    });

    test("rejects a fabricated certificate number (ruling R4)", () => {
      writeEntry("wilhelmina", { certificateNumber: "26-00000-LSFW" });

      let thrown;
      try {
        validateTrustRegistry({ registryRoot: packDir });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(TrustRegistryValidationError);
      expect(thrown.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "certificate_not_in_snapshot" }),
        ]),
      );
    });

    test("rejects a real certificate whose transcribed dates have drifted", () => {
      writeEntry("wilhelmina", { expiresOn: "2030-01-01" });

      let thrown;
      try {
        validateTrustRegistry({ registryRoot: packDir });
      } catch (error) {
        thrown = error;
      }

      expect(thrown.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "transcription_mismatch",
            location: expect.stringContaining("/expiresOn"),
          }),
        ]),
      );
    });

    test("rejects an entry that belongs to neither an organisation nor an agency", () => {
      writeEntry("wilhelmina", { organizationId: null, agencyId: null });

      let thrown;
      try {
        validateTrustRegistry({ registryRoot: packDir });
      } catch (error) {
        thrown = error;
      }

      expect(thrown.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "verification_without_owner" }),
        ]),
      );
    });
  });

  describe("sync", () => {
    test("publishes the pack with its real certificate numbers", async () => {
      const result = await syncTrustRegistry(knex, pack);

      expect(result.status).toBe("synced");
      expect(result.verifications.total).toBe(pack.verifications.length);

      const rows = await knex("agency_verifications").select("*");
      expect(rows).toHaveLength(pack.verifications.length);
      const wilhelmina = rows.find(
        (row) => row.organization_id === "wilhelmina",
      );
      expect(wilhelmina).toMatchObject({
        registry: "ny_dol",
        certificate_number: WILHELMINA_CERTIFICATE,
        legal_name: "WILHELMINA INTERNATIONAL INC.",
        registry_status: "active",
      });

      const windows = await knex("agency_call_windows").select("*");
      expect(windows).toHaveLength(pack.callWindows.length);
      // "Tuesdays, time unpublished" survives the round trip as a real row.
      const msa = windows.find((row) => row.display_name === "MSA Models");
      expect(msa).toMatchObject({ weekday: 2, start_minute: null, end_minute: null });
    });

    test("re-running changes nothing — same ids, same rows", async () => {
      const before = await knex("agency_verifications").orderBy("id").select("*");
      const windowsBefore = await knex("agency_call_windows").orderBy("id").select("*");

      const result = await syncTrustRegistry(knex, pack);
      expect(result.verifications.delisted).toBe(0);
      expect(result.callWindows.delisted).toBe(0);

      const after = await knex("agency_verifications").orderBy("id").select("*");
      const windowsAfter = await knex("agency_call_windows").orderBy("id").select("*");
      expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
      expect(after.map((row) => row.certificate_number)).toEqual(
        before.map((row) => row.certificate_number),
      );
      expect(windowsAfter.map((row) => row.id)).toEqual(
        windowsBefore.map((row) => row.id),
      );
    });

    test("a row removed from the pack is delisted, and comes back when re-added", async () => {
      const msaId = callWindowId(
        pack.callWindows.find((entry) => entry.displayName === "MSA Models"),
      );

      const reduced = clonePack(pack);
      reduced.verifications = reduced.verifications.filter(
        (entry) => entry.certificateNumber !== WILHELMINA_CERTIFICATE,
      );
      reduced.callWindows = reduced.callWindows.filter(
        (entry) => entry.displayName !== "MSA Models",
      );

      const delisting = await syncTrustRegistry(knex, reduced);
      expect(delisting.verifications.delisted).toBe(1);
      expect(delisting.callWindows.delisted).toBe(1);

      // A verification is deleted: it is a positive public claim, and we have
      // stopped standing behind it.
      expect(
        await knex("agency_verifications")
          .where({ certificate_number: WILHELMINA_CERTIFICATE })
          .first(),
      ).toBeUndefined();
      // A call window is deactivated: `active` exists for exactly this, and the
      // row still records when the hours were last confirmed.
      expect(await knex("agency_call_windows").where({ id: msaId }).first()).toMatchObject({
        display_name: "MSA Models",
      });
      expect(
        (await knex("agency_call_windows").where({ id: msaId }).first()).active,
      ).toBeFalsy();

      const restored = await syncTrustRegistry(knex, pack);
      expect(restored.verifications.delisted).toBe(0);
      expect(
        await knex("agency_verifications")
          .where({ certificate_number: WILHELMINA_CERTIFICATE })
          .first(),
      ).toBeDefined();
      expect(
        (await knex("agency_call_windows").where({ id: msaId }).first()).active,
      ).toBeTruthy();
    });

    test("--verify-only reports drift instead of silently repairing it", async () => {
      await knex("agency_verifications")
        .where({ certificate_number: WILHELMINA_CERTIFICATE })
        .update({ expires_on: "2099-01-01" });

      await expect(
        syncTrustRegistry(knex, pack, { verifyOnly: true }),
      ).rejects.toMatchObject({ code: "TRUST_REGISTRY_VERIFICATION_DRIFT" });

      await syncTrustRegistry(knex, pack);
      await expect(
        syncTrustRegistry(knex, pack, { verifyOnly: true }),
      ).resolves.toMatchObject({ status: "verified" });
    });
  });

  describe("preflight route DTO", () => {
    test("carries the verification and call windows of the matched organisation", async () => {
      const payload = await listRegistryRoutes(knex, {
        referenceDate: REFERENCE_DATE,
      });

      const muse = payload.routes.find(
        (route) => route.organization.id === "muse-model-management",
      );
      expect(muse.verification).toEqual({
        registry: "ny_dol",
        certificateNumber: MUSE_CERTIFICATE,
        expiresOn: "2028-01-12",
        registryStatus: "active",
        verifiedOn: "2026-08-15",
      });
      expect(muse.callWindows).toEqual([
        expect.objectContaining({
          displayName: "Muse Model Management",
          label: "Walk-in open call",
          weekday: 4,
          startMinute: 900,
          endMinute: 960,
          timezone: "America/New_York",
        }),
      ]);
    });

    test("renders nothing for an organisation with no registry match (ruling R3)", async () => {
      const payload = await listRegistryRoutes(knex, {
        referenceDate: REFERENCE_DATE,
      });

      // Models1 is a UK agency; the NY register has no row for it, and absence
      // must read as silence, not as a negative claim.
      const models1 = payload.routes.find(
        (route) => route.organization.id === "models1-limited",
      );
      expect(models1.verification).toBeNull();
      expect(models1.callWindows).toEqual([]);
    });
  });

  describe("GET /api/talent/call-windows", () => {
    test("returns every live window, ordered the way a week reads", async () => {
      const response = await request(app)
        .get("/api/talent/call-windows")
        .set("Cookie", signedCookie(talent.sessionId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.map((row) => row.displayName)).toEqual([
        "MSA Models",
        "Que Management",
        "Muse Model Management",
      ]);
      expect(response.body.data[0]).toMatchObject({
        weekday: 2,
        startMinute: null,
        endMinute: null,
        timezone: "America/New_York",
        organizationId: null,
      });
    });

    test("is talent-only", async () => {
      await request(app).get("/api/talent/call-windows").expect(401);
    });
  });

  describe("GET /api/talent/agencies", () => {
    beforeAll(async () => {
      await knex("agencies").insert([
        {
          id: AGENCY_VERIFIED,
          name: "Meridian Talent Collective",
          status: "ACTIVE",
          org_kind: "agency",
        },
        {
          id: AGENCY_PLAIN,
          name: "Harbor Model Management",
          status: "ACTIVE",
          org_kind: "agency",
        },
        {
          id: AGENCY_REFERENCE,
          name: "Reference House",
          status: "REFERENCE",
          org_kind: "agency",
        },
        {
          id: AGENCY_ORGANIZER,
          name: "Fashion Week Brooklyn",
          status: "ACTIVE",
          org_kind: "event_organizer",
        },
      ]);
      // An agency-owned verification, the other half of the two nullable owner
      // columns. Curated the same way a pack entry is; kept out of the pack
      // here only because these fixtures are not real organisations.
      await knex("agency_verifications").insert({
        id: uuidv4(),
        registry: "ny_dol",
        organization_id: null,
        agency_id: AGENCY_VERIFIED,
        legal_name: "Meridian Talent Collective LLC",
        certificate_number: "26-TEST1-LSFW",
        registered_on: "2026-03-02",
        expires_on: "2028-03-02",
        registry_status: "active",
        evidence_url: "https://data.ny.gov/resource/hder-iq9y.json",
        retrieved_on: "2026-08-15",
        verified_on: "2026-08-15",
      });
    });

    test("lists only ACTIVE agencies, and carries their verification", async () => {
      const response = await request(app)
        .get("/api/talent/agencies")
        .set("Cookie", signedCookie(talent.sessionId))
        .expect(200);

      const names = response.body.data.map((agency) => agency.name);
      // Ruling R5: a reference entry is not a destination.
      expect(names).not.toContain("Reference House");
      // The org_kind gap flagged in migration 20260815093000: an organizer runs
      // a casting, it does not sign talent.
      expect(names).not.toContain("Fashion Week Brooklyn");
      expect(names).toEqual(
        expect.arrayContaining([
          "Meridian Talent Collective",
          "Harbor Model Management",
        ]),
      );

      const verified = response.body.data.find(
        (agency) => agency.id === AGENCY_VERIFIED,
      );
      expect(verified.verification).toEqual({
        registry: "ny_dol",
        certificateNumber: "26-TEST1-LSFW",
        expiresOn: "2028-03-02",
        registryStatus: "active",
        verifiedOn: "2026-08-15",
      });

      const plain = response.body.data.find((agency) => agency.id === AGENCY_PLAIN);
      expect(plain.verification).toBeNull();
    });
  });
});
