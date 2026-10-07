const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getBookingHelpLinks,
  isPaymentFailed,
} = require("../../../.test-build/utils/bookingHelp.js");

const none = {
  paymentFailed: false,
  canCancelAfterVisit: false,
  canRequestRefund: false,
  canAppealRefund: false,
  canConfirmComplete: false,
};

test("no decision in front of the customer means no help links", () => {
  assert.deepEqual(getBookingHelpLinks(none), []);
});

test("each decision links its own answer", () => {
  assert.deepEqual(
    getBookingHelpLinks({ ...none, paymentFailed: true, canAppealRefund: true }).map(
      (link) => link.faqId,
    ),
    ["CUST-PAY-007", "CUST-REF-007"],
  );
  assert.deepEqual(
    getBookingHelpLinks({ ...none, canCancelAfterVisit: true, canRequestRefund: true }).map(
      (link) => link.faqId,
    ),
    ["CUST-REF-003", "CUST-REF-005"],
  );
});

test("a payment counts as failed by status or by a failure note", () => {
  assert.equal(isPaymentFailed("capture_failed", null), true);
  assert.equal(isPaymentFailed("checkout_created", "Card declined"), true);
  assert.equal(isPaymentFailed("checkout_created", null), false);
  assert.equal(isPaymentFailed(undefined, undefined), false);
});
