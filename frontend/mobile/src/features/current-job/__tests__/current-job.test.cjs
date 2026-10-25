const assert = require("node:assert/strict");
const { test } = require("node:test");
const { findCurrentJob, pickCurrentJob } = require("../../../../.test-build/features/current-job/current-job.js");

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

test("awaiting payment is an actionable current job", () => {
  const job = pickCurrentJob([booking(1, "awaiting_payment")]);
  assert.equal(job.id, 1);
  assert.equal(job.statusLabel, "Awaiting payment");
  assert.equal(job.needsCustomer, true);
});

test("an actionable booking after the first page is still found", async () => {
  const calls = [];
  const job = await findCurrentJob(async (page, pageSize) => {
    calls.push([page, pageSize]);
    return page === 1
      ? { items: Array.from({ length: 100 }, (_, index) => booking(index + 1, "completed")), has_next: true }
      : { items: [booking(101, "awaiting_visit_payment")], has_next: false };
  });
  assert.equal(job.id, 101);
  assert.deepEqual(calls, [[1, 100], [2, 100]]);
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
