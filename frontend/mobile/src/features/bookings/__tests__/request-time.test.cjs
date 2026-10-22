const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isBookingTimeRangeValid,
  isProviderUnavailableMessage,
  syncEndTimeAfterStartChange,
} = require("../../../../.test-build/features/bookings/request-time.js");

test("moving start past end moves end to the same time", () => {
  const end = "2026-10-22T12:00:00";
  assert.equal(syncEndTimeAfterStartChange("2026-10-22T13:00:00", end), "2026-10-22T13:00:00");
  assert.equal(syncEndTimeAfterStartChange("2026-10-22T11:00:00", end), end);
});

test("an equal end time is visible but cannot be submitted", () => {
  assert.equal(isBookingTimeRangeValid("2026-10-22T13:00:00", "2026-10-22T13:00:00"), false);
  assert.equal(isBookingTimeRangeValid("2026-10-22T13:00:00", "2026-10-22T14:00:00"), true);
});

test("only provider availability conflicts move below the end time", () => {
  assert.equal(isProviderUnavailableMessage("Provider is unavailable on 2026-10-22; cannot create booking"), true);
  assert.equal(isProviderUnavailableMessage("Service address is missing"), false);
});
