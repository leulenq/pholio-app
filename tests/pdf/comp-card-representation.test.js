"use strict";

/**
 * A represented model's comp card, end to end against the real schema
 * (industry alignment audit §2.1).
 *
 * The failure: the card resolved representation from `profiles.partner_agency_id`
 * — a column nothing writes — so every card composed the "Direct Bookings"
 * branch and printed the model's personal phone number, no matter how many
 * live agency relationships sat in `talent_representations`.
 *
 * This suite reads those relationships out of a migrated database (so the
 * resolver's SQL is exercised against the actual columns, not a stub) and
 * composes a card from the result.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("comp-card-representation");

const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const { resolveRepresentation } = require("../../src/domains/pdf/representation");
const { composeCompCard } = require("../../src/domains/pdf/composition");

const PHONE = "+1 917 555 0134";

const AGENCY_ID = uuidv4();
const REPRESENTED_ID = uuidv4();
const UNREPRESENTED_ID = uuidv4();

/**
 * `instagram_handle` is not a `profiles` column — the route injects it from
 * `social_accounts` before composing, so the fixture does the same.
 */
async function loadProfile(id) {
  const row = await knex("profiles").where({ id }).first();
  return { ...row, instagram_handle: "nadiaroux" };
}

const IMG = (id, shot, w, h, extra = {}) => ({
  id,
  path: `/uploads/${id}.jpg`,
  label: id,
  shot_type: shot,
  width: w,
  height: h,
  sort: extra.sort || 1,
  usage_rights: "granted",
  ...extra,
});

const IMAGES = [
  IMG("i1", "headshot", 1200, 1800, { is_primary: true, sort: 1 }),
  IMG("i2", "three_quarter", 900, 1125, { sort: 2 }),
  IMG("i3", "full_length", 900, 1247, { sort: 3 }),
  IMG("i4", "profile", 900, 1350, { sort: 4 }),
];

function profileRow(id, slug) {
  return {
    id,
    slug,
    first_name: "Nadia",
    last_name: "Roux",
    gender: "Female",
    date_of_birth: "1999-04-02",
    city: "New York",
    phone: PHONE,
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    dress_size: "4",
    shoe_size: "9",
    hair_color: "brown",
    eye_color: "green",
  };
}

async function representation(row) {
  await knex("talent_representations").insert({
    id: uuidv4(),
    profile_id: REPRESENTED_ID,
    // scope_key is the table's uniqueness key for an active relationship.
    scope_key: `${row.market || ""}|${row.territory || ""}`,
    relationship_type: "placement",
    status: "active",
    source: "profile",
    ...row,
  });
}

beforeAll(async () => {
  await migrate(knex);

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Icon Management",
    location: "Paris",
    website: "iconmgmt.example",
    support_email: "bookings@iconmgmt.example",
  });

  const userA = uuidv4();
  const userB = uuidv4();
  await knex("users").insert([
    { id: userA, email: "represented@example.com", role: "TALENT" },
    { id: userB, email: "solo@example.com", role: "TALENT" },
  ]);
  await knex("profiles").insert([
    {
      ...profileRow(REPRESENTED_ID, "nadia-roux"),
      user_id: userA,
      bio_raw: "x",
      bio_curated: "x",
    },
    {
      ...profileRow(UNREPRESENTED_ID, "solo-talent"),
      user_id: userB,
      bio_raw: "x",
      bio_curated: "x",
    },
  ]);

  // A mother agency that is not on Pholio, plus an internal Paris placement.
  await representation({
    external_agency_name: "Mother Management",
    external_agency_key: "mother management",
    relationship_type: "mother",
  });
  await representation({
    agency_id: AGENCY_ID,
    market: "Paris",
    territory: "FR",
    division: "Women",
  });
  // An ended relationship must never surface.
  await representation({
    external_agency_name: "Former Milan",
    external_agency_key: "former milan",
    market: "Milan",
    status: "ended",
    ended_on: "2025-12-01",
  });
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("resolveRepresentation against the real table", () => {
  test("a Paris card leads with the Paris agency, contact and all", async () => {
    const profile = await loadProfile(REPRESENTED_ID);
    const resolved = await resolveRepresentation({ knex, profile, market: "Paris" });
    expect(resolved).toEqual(
      expect.objectContaining({
        name: "Icon Management",
        kind: "internal",
        relationshipType: "placement",
        market: "Paris",
      }),
    );
    expect(resolved.contactLine).toContain("bookings@iconmgmt.example");
  });

  test("an unscoped card falls back to the mother agency", async () => {
    const profile = await loadProfile(REPRESENTED_ID);
    const resolved = await resolveRepresentation({ knex, profile });
    expect(resolved.name).toBe("Mother Management");
    expect(resolved.kind).toBe("external");
  });

  test("a market with only an ENDED relationship falls back, never to it", async () => {
    const profile = await loadProfile(REPRESENTED_ID);
    const resolved = await resolveRepresentation({ knex, profile, market: "Milan" });
    expect(resolved.name).toBe("Mother Management");
  });

  test("a talent with no relationships resolves to nothing", async () => {
    const profile = await loadProfile(UNREPRESENTED_ID);
    expect(await resolveRepresentation({ knex, profile })).toBeNull();
  });
});

describe("the card a represented model actually receives", () => {
  test("agency block, and the model's phone appears nowhere on it", async () => {
    const profile = await loadProfile(REPRESENTED_ID);
    const resolved = await resolveRepresentation({ knex, profile, market: "Paris" });
    const { plan } = await composeCompCard({
      profile,
      images: IMAGES,
      archetype: null,
      options: { seed: "representation-regression", representation: resolved },
    });

    expect(plan.back.booking.mode).toBe("represented");
    expect(plan.back.booking.label).toBe("Representation");
    expect(plan.back.booking.primary).toBe("Icon Management");
    expect(plan.back.booking.line).toContain("bookings@iconmgmt.example");

    // The whole plan, not just the booking block: no surface of the card may
    // carry the model's personal number while an agency represents them.
    expect(JSON.stringify(plan)).not.toContain(PHONE);
    expect(JSON.stringify(plan)).not.toContain("Direct Bookings");
  });

  test("a genuinely unrepresented talent still gets a usable direct card", async () => {
    const profile = await loadProfile(UNREPRESENTED_ID);
    const resolved = await resolveRepresentation({ knex, profile });
    const { plan } = await composeCompCard({
      profile,
      images: IMAGES,
      archetype: null,
      options: { seed: "representation-regression", representation: resolved },
    });

    expect(plan.back.booking.mode).toBe("direct");
    expect(plan.back.booking.label).toBe("Direct Bookings");
    expect(plan.back.booking.primary).toBe(PHONE);
  });
});
