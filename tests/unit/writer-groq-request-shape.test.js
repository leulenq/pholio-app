"use strict";

/**
 * Every talent writer must reach Groq through writer-shared/groq-client with
 * the CONFIGURED text model and a completion budget that survives the reasoning
 * pass. These assert the outbound request, not the output handling — each
 * writer keeps its own stripping/validation layer, covered by its own suite.
 *
 * Only the first request per writer is inspected, so a validation retry or a
 * rejection after the call is irrelevant here.
 */

const config = require("../../src/config");
const {
  __setGroqClient,
} = require("../../src/domains/talent/services/writer-shared/groq-client");
const {
  REASONING_MIN_COMPLETION_TOKENS,
} = require("../../src/shared/lib/groq-text-model");

const {
  generateBio,
} = require("../../src/domains/talent/services/bio-writer/bio-writer");
const {
  buildBioContext,
} = require("../../src/domains/talent/services/bio-writer/context-builder");
const {
  draftNote,
} = require("../../src/domains/talent/services/submission-note-writer/note-writer");
const {
  buildSubmissionContext,
} = require("../../src/domains/talent/services/submission-note-writer/context-builder");
const {
  formatTrainingSummary,
} = require("../../src/domains/talent/services/training-summary-writer/summary-writer");
const {
  buildTrainingSummaryContext,
} = require("../../src/domains/talent/services/training-summary-writer/context-builder");
const {
  polishMessage,
} = require("../../src/domains/talent/services/message-polish/polish-writer");

const PROFILE = {
  first_name: "Maya",
  last_name: "Chen",
  city: "Toronto",
  country: "Canada",
  modeling_categories: JSON.stringify(["Editorial", "Runway"]),
  training: "Barbizon NYC · Runway Intensive · 2022",
  experience_details: JSON.stringify([
    { title: "Sable Journal", role: "Editorial", year: "2024" },
  ]),
};

/** Run a writer against a mock client and return its first request payload. */
async function captureRequest(run) {
  const create = jest.fn(async () => ({
    choices: [{ message: { content: "Maya Chen is a Toronto-based model." } }],
  }));
  __setGroqClient({ chat: { completions: { create } } });
  await Promise.resolve(run()).catch(() => {});
  expect(create).toHaveBeenCalled();
  return create.mock.calls[0][0];
}

describe("talent writers → Groq request shape", () => {
  let warn;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    __setGroqClient(null);
  });

  const cases = [
    [
      "bio writer",
      () => generateBio({ context: buildBioContext(PROFILE) }),
    ],
    [
      "submission-note writer",
      () =>
        draftNote({
          context: buildSubmissionContext(PROFILE, {
            agencyName: "Northbound Management",
          }),
        }),
    ],
    [
      "training-summary writer",
      () =>
        formatTrainingSummary({
          context: buildTrainingSummaryContext(PROFILE),
          text: PROFILE.training,
        }),
    ],
    [
      "message polish",
      () =>
        polishMessage({
          message: "hi im maya i want to join your agency thanks",
          agencyName: "Northbound Management",
        }),
    ],
  ];

  test.each(cases)("%s sends the configured text model", async (_name, run) => {
    const req = await captureRequest(run);
    expect(req.model).toBe(config.groq.textModel);
    for (const id of config.groq.deprecatedTextModels) {
      expect(req.model).not.toBe(id);
    }
  });

  test.each(cases)(
    "%s budgets past the reasoning pass at the configured effort",
    async (_name, run) => {
      const req = await captureRequest(run);
      // The default text model is reasoning-class: an answer-sized budget
      // (100-600) comes back empty, so every writer must clear the floor.
      expect(req.max_completion_tokens).toBeGreaterThanOrEqual(
        REASONING_MIN_COMPLETION_TOKENS,
      );
      expect(req.reasoning_effort).toBe(config.groq.textReasoningEffort);
    },
  );
});
