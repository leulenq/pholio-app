"use strict";

const {
  NOTIFY_STATUSES,
  applicationStatusCopy,
} = require("../../src/shared/services/notifications");

describe("application status notification contract", () => {
  test("represented notifies with completed-agreement copy", () => {
    expect(NOTIFY_STATUSES.has("represented")).toBe(true);
    expect(applicationStatusCopy("represented", "North Star Models")).toEqual({
      title: "Representation confirmed",
      body: "North Star Models marked your representation agreement complete.",
    });
  });

  test("legacy booked is not an application notification status", () => {
    expect(NOTIFY_STATUSES.has("booked")).toBe(false);
  });
});
