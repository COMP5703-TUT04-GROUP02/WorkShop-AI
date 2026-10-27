const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canCustomerCancelAfterVisit,
  canCustomerRequestRefund,
  getCustomerBookingListAction,
  isLatestBookingRefresh,
  shouldShowBookingInChat,
  withBookingPayment,
  withBookingPreview,
} = require("../../../.test-build/utils/bookingActions.js");

test("awaiting confirmation offers refund without cancel and remains in Chat", () => {
  const booking = {
    status: "awaiting_confirmation",
    current_refund_request: null,
  };
  const payment = { status: "paid" };

  assert.equal(canCustomerCancelAfterVisit(booking.status, payment), false);
  assert.equal(canCustomerRequestRefund(booking, payment), true);
  assert.equal(shouldShowBookingInChat(booking.status), true);
});

test("a customer-confirmed booking no longer appears as the active Chat booking", () => {
  assert.equal(shouldShowBookingInChat("completed"), false);
});

test("an active visit remains visible in Chat and supports the existing actions", () => {
  const booking = {
    status: "provider_arrived",
    current_refund_request: null,
  };
  const payment = { status: "paid" };

  assert.equal(canCustomerCancelAfterVisit(booking.status, payment), true);
  assert.equal(canCustomerRequestRefund(booking, payment), true);
  assert.equal(shouldShowBookingInChat(booking.status), true);
});

test("accepting the initial quote immediately changes the chat action to pay", () => {
  const current = { 302: { id: 302, status: "quoted" } };
  const next = withBookingPreview(current, {
    id: 302,
    status: "awaiting_visit_payment",
  });

  assert.equal(getCustomerBookingListAction(next[302], null), "pay");
  assert.equal(current[302].status, "quoted");
});

test("accepting the final quote immediately changes the chat action to service payment", () => {
  const current = { 302: { id: 302, status: "final_quote_sent" } };
  const next = withBookingPreview(current, {
    id: 302,
    status: "awaiting_service_payment",
  });

  assert.equal(getCustomerBookingListAction(next[302], null), "pay");
});

test("payment cache replaces or removes only the target booking", () => {
  const firstPayment = { id: 11, booking_id: 301, status: "paid" };
  const replacement = { id: 12, booking_id: 302, status: "checkout_created" };
  const current = { 301: firstPayment };

  const withPayment = withBookingPayment(current, 302, replacement);
  const withoutPayment = withBookingPayment(withPayment, 302, null);

  assert.equal(withPayment[301], firstPayment);
  assert.equal(withPayment[302], replacement);
  assert.equal(withoutPayment[301], firstPayment);
  assert.equal(withoutPayment[302], undefined);
});

test("an older booking refresh cannot overwrite a newer response", () => {
  assert.equal(isLatestBookingRefresh(4, 4), true);
  assert.equal(isLatestBookingRefresh(5, 4), false);
});
