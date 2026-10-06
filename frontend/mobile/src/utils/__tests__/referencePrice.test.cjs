const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildReferencePricePresentation,
  shouldShowCustomerReferencePrice,
} = require("../../../.test-build/utils/referencePrice.js");

const history = {
  has_history: true,
  minimum: 900,
  maximum: 1100,
  currency: "TRY",
  sample_count: 3,
};

const noHistory = {
  has_history: false,
  minimum: null,
  maximum: null,
  currency: "TRY",
  sample_count: 0,
};

test("provider receives a non-binding recommendation presentation", () => {
  assert.deepEqual(buildReferencePricePresentation(history, "provider"), {
    label: "Recommended price range",
    value: "₺900–₺1,100",
  });
});

test("provider receives no invented value without history", () => {
  assert.deepEqual(buildReferencePricePresentation(noHistory, "provider"), {
    label: "Recommended price range",
    value: null,
  });
});

test("customer receives the fixed historical reference presentation", () => {
  assert.deepEqual(buildReferencePricePresentation(history, "customer"), {
    label: "Typical range for similar jobs",
    value: "₺900–₺1,100",
  });
});

test("customer receives the fixed no-history fallback", () => {
  assert.deepEqual(buildReferencePricePresentation(noHistory, "customer"), {
    label: "Typical range for similar jobs",
    value: "No historical data for similar jobs",
  });
});

test("presentation never returns input or validation behavior", () => {
  const presentation = buildReferencePricePresentation(history, "provider");
  assert.deepEqual(Object.keys(presentation).sort(), ["label", "value"]);
  assert.equal("inputValue" in presentation, false);
  assert.equal("validation" in presentation, false);
});

test("customer reference is limited to visible initial and final quotes", () => {
  assert.equal(shouldShowCustomerReferencePrice("quoted"), true);
  assert.equal(shouldShowCustomerReferencePrice("final_quote_sent"), true);
  assert.equal(shouldShowCustomerReferencePrice("pending"), false);
});
