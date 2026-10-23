const assert = require("node:assert/strict");
const { test } = require("node:test");
const { pickCurrentJob } = require("../../../../.test-build/features/current-job/current-job.js");

const booking = (id, status, extra = {}) => ({
  id,
  title: `Job ${id}`,
  status,
  total_amount: 1350,
  visit_fee_amount: 150,
  ...extra,
});

test("nothing to show when no booking is live", () => {
  assert.equal(pickCurrentJob([]), null);
  assert.equal(pickCurrentJob([booking(1, "completed"), booking(2, "cancelled")]), null);
});

test("a booking waiting on the customer beats one waiting on the provider", () => {
  const job = pickCurrentJob([booking(1, "visit_paid"), booking(2, "awaiting_visit_payment")]);
  assert.equal(job.id, 2);
  assert.equal(job.needsCustomer, true);
});

test("the most urgent customer action wins", () => {
  const job = pickCurrentJob([booking(1, "quoted"), booking(2, "awaiting_visit_payment")]);
  assert.equal(job.id, 2);
});

test("a running booking still shows when nothing needs the customer", () => {
  const job = pickCurrentJob([booking(7, "provider_arrived")]);
  assert.equal(job.id, 7);
  assert.equal(job.needsCustomer, false);
  assert.equal(job.amountDue, null);
});

test("the amount due follows the stage of the payment", () => {
  assert.equal(pickCurrentJob([booking(1, "awaiting_visit_payment")]).amountDue, 150);
  assert.equal(pickCurrentJob([booking(2, "awaiting_service_payment")]).amountDue, 1350);
  assert.equal(pickCurrentJob([booking(3, "final_quote_sent")]).amountDue, null);
});

test("the label comes from the shared status labels", () => {
  assert.equal(pickCurrentJob([booking(1, "awaiting_visit_payment")]).statusLabel, "Visit fee due");
});

test("an unknown status is ignored rather than guessed at", () => {
  assert.equal(pickCurrentJob([booking(1, "something_new")]), null);
});
