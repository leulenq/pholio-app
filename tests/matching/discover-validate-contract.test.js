"use strict";

/**
 * WS4.4 / WS8 golden set — drives validateContract over the golden fixtures,
 * asserting intended-vs-parsed outcomes (not just internal consistency).
 */

const fs = require("fs");
const path = require("path");
const {
  validateContract,
} = require("../../src/domains/agency/services/discover/validate-contract");

const FIX_DIR = path.join(__dirname, "..", "fixtures", "discover-golden");
const fixtures = fs
  .readdirSync(FIX_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf8")));

function nc(out) {
  return out.needs_confirmation_fields.map((x) => x.field).sort();
}

describe("golden fixtures load", () => {
  test("at least 15 fixtures present", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });
});

describe.each(fixtures.map((fx) => [fx.name, fx]))("%s", (_name, fx) => {
  const now = new Date(`${fx.now}T00:00:00.000Z`);
  let out;
  beforeAll(() => {
    out = validateContract(fx.llm, { now });
  });

  test("matches expected canonical outcome", () => {
    const e = fx.expect;
    const role = out.contract.roles[0];

    if (e.roles_length != null) {
      expect(out.contract.roles.length).toBe(e.roles_length);
    }
    if (e.multi_role != null) expect(out.multi_role).toBe(e.multi_role);
    if (e.credential_gate != null) {
      expect(out.contract.credential_gate).toBe(e.credential_gate);
    }
    if (e.counts) {
      expect(out.contract.roles.map((r) => r.count)).toEqual(e.counts);
    }
    if (e.height_value != null) {
      expect(role.hard.height_cm.value).toBe(e.height_value);
    }
    if (e.visible_tattoos != null) {
      expect(role.hard.visible_tattoos).toBe(e.visible_tattoos);
    }
    if (e.hair_color) expect(role.hard.hair_color).toEqual(e.hair_color);
    if (e.heritage) expect(role.hard.heritage).toEqual(e.heritage);
    if (e.heritage_null) expect(role.hard.heritage).toBeNull();
    if (e.eye_color) expect(role.hard.eye_color).toEqual(e.eye_color);
    if (e.boards) expect(role.hard.boards).toEqual(e.boards);
    if (e.union) expect(role.hard.union).toBe(e.union);
    if (e.experience_level) {
      expect(role.hard.experience_level).toBe(e.experience_level);
    }
    if (e.representation_status) {
      expect(role.hard.representation_status).toEqual(e.representation_status);
    }
    if (e.all_hard_null) {
      expect(Object.values(role.hard).every((v) => v === null)).toBe(true);
    }
    if (e.needs_confirmation) {
      expect(nc(out)).toEqual([...e.needs_confirmation].sort());
    }
    if (e.set_aside) {
      expect(out.contract.set_aside).toEqual(e.set_aside);
    }
    if (e.set_aside_contains) {
      const texts = out.contract.set_aside.map((s) => s.text.toLowerCase());
      for (const t of e.set_aside_contains) {
        expect(texts).toContain(t.toLowerCase());
      }
      // every set_aside carries the required reason
      for (const s of out.contract.set_aside) {
        expect(s.reason).toBe("not_used_for_filtering");
      }
    }
    if (e.soft_query_excludes) {
      const lower = role.soft_query.toLowerCase();
      for (const t of e.soft_query_excludes) {
        expect(lower.includes(t.toLowerCase())).toBe(false);
      }
    }
    if (e.dropped_contains) {
      const values = out.dropped.map((d) => String(d.value));
      for (const v of e.dropped_contains) expect(values).toContain(v);
    }
  });
});

describe("no applied constraint violates its own re-parse (Layer-1 invariant)", () => {
  test.each(fixtures.map((fx) => [fx.name, fx]))("%s", (_n, fx) => {
    const now = new Date(`${fx.now}T00:00:00.000Z`);
    const out = validateContract(fx.llm, { now });
    // Any constraint that carries needs_confirmation:true must be listed in the
    // report (so the engine knows never to apply it).
    const reported = new Set(out.needs_confirmation_fields.map((x) => x.field));
    for (const [ri, role] of out.contract.roles.entries()) {
      for (const [field, val] of Object.entries(role.hard)) {
        if (val && typeof val === "object" && val.needs_confirmation === true) {
          expect(reported.has(field)).toBe(true);
        }
      }
      // eslint-disable-next-line no-unused-vars
      void ri;
    }
  });
});

describe("heritage is a filter; skin tone is not", () => {
  test("heritage words in free text become hard.heritage, skin tone is set aside", () => {
    const out = validateContract(
      {
        roles: [
          {
            label: "role 1",
            count: 1,
            hard: {},
            soft_query: "asian editorial dark-skinned striking",
          },
        ],
        set_aside: [],
        unparsed_remainder: "",
      },
      { now: new Date() },
    );

    expect(out.contract.roles[0].hard.heritage).toEqual([
      "east_asian",
      "south_asian",
      "southeast_asian",
    ]);
    const texts = out.contract.set_aside.map((s) => s.text.toLowerCase());
    expect(texts).toContain("dark-skinned");
    expect(texts).not.toContain("asian");
    const soft = out.contract.roles[0].soft_query.toLowerCase();
    expect(soft).not.toContain("asian");
    expect(soft).not.toContain("dark-skinned");
    expect(soft).toContain("editorial");
  });

  test("a heritage the model already placed is kept as-is", () => {
    const out = validateContract(
      {
        roles: [
          {
            label: "role 1",
            count: 1,
            hard: { heritage: ["Black_African_Descent"] },
            soft_query: "editorial",
          },
        ],
        set_aside: [],
        unparsed_remainder: "",
      },
      { now: new Date() },
    );
    expect(out.contract.roles[0].hard.heritage).toEqual([
      "black_african_descent",
    ]);
  });

  test("hair/eye colour collisions are NOT read as heritage", () => {
    const out = validateContract(
      {
        roles: [
          {
            label: "role 1",
            count: 1,
            hard: {},
            soft_query: "black hair, blonde highlights",
          },
        ],
        set_aside: [],
        unparsed_remainder: "",
      },
      { now: new Date() },
    );
    expect(out.contract.roles[0].hard.heritage).toBeNull();
    expect(out.contract.set_aside).toEqual([]);
    expect(out.contract.roles[0].soft_query.toLowerCase()).toContain("black hair");
  });

  test("an out-of-vocabulary heritage is dropped, never guessed", () => {
    const out = validateContract(
      {
        roles: [
          { label: "role 1", count: 1, hard: { heritage: ["martian"] }, soft_query: "" },
        ],
        set_aside: [],
        unparsed_remainder: "",
      },
      { now: new Date() },
    );
    expect(out.contract.roles[0].hard.heritage).toBeNull();
    expect(out.dropped.map((d) => d.value)).toContain("martian");
  });
});
