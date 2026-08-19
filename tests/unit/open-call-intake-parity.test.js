"use strict";

/**
 * Server/client parity for the open-call intake vocabulary.
 *
 * `client/src/shared/constants/openCallIntake.js` is a hand-mirrored ESM
 * copy of `src/shared/constants/open-call-intake.js` (design §3.1's closed
 * vocabulary). A divergence between the two is not cosmetic — it is a field
 * the applicant sees on the apply form that the server does not expect, or
 * a default spec the server enforces that the client never renders.
 *
 * Mirrors the compile-and-require mechanism in `tests/talent/event-intake.js`
 * (see `loadBrowserMirror`): esbuild bundles the browser ESM module to CJS
 * so jest can require it and diff it against the server module directly,
 * instead of eyeballing two files.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");

const server = require("../../src/shared/constants/open-call-intake");

function loadBrowserMirror() {
  const entry = path.resolve(
    __dirname,
    "../../client/src/shared/constants/openCallIntake.js",
  );
  const outfile = path.join(
    os.tmpdir(),
    `open-call-intake-mirror.${Date.now()}.cjs`,
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

describe("open-call intake vocabulary — server/client parity", () => {
  const client = loadBrowserMirror();

  test("enum objects and value arrays are byte-identical", () => {
    expect(client.INTAKE_STAGES).toEqual(server.INTAKE_STAGES);
    expect(client.INTAKE_STAGE_VALUES).toEqual(server.INTAKE_STAGE_VALUES);
    expect(client.INTAKE_REQUIREMENTS).toEqual(server.INTAKE_REQUIREMENTS);
    expect(client.INTAKE_REQUIREMENT_VALUES).toEqual(server.INTAKE_REQUIREMENT_VALUES);
    expect(client.IDENTITY_POLICIES).toEqual(server.IDENTITY_POLICIES);
    expect(client.IDENTITY_POLICY_VALUES).toEqual(server.IDENTITY_POLICY_VALUES);
    expect(client.DEFAULT_IDENTITY_POLICY).toBe(server.DEFAULT_IDENTITY_POLICY);
  });

  test("INTAKE_FIELDS and MEDIA_FIELD_KEYS are byte-identical", () => {
    expect(client.INTAKE_FIELDS).toEqual(server.INTAKE_FIELDS);
    expect(client.INTAKE_FIELD_KEYS).toEqual(server.INTAKE_FIELD_KEYS);
    expect(client.MEDIA_FIELD_KEYS).toEqual(server.MEDIA_FIELD_KEYS);
  });

  test("both default specs are byte-identical, in order", () => {
    expect(client.DEFAULT_EVENT_INTAKE_SPEC).toEqual(server.DEFAULT_EVENT_INTAKE_SPEC);
    expect(client.DEFAULT_REPRESENTATION_INTAKE_SPEC).toEqual(
      server.DEFAULT_REPRESENTATION_INTAKE_SPEC,
    );
  });

  test("CUSTOM_QUESTION_LIMITS is byte-identical", () => {
    expect(client.CUSTOM_QUESTION_LIMITS).toEqual(server.CUSTOM_QUESTION_LIMITS);
  });

  test("applyStageFields/shortlistStageFields agree on the event default", () => {
    expect(client.applyStageFields(server.DEFAULT_EVENT_INTAKE_SPEC)).toEqual(
      server.applyStageFields(server.DEFAULT_EVENT_INTAKE_SPEC),
    );
    expect(client.shortlistStageFields(server.DEFAULT_EVENT_INTAKE_SPEC)).toEqual(
      server.shortlistStageFields(server.DEFAULT_EVENT_INTAKE_SPEC),
    );
  });
});
