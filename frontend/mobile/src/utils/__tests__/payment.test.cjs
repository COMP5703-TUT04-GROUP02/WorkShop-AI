const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getPaymentAction,
  getPaymentStatusTone,
  indexLatestPayments,
  shouldRotatePaymentIdempotencyKey,
} = require("../../../.test-build/utils/payment.js");

test("payment action continues a valid checkout and does not pay after authorization", () => {
  assert.equal(
    getPaymentAction("awaiting_payment", { status: "checkout_created" }),
    "continue",
  );
  assert.equal(
    getPaymentAction("awaiting_payment", { status: "processing" }),
    "processing",
  );
  assert.equal(getPaymentAction("accepted", { status: "authorized" }), null);
});

test("payment status tones distinguish capture failure from successful lifecycle states", () => {
  assert.equal(getPaymentStatusTone("authorized"), "success");
  assert.equal(getPaymentStatusTone("paid"), "success");
  assert.equal(getPaymentStatusTone("capture_failed"), "danger");
  assert.equal(getPaymentStatusTone("partially_refunded"), "muted");
  assert.equal(getPaymentStatusTone("voided"), "muted");
});

test("only a failed payment rotates the booking idempotency key", () => {
  assert.equal(shouldRotatePaymentIdempotencyKey({ status: "failed" }), true);
  assert.equal(shouldRotatePaymentIdempotencyKey({ status: "checkout_created" }), false);
  assert.equal(shouldRotatePaymentIdempotencyKey({ status: "authorized" }), false);
});

test("payment lookup keeps the newest attempt for a booking", () => {
  const indexed = indexLatestPayments([
    {
      id: 1,
      booking_id: 301,
      created_at: "2026-09-28T10:00:00Z",
      status: "voided",
    },
    {
      id: 2,
      booking_id: 301,
      created_at: "2026-09-28T10:01:00Z",
      status: "paid",
    },
  ]);

  assert.equal(indexed[301].id, 2);
  assert.equal(indexed[301].status, "paid");
});
