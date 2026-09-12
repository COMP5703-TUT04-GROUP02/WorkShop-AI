import assert from "node:assert/strict";
import test from "node:test";

import {
  formatProviderDistance,
  getProviderCardImageUrl,
  getProviderCardStatus,
  getProviderCategoryLabel,
} from "../provider-card-display.ts";

test("provider card prefers the account avatar over portfolio media", () => {
  assert.equal(
    getProviderCardImageUrl({
      avatarUrl: "/uploads/avatar.png",
      portfolioImageUrl: "/uploads/work.png",
    }),
    "/uploads/avatar.png",
  );
});

test("provider card falls back to portfolio media while avatar is unavailable", () => {
  assert.equal(
    getProviderCardImageUrl({
      avatarUrl: null,
      portfolioImageUrl: "/uploads/work.png",
    }),
    "/uploads/work.png",
  );
});

test("provider card uses opening state when the search API supplies it", () => {
  assert.deepEqual(getProviderCardStatus({ isOpen: false, isOnline: true }), {
    label: "Closed",
    tone: "inactive",
  });
});

test("provider card preserves explicitly labelled presence before WS-77 lands", () => {
  assert.deepEqual(getProviderCardStatus({ isOnline: true }), {
    label: "Online",
    tone: "active",
  });
});

test("provider card formats distance and the primary category for display", () => {
  assert.equal(formatProviderDistance(2.46), "2.5 km away");
  assert.equal(formatProviderDistance(null), null);
  assert.equal(getProviderCategoryLabel(["elderly_care", "cleaning"]), "Elderly care");
  assert.equal(getProviderCategoryLabel([]), "Other");
});
