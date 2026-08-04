"use strict";

const mockEnqueuePitsJob = jest.fn();
const mockEnqueueMattePrecompute = jest.fn();
const mockRunImageClassification = jest.fn();

jest.mock("../../src/domains/talent/services/pits-queue", () => ({
  enqueuePitsJob: mockEnqueuePitsJob,
}));
jest.mock("../../src/domains/talent/services/matte-precompute", () => ({
  enqueueMattePrecompute: mockEnqueueMattePrecompute,
}));
jest.mock("../../src/domains/talent/services/run-image-classification", () => ({
  runImageClassification: mockRunImageClassification,
  imageAiProcessingAllowed: (profile, env = process.env) =>
    env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true" &&
    profile?.ai_processing_consent === true &&
    Boolean(profile?.date_of_birth),
}));

const {
  buildInitialUploadMetadata,
  classificationStatusFromMetadata,
  scheduleImageClassification,
} = require("../../src/domains/talent/routes/media").__testables;

describe("image upload background scheduling", () => {
  beforeEach(() => {
    mockEnqueuePitsJob.mockReset();
    mockEnqueueMattePrecompute.mockReset();
    mockRunImageClassification.mockReset();
  });

  test("opted-out upload metadata is not left pending", () => {
    const metadata = buildInitialUploadMetadata(
      { width: 1200, height: 1600 },
      { classificationPending: false },
    );

    expect(metadata.ai.classification).toMatchObject({
      band: "disabled",
      source: "disabled",
      reason: "image_processing_disabled",
    });
    expect(classificationStatusFromMetadata(metadata)).toBe("not_requested");
  });

  test("opted-out uploads skip PITS while still scheduling the local matte", async () => {
    await scheduleImageClassification(
      {
        id: "profile-1",
        date_of_birth: "1990-06-01",
        ai_processing_consent: false,
      },
      "image-1",
    );

    expect(mockEnqueuePitsJob).not.toHaveBeenCalled();
    expect(mockEnqueueMattePrecompute).toHaveBeenCalledWith(
      expect.any(Function),
      "image-1",
    );
  });

  test("local matte scheduling is independent of classification failure", async () => {
    mockEnqueuePitsJob.mockRejectedValueOnce(new Error("provider unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const classification = scheduleImageClassification(
        {
          id: "profile-1",
          date_of_birth: "1990-06-01",
          ai_processing_consent: true,
        },
        "image-1",
      );
      expect(mockEnqueueMattePrecompute).toHaveBeenCalledWith(
        expect.any(Function),
        "image-1",
      );
      await classification;
      expect(mockEnqueueMattePrecompute).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
