"use strict";

const {
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
  WRITABLE_APPLICATION_STATUSES,
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
} = require("../../src/shared/constants/application-status");
const {
  mapApplicationStatusToCastingStage,
  mapCastingStageToApplicationStatus,
} = require("../../src/domains/agency/routes/casting-stage-helpers");

describe("canonical application representation statuses", () => {
  test("accepted is an offer and represented is the completed agreement", () => {
    expect(OFFERED_APPLICATION_STATUSES).toEqual(["accepted"]);
    expect(REPRESENTED_APPLICATION_STATUSES).toEqual(["represented"]);
    expect(isOfferedApplicationStatus("accepted")).toBe(true);
    expect(isRepresentedApplicationStatus("represented")).toBe(true);
    expect(isRepresentedApplicationStatus("accepted")).toBe(false);
  });

  test("booked cannot be written as an application status", () => {
    expect(WRITABLE_APPLICATION_STATUSES).toContain("accepted");
    expect(WRITABLE_APPLICATION_STATUSES).toContain("represented");
    expect(WRITABLE_APPLICATION_STATUSES).not.toContain("booked");
  });

  test("casting stages preserve the offer-to-agreement boundary", () => {
    expect(mapApplicationStatusToCastingStage("accepted")).toBe("Offered");
    expect(mapApplicationStatusToCastingStage("represented")).toBe("Represented");
    expect(mapCastingStageToApplicationStatus("Offered")).toBe("accepted");
    expect(mapCastingStageToApplicationStatus("Represented")).toBe("represented");
  });
});
