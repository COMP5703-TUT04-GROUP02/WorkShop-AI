const assert = require("node:assert/strict");
const test = require("node:test");

const {
  filterFaq,
  findFaqItem,
} = require("../../../../.test-build/features/help/faq-filter.js");

const categories = [
  {
    title: "Account and profile",
    items: [
      {
        id: "CUST-ACC-003",
        question: "How do I change my password?",
        answer: "Open Account and Security.",
      },
    ],
  },
  {
    title: "Cancellations and refunds",
    items: [
      {
        id: "CUST-REF-003",
        question: "Does cancelling a booking automatically refund my payment?",
        answer: "No. Refunds use a separate request.",
      },
      {
        id: "CUST-REF-009",
        question: "How long does a refund take?",
        answer: "Workshop AI does not currently promise a refund processing time.",
      },
    ],
  },
];

test("an empty search with no category keeps everything", () => {
  assert.deepEqual(filterFaq(categories, "  ", null), categories);
});

test("search matches every word, case-insensitively, across question and answer", () => {
  const result = filterFaq(categories, "Refund  SEPARATE", null);

  assert.deepEqual(
    result.map((category) => category.items.map((item) => item.id)),
    [["CUST-REF-003"]],
  );
});

test("category and search combine, and empty categories are dropped", () => {
  assert.deepEqual(filterFaq(categories, "password", "Cancellations and refunds"), []);
  assert.deepEqual(
    filterFaq(categories, "", "Account and profile").map((category) => category.title),
    ["Account and profile"],
  );
});

test("finds an entry by id", () => {
  assert.equal(findFaqItem(categories, "CUST-REF-009").question, "How long does a refund take?");
  assert.equal(findFaqItem(categories, "CUST-NOPE-001"), null);
});

test("Turkish search respects dotted and dotless I", () => {
  const translated = [{ title: "İadeler", items: [{ id: "CUST-REF-001", question: "İade nasıl istenir?", answer: "İade talebi oluşturun." }] }];
  assert.equal(filterFaq(translated, "İADE", null, "tr")[0].items[0].id, "CUST-REF-001");
});
