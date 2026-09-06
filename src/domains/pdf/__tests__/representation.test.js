"use strict";

/**
 * Comp-card representation (industry audit §2.1).
 *
 * The failure this covers: every card Pholio produced said "Direct Bookings"
 * and printed the model's personal phone number, because representation was
 * read from `profiles.partner_agency_id` — a column nothing writes — while the
 * real relationships sat unread in `talent_representations`.
 *
 * Two things are tested here. The precedence rule (which of several live
 * relationships belongs on THIS card), and the invariant that matters to a
 * working model: when any active representation exists, the card leads with
 * the agency and the model's own phone is nowhere on it.
 */

const {
  selectRepresentation,
  buildAgencyContactLine,
  resolveRepresentation,
} = require("../representation");
const { buildBookingBlock } = require("../composition/composition-director");

function row(overrides = {}) {
  return {
    id: overrides.id || "r-x",
    profile_id: "p-1",
    agency_id: null,
    external_agency_name: null,
    relationship_type: "placement",
    market: null,
    territory: null,
    division: null,
    is_exclusive: false,
    status: "active",
    started_on: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const MOTHER_GLOBAL = row({
  id: "mother",
  relationship_type: "mother",
  external_agency_name: "Mother Management",
  external_agency_key: "mother management",
  market: null,
});
const PLACEMENT_NY = row({
  id: "ny",
  relationship_type: "placement",
  external_agency_name: "NY Placement",
  market: "New York",
});
const PLACEMENT_PARIS = row({
  id: "paris",
  relationship_type: "placement",
  external_agency_name: "Paris Placement",
  market: "Paris",
});

describe("selectRepresentation — precedence", () => {
  test("a market-scoped card leads with the agency that works that market", () => {
    const pick = selectRepresentation(
      [MOTHER_GLOBAL, PLACEMENT_NY, PLACEMENT_PARIS],
      { market: "Paris" },
    );
    expect(pick.id).toBe("paris");
  });

  test("market matching ignores case and surrounding whitespace", () => {
    expect(
      selectRepresentation([MOTHER_GLOBAL, PLACEMENT_NY], { market: " new york " })
        .id,
    ).toBe("ny");
  });

  test("a mother agency in the card's market outranks a placement there", () => {
    const motherNy = row({
      id: "mother-ny",
      relationship_type: "mother",
      external_agency_name: "Mother NY",
      market: "New York",
    });
    expect(
      selectRepresentation([PLACEMENT_NY, motherNy], { market: "New York" }).id,
    ).toBe("mother-ny");
  });

  test("no market on the card ⇒ the mother agency speaks for the talent", () => {
    expect(
      selectRepresentation([PLACEMENT_NY, MOTHER_GLOBAL, PLACEMENT_PARIS], {}).id,
    ).toBe("mother");
  });

  test("a market with no match falls back to the mother agency", () => {
    expect(
      selectRepresentation([MOTHER_GLOBAL, PLACEMENT_NY], { market: "Tokyo" }).id,
    ).toBe("mother");
  });

  test("no mother agency ⇒ any active placement, deterministically ordered", () => {
    const pick = selectRepresentation([PLACEMENT_PARIS, PLACEMENT_NY], {
      market: "Tokyo",
    });
    // Same started_on/created_at ⇒ id order decides, and it must not vary.
    expect(pick.id).toBe("ny");
    expect(
      selectRepresentation([PLACEMENT_NY, PLACEMENT_PARIS], { market: "Tokyo" }).id,
    ).toBe("ny");
  });

  test("an exclusive placement outranks a non-exclusive one in the same group", () => {
    const exclusive = row({
      id: "zz-exclusive",
      external_agency_name: "Exclusive Co",
      is_exclusive: true,
    });
    expect(selectRepresentation([PLACEMENT_NY, exclusive], {}).id).toBe(
      "zz-exclusive",
    );
  });

  test("ended relationships are never printed", () => {
    const ended = row({
      id: "ended",
      relationship_type: "mother",
      external_agency_name: "Former Management",
      status: "ended",
      ended_on: "2025-11-01",
    });
    expect(selectRepresentation([ended], {})).toBeNull();
    expect(selectRepresentation([ended, PLACEMENT_NY], {}).id).toBe("ny");
  });

  test("no rows at all ⇒ nothing, and the card may fall through to direct", () => {
    expect(selectRepresentation([], {})).toBeNull();
    expect(selectRepresentation(null, { market: "Milan" })).toBeNull();
  });
});

describe("resolveRepresentation — internal vs external counterparty", () => {
  function fakeKnex({ representations = [], agencies = [] }) {
    return function table(name) {
      if (name === "talent_representations") {
        return {
          where: () => ({ select: async () => representations }),
        };
      }
      if (name === "agencies") {
        return {
          where: (criteria) => ({
            select: () => ({
              first: async () =>
                agencies.find((a) => a.id === criteria.id) || null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${name}`);
    };
  }

  test("an internal agency supplies its own name and contact line", async () => {
    const knex = fakeKnex({
      representations: [
        row({
          id: "internal",
          relationship_type: "mother",
          agency_id: "ag-1",
          external_agency_name: null,
        }),
      ],
      agencies: [
        {
          id: "ag-1",
          name: "Icon Management",
          location: "New York",
          website: "iconmgmt.com",
          support_email: "bookings@iconmgmt.com",
        },
      ],
    });
    const resolved = await resolveRepresentation({
      knex,
      profile: { id: "p-1" },
    });
    expect(resolved.name).toBe("Icon Management");
    expect(resolved.kind).toBe("internal");
    expect(resolved.relationshipType).toBe("mother");
    expect(resolved.contactLine).toContain("bookings@iconmgmt.com");
  });

  test("an external agency is still representation — name, no contact", async () => {
    const knex = fakeKnex({ representations: [MOTHER_GLOBAL] });
    const resolved = await resolveRepresentation({
      knex,
      profile: { id: "p-1" },
    });
    expect(resolved).toEqual(
      expect.objectContaining({
        name: "Mother Management",
        kind: "external",
        contactLine: "",
      }),
    );
  });

  test("the card's market reaches the resolver", async () => {
    const knex = fakeKnex({
      representations: [MOTHER_GLOBAL, PLACEMENT_PARIS],
    });
    const resolved = await resolveRepresentation({
      knex,
      profile: { id: "p-1" },
      market: "Paris",
    });
    expect(resolved.name).toBe("Paris Placement");
  });

  test("no relationships and no legacy column ⇒ null (direct branch)", async () => {
    const knex = fakeKnex({ representations: [] });
    expect(
      await resolveRepresentation({ knex, profile: { id: "p-1" } }),
    ).toBeNull();
  });

  test("a read failure never invents representation", async () => {
    const knex = () => ({
      where: () => ({
        select: async () => {
          throw new Error("no such table: talent_representations");
        },
      }),
    });
    expect(
      await resolveRepresentation({ knex, profile: { id: "p-1" } }),
    ).toBeNull();
  });
});

describe("buildAgencyContactLine", () => {
  test("prints the agency's channels, in booking order", () => {
    expect(
      buildAgencyContactLine({
        location: "Paris",
        support_email: "book@agency.fr",
        website: "agency.fr",
      }),
    ).toBe("Paris  ·  book@agency.fr  ·  agency.fr");
  });

  test("an agency with nothing on file yields no line", () => {
    expect(buildAgencyContactLine({ name: "Nameless" })).toBe("");
    expect(buildAgencyContactLine(null)).toBe("");
  });
});

describe("the booking block a represented model actually gets", () => {
  const PROFILE = {
    city: "Paris",
    instagram_handle: "ana",
    phone: "+33 6 12 34 56 78",
  };

  test("represented ⇒ agency name and agency contact, never the model's phone", () => {
    const booking = buildBookingBlock(PROFILE, {
      name: "Icon Management",
      contactLine: "New York  ·  bookings@iconmgmt.com",
    });
    expect(booking.mode).toBe("represented");
    expect(booking.label).toBe("Representation");
    expect(booking.primary).toBe("Icon Management");
    expect(booking.line).toBe("New York  ·  bookings@iconmgmt.com");
    expect(`${booking.primary} ${booking.line}`).not.toContain(PROFILE.phone);
  });

  test("an external agency with no contact still never surfaces the phone", () => {
    const booking = buildBookingBlock(PROFILE, {
      name: "Mother Management",
      contactLine: "",
    });
    expect(booking.primary).toBe("Mother Management");
    expect(booking.line).toBe("Paris  ·  @ana");
    expect(booking.line).not.toContain("+33");
  });

  test("a bare agency name (legacy callers) behaves the same way", () => {
    const booking = buildBookingBlock(PROFILE, "Icon Management");
    expect(booking.mode).toBe("represented");
    expect(booking.line).not.toContain(PROFILE.phone);
  });

  test("genuinely unrepresented talent keeps its direct booking line", () => {
    const booking = buildBookingBlock(PROFILE, null);
    expect(booking.mode).toBe("direct");
    expect(booking.label).toBe("Direct Bookings");
    expect(booking.primary).toBe(PROFILE.phone);
  });

  test("a kids card is still guardian contact, never a booking identity", () => {
    const booking = buildBookingBlock(PROFILE, null, { kids: true });
    expect(booking.label).toBe("Guardian Contact");
  });
});
