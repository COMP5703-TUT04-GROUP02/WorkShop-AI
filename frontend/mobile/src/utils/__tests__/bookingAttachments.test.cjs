const test = require("node:test");
const assert = require("node:assert/strict");
const { getBookingAttachmentSections } = require("../../../.test-build/utils/bookingAttachments.js");

test("groups same-uploader and same-name files by server purpose, preserving every file", () => {
  const attachments = [
    { id: 1, purpose: "customer_attachment", uploaded_by_user_id: 10, original_file_name: "photo.png" },
    { id: 2, purpose: "arrival_evidence", uploaded_by_user_id: 20, original_file_name: "photo.png" },
    { id: 3, purpose: "completion_proof", uploaded_by_user_id: 20, original_file_name: "photo.png" },
    { id: 4, purpose: "customer_attachment", uploaded_by_user_id: 10, original_file_name: "extra.pdf" },
  ];
  const sections = getBookingAttachmentSections(attachments);
  assert.deepEqual(sections.map(({ title }) => title), [
    "Customer attachments", "Arrival evidence", "Completion proof",
  ]);
  assert.deepEqual(sections.map(({ attachments }) => attachments.map(({ id }) => id)), [
    [1, 4], [2], [3],
  ]);
  assert.equal(attachments.length, 4);
});

test("missing attachments produce empty sections without requiring provider profile or status", () => {
  assert.deepEqual(getBookingAttachmentSections().map(({ attachments }) => attachments), [[], [], []]);
});
