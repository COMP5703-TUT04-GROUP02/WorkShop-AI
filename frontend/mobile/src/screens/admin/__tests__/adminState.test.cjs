const assert = require("node:assert/strict");
const test = require("node:test");
const { parseAdminId, retainSelectedIds, groupApplications, applySelectedReviews, payoutFiltersForStatus, isAdminIdPending } = require("../../../../.test-build/screens/admin/adminState.js");

test("payout status changes immediately use only the already submitted provider ID", () => {
  const applied = {providerProfileId: 3, status: "rejected"};
  assert.deepEqual(payoutFiltersForStatus(applied, "active"), {providerProfileId: 3, status: "active"});
  assert.deepEqual(applied, {providerProfileId: 3, status: "rejected"});
  assert.deepEqual(payoutFiltersForStatus({}, "draft"), {providerProfileId: undefined, status: "draft"});
});
test("all payout statuses removes only the status, not the submitted provider ID", () => {
  assert.deepEqual(payoutFiltersForStatus({providerProfileId: 3}, ""), {providerProfileId: 3, status: undefined});
  assert.deepEqual(payoutFiltersForStatus({}, ""), {providerProfileId: undefined, status: undefined});
});
test("unsent provider edits are detected without applying them or treating # as different", () => {
  assert.equal(isAdminIdPending("#3", 3), false);
  assert.equal(isAdminIdPending(" 3 ", 3), false);
  assert.equal(isAdminIdPending("", undefined), false);
  assert.equal(isAdminIdPending("2", 3), true);
  assert.equal(isAdminIdPending("", 3), true);
  assert.equal(isAdminIdPending("bad", 3), true);
});

test("ID search accepts optional # and blank, rejects partial/unsafe identifiers", () => {
  assert.equal(parseAdminId(" #42 "), 42);
  assert.equal(parseAdminId("42"), 42);
  assert.equal(parseAdminId(" "), undefined);
  for (const id of ["0", "-1", "2.5", "12abc", "1e2", "#", "9007199254740992"]) assert.throws(() => parseAdminId(id));
});
test("group by applicant without merging identity and service decision targets", () => {
  const identity = {kind: "identity", item: {user_id: 11, id: 1}};
  const service = {kind: "qualification", item: {user_id: 11, id: 1}};
  const single = {kind: "identity", item: {user_id: 12, id: 2}};
  assert.deepEqual(groupApplications([identity, service, single]), [[11, [identity, service]], [12, [single]]]);
});
test("refresh retains still-valid selections instead of clearing the other panel", () => {
  assert.deepEqual(retainSelectedIds([2, 4], [1, 2, 4, 5]), [2, 4]);
  assert.deepEqual(retainSelectedIds([2, 4], [4]), [4]);
});
test("only selected IDs are submitted once; partial failures stay distinguishable", async () => {
  const called = [];
  const result = await applySelectedReviews([2, 4, 2], async (id) => {
    called.push(id); if (id === 4) throw new Error("Permission changed");
  });
  assert.deepEqual(called, [2, 4]);
  assert.deepEqual(result, {succeeded: [2], failed: [{id: 4, message: "Permission changed"}]});
});
test("no checked rows means no write requests", async () => {
  assert.deepEqual(await applySelectedReviews([], () => { throw new Error("must not call"); }), {succeeded: [], failed: []});
});
