"use strict";

/**
 * WS4.1 CI gate — the roles contract schema must be Groq strict-mode legal:
 * every object node requires every property, closes additionalProperties, and
 * expresses optionality only through nullable type unions (no dynamic maps).
 */

const {
  CONTRACT_SCHEMA,
  HARD_NODE,
  HARD_FIELD_NAMES,
  emptyHard,
  emptyContract,
  emptyRole,
} = require("../../src/domains/agency/services/discover/contract-schema");
const wl = require("../../src/domains/agency/services/discover/field-whitelist");

// Walks the schema asserting strict-mode legality (mirrors the check in
// query-understanding-strict.test.js, extended for nullable object unions).
function assertStrictLegal(node, path = "schema") {
  if (!node || typeof node !== "object") return;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes("object")) {
    expect({ path, additionalProperties: node.additionalProperties }).toEqual({
      path,
      additionalProperties: false,
    });
    const keys = Object.keys(node.properties || {}).sort();
    expect({ path, required: [...(node.required || [])].sort() }).toEqual({
      path,
      required: keys,
    });
    for (const [key, child] of Object.entries(node.properties || {})) {
      assertStrictLegal(child, `${path}.${key}`);
    }
  }
  if (types.includes("array") && node.items) {
    assertStrictLegal(node.items, `${path}[]`);
  }
}

// Assert no property is optional-by-omission and there are no free-form maps.
function assertNoDynamicMaps(node, path = "schema") {
  if (!node || typeof node !== "object") return;
  if (node.patternProperties) {
    throw new Error(`dynamic map (patternProperties) at ${path}`);
  }
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes("object")) {
    // additionalProperties must be exactly false, never a schema (open map).
    expect(node.additionalProperties).toBe(false);
    for (const [key, child] of Object.entries(node.properties || {})) {
      assertNoDynamicMaps(child, `${path}.${key}`);
    }
  }
  if (types.includes("array") && node.items) {
    assertNoDynamicMaps(node.items, `${path}[]`);
  }
}

describe("CONTRACT_SCHEMA (Groq strict mode)", () => {
  test("is a strict json_schema envelope", () => {
    expect(CONTRACT_SCHEMA.name).toBe("discover_roles_contract");
    expect(CONTRACT_SCHEMA.strict).toBe(true);
    expect(CONTRACT_SCHEMA.schema).toBeDefined();
  });

  test("every object node is strict-legal (all required, closed)", () => {
    assertStrictLegal(CONTRACT_SCHEMA.schema);
  });

  test("no dynamic-key maps anywhere", () => {
    assertNoDynamicMaps(CONTRACT_SCHEMA.schema);
  });

  test("top-level shape matches spec §4", () => {
    const props = CONTRACT_SCHEMA.schema.properties;
    expect(Object.keys(props).sort()).toEqual([
      "roles",
      "set_aside",
      "unparsed_remainder",
    ]);
    const role = props.roles.items.properties;
    expect(Object.keys(role).sort()).toEqual([
      "count",
      "hard",
      "label",
      "soft_query",
    ]);
    const setAside = props.set_aside.items.properties;
    expect(Object.keys(setAside).sort()).toEqual(["reason", "text"]);
  });

  test("confidence is a fixed field inside constraint objects (not a map)", () => {
    const h = HARD_NODE.properties.height_cm;
    expect(h.type).toEqual(["object", "null"]);
    expect(Object.keys(h.properties).sort()).toEqual([
      "a",
      "b",
      "confidence",
      "span",
      "op",
    ].sort());
  });
});

describe("enum vocabularies come from the whitelist (single source of truth)", () => {
  test("gender/hair/eye/boards/markets enums match field-whitelist", () => {
    const hard = HARD_NODE.properties;
    expect(hard.gender_presentation.items.enum).toEqual(wl.GENDER_PRESENTATION);
    expect(hard.hair_color.items.enum).toEqual(wl.HAIR_COLOR);
    expect(hard.eye_color.items.enum).toEqual(wl.EYE_COLOR);
    expect(hard.boards.items.enum).toEqual(wl.BOARDS);
    expect(hard.representation_status.items.enum).toEqual(
      wl.REPRESENTATION_STATUS,
    );
    // nullable string enums include null as a closed member
    expect(hard.union.enum).toEqual([...wl.UNION, null]);
    expect(hard.location.properties.market.enum).toEqual([...wl.MARKETS, null]);
  });

  test("operators enum matches whitelist", () => {
    expect(HARD_NODE.properties.height_cm.properties.op.enum).toEqual(
      wl.CONSTRAINT_OPS,
    );
  });
});

describe("canonical empty values", () => {
  test("emptyHard has exactly the schema hard keys, all null", () => {
    const hard = emptyHard();
    expect(Object.keys(hard).sort()).toEqual([...HARD_FIELD_NAMES].sort());
    expect(Object.values(hard).every((v) => v === null)).toBe(true);
  });

  test("emptyContract is a valid empty shell", () => {
    expect(emptyContract()).toEqual({
      roles: [],
      set_aside: [],
      unparsed_remainder: "",
    });
  });

  test("emptyRole has a full hard block", () => {
    const role = emptyRole();
    expect(role.count).toBe(1);
    expect(Object.keys(role.hard).sort()).toEqual([...HARD_FIELD_NAMES].sort());
  });
});
