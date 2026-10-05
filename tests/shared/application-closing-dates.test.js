const { closingDates } = require("../../src/shared/lib/application-auto-close");

const DAY = 24 * 60 * 60 * 1000;
const anchor = "2026-10-01T12:00:00.000Z";

describe("closingDates", () => {
  test("awaiting-agency rows close one review window after they last moved", () => {
    const { reviewClosesAt, offerClosesAt } = closingDates({
      status: "submitted",
      status_changed_at: anchor,
      application_review_window_days: 21,
    });
    expect(reviewClosesAt.toISOString()).toBe(
      new Date(Date.parse(anchor) + 21 * DAY).toISOString(),
    );
    expect(offerClosesAt).toBeNull();
  });

  test("a null agency window reads as the 30-day default, a call window wins", () => {
    expect(
      closingDates({ status: "pending", created_at: anchor }).reviewClosesAt.toISOString(),
    ).toBe(new Date(Date.parse(anchor) + 30 * DAY).toISOString());
    expect(
      closingDates({
        status: "shortlisted",
        status_changed_at: anchor,
        application_review_window_days: 30,
        call_review_window_days: 7,
      }).reviewClosesAt.toISOString(),
    ).toBe(new Date(Date.parse(anchor) + 7 * DAY).toISOString());
  });

  test("a disabled window promises no date", () => {
    expect(
      closingDates({
        status: "submitted",
        status_changed_at: anchor,
        application_review_window_days: 0,
      }).reviewClosesAt,
    ).toBeNull();
  });

  test("statuses the job never closes carry no date", () => {
    for (const status of ["requested_more", "meeting_requested", "kept_on_file", "passed"]) {
      const dates = closingDates({ status, status_changed_at: anchor });
      expect(dates).toEqual({ reviewClosesAt: null, offerClosesAt: null });
    }
  });

  test("only an event slot offer has an answer-by time", () => {
    const event = closingDates({
      status: "accepted",
      call_purpose: "event_casting",
      status_changed_at: anchor,
      offer_response_window_hours: 48,
    });
    expect(event.offerClosesAt.toISOString()).toBe(
      new Date(Date.parse(anchor) + 48 * 60 * 60 * 1000).toISOString(),
    );
    expect(
      closingDates({ status: "accepted", status_changed_at: anchor }).offerClosesAt,
    ).toBeNull();
  });
});
