const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mergeOpenBooking,
  refreshOpenBooking,
} = require("../../../../.test-build/features/bookings/open-booking.js");

const range = { has_history: true, minimum: 182, maximum: 222, currency: "TRY", sample_count: 4 };

test("an open booking takes the refreshed status from the list", () => {
  const open = { id: 308, status: "awaiting_visit_payment", reference_price_range: range };
  const list = [
    { id: 307, status: "cancelled" },
    { id: 308, status: "visit_paid" },
  ];

  assert.deepEqual(refreshOpenBooking(open, list), {
    id: 308,
    status: "visit_paid",
    reference_price_range: range,
  });
});

test("a booking missing from the list stays as it was", () => {
  const open = { id: 308, status: "awaiting_visit_payment" };

  assert.equal(refreshOpenBooking(open, [{ id: 307, status: "cancelled" }]), open);
});

test("nothing open stays closed", () => {
  assert.equal(refreshOpenBooking(null, [{ id: 308, status: "visit_paid" }]), null);
});

test("a newer price range replaces the old one", () => {
  const newer = { ...range, maximum: 240 };

  assert.equal(
    mergeOpenBooking({ id: 308, reference_price_range: range }, { id: 308, reference_price_range: newer })
      .reference_price_range,
    newer,
  );
});
