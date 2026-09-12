import assert from "node:assert/strict";
import test from "node:test";

import {
  countActiveSearchFilters,
  createDefaultSearchFilters,
  getSearchFilterValidationError,
  parseOptionalNonNegativeNumber,
} from "../search-filter-state.ts";

test("default search filters have no active refinements", () => {
  const filters = createDefaultSearchFilters();

  assert.deepEqual(filters, {
    category: null,
    maxDistanceKm: null,
    minPrice: "",
    maxPrice: "",
    minRating: null,
    openNowOnly: false,
    sort: "recommended",
  });
  assert.equal(countActiveSearchFilters(filters), 0);
});

test("active filter count treats price range and sort as separate controls", () => {
  const filters = {
    ...createDefaultSearchFilters(),
    category: "plumbing",
    minPrice: "50",
    maxPrice: "150",
    openNowOnly: true,
    sort: "nearest",
  };

  assert.equal(countActiveSearchFilters(filters), 4);
});

test("optional numeric values reject negative and invalid input", () => {
  assert.equal(parseOptionalNonNegativeNumber(""), undefined);
  assert.equal(parseOptionalNonNegativeNumber(" 12.5 "), 12.5);
  assert.equal(parseOptionalNonNegativeNumber("-1"), undefined);
  assert.equal(parseOptionalNonNegativeNumber("abc"), undefined);
});

test("price validation rejects malformed and reversed ranges", () => {
  assert.equal(
    getSearchFilterValidationError({
      ...createDefaultSearchFilters(),
      minPrice: "free",
    }),
    "Enter a valid hourly price.",
  );
  assert.equal(
    getSearchFilterValidationError({
      ...createDefaultSearchFilters(),
      minPrice: "200",
      maxPrice: "100",
    }),
    "Minimum price cannot exceed maximum price.",
  );
  assert.equal(
    getSearchFilterValidationError({
      ...createDefaultSearchFilters(),
      minPrice: "50",
      maxPrice: "100",
    }),
    null,
  );
});
