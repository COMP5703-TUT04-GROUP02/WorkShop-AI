const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const native = Object.fromEntries(["View", "Text", "ScrollView", "Pressable", "Modal", "ActivityIndicator"].map(name => [name,
  ({ children }) => React.createElement("div", { "data-native": name }, children),
]));
native.StyleSheet = { create: value => value };
const theme = { colors: { primary: "#10A37F", surface: "#F7F7F8", mutedText: "#6E6E80", danger: "#D92D20" }, radius: { md: 8 }, spacing: { xs: 4, sm: 8, md: 16, lg: 24 } };
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, "..", file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name in mocks) return mocks[name];
    if (name === "react-native") return native;
    if (name === "../../theme/theme") return theme;
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "../../utils/datetime") return load("../../utils/datetime.ts");
    if (name === "../../utils/money") return { formatMoney: value => value == null ? "—" : `${Number(value).toFixed(2)} TRY` };
    if (name === "../../constants/labels") return load("../../constants/labels.ts");
    if (name === "./bookingPresentation") return load("bookingPresentation.ts");
    if (name === "lucide-react-native") return { X: () => null, ChevronDown: () => null, ChevronRight: () => null };
    if (name.startsWith("../../components/")) return { [name.split("/").at(-1)]: () => null };
    throw new Error(`Unexpected dependency: ${name}`);
  } }, { filename });
  return module.exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const booking = id => ({ id, title: `Booking ${id}`, customer_id: 2, provider_profile_id: 3, status: "pending", total_amount: 100 });
const result = items => ({ items, total: 2, total_pages: 2 });
const tick = () => new Promise(resolve => setImmediate(resolve));

// Exercise the actual screen's callbacks/state with local hook/native substitutes.
// This is not a native-device renderer; browser interaction is verified separately.
function harness(api) {
  const states = []; const callbacks = []; let index = 0; let focus, lastFocus, cleanup, tree;
  const useState = initial => {
    const slot = index++;
    if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
    return [states[slot], value => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
  };
  const { AdminBookingsScreen } = load("AdminBookingsScreen.tsx", {
    react: { ...React, useState, useRef: value => { const [ref] = useState({ current: value }); return ref; },
      useCallback: (fn, deps) => {
        const slot = index++; const old = callbacks[slot];
        if (!old || deps.some((dep, i) => dep !== old.deps[i])) callbacks[slot] = { fn, deps };
        return callbacks[slot].fn;
      } },
    "@react-navigation/native": { useFocusEffect: fn => { focus = fn; } },
    "../../api/admin": api,
    "../../utils/errors": { getErrorMessage: error => error.message },
    "../../utils/latestRequest": load("../../utils/latestRequest.ts"),
    "./adminState": load("adminState.ts"),
    "./AdminBookingDetailModal": { AdminBookingDetailModal: () => null },
  });
  const render = () => { index = 0; tree = AdminBookingsScreen(); if (focus !== lastFocus) { cleanup?.(); lastFocus = focus; cleanup = focus(); } return tree; };
  const find = predicate => nodes(tree).find(node => predicate(node.props ?? {}))?.props;
  render();
  return { render, find, dispose: () => cleanup?.() };
}

test("screen submits combined exact IDs, rejects invalid input, and resets paging on a new search", async () => {
  const calls = [];
  const h = harness({ getAdminBookings: async (...args) => { calls.push(args); return result([booking(1)]); } });
  await tick(); h.render();
  h.find(p => p.label === "Next").onPress(); h.render(); await tick(); h.render();
  assert.equal(calls.at(-1)[0], 2);
  for (const [label, value] of [["Booking ID", "#1"], ["Customer user ID", "2"], ["Provider profile ID", "3"]]) {
    h.find(p => p.label === label).onChangeText(value); h.render();
  }
  h.find(p => p.label === "Search").onPress(); h.render(); await tick(); h.render();
  assert.equal(calls.at(-1)[0], 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1)[2])), { bookingId: 1, customerId: 2, providerProfileId: 3 });
  const count = calls.length;
  h.find(p => p.label === "Booking ID").onChangeText("-1"); h.render();
  h.find(p => p.label === "Search").onPress(); h.render();
  assert.equal(calls.length, count);
  assert.match(h.find(p => p.label === "Booking ID").error, /positive/);
  h.find(p => p.label === "Clear search").onPress(); h.render(); await tick(); h.render();
  assert.equal(Object.keys(calls.at(-1)[2]).length, 0);
  h.dispose();
});

test("unsent IDs do not change the last submitted query or its valid in-flight result", async () => {
  let finish;
  const h = harness({ getAdminBookings: () => new Promise(resolve => { finish = resolve; }) });
  h.find(p => p.label === "Booking ID").onChangeText("2"); h.render();
  finish(result([booking(1)])); await tick(); h.render();
  assert.ok(h.find(p => p.accessibilityLabel === "View booking #1 details"));
  assert.ok(h.find(p => p.children === "ID changes not applied. Search to update."));
  h.dispose();
});

test("closing or switching details invalidates late responses; errors can retry without stale details", async () => {
  const pending = [];
  const h = harness({ getAdminBookings: async () => result([booking(1), booking(2)]),
    getAdminBooking: id => new Promise((resolve, reject) => pending.push({ id, resolve, reject })) });
  await tick(); h.render();
  const modal = () => h.find(p => p.bookingId != null && p.onClose);
  h.find(p => p.accessibilityLabel === "View booking #1 details").onPress(); h.render();
  modal().onClose(); h.render();
  h.find(p => p.accessibilityLabel === "View booking #2 details").onPress(); h.render();
  pending[0].resolve(booking(1)); await tick(); h.render();
  assert.equal(modal().bookingId, 2); assert.equal(modal().booking, null);
  pending[1].reject(Error("Not found")); await tick(); h.render();
  assert.equal(modal().error, "Not found");
  modal().onRetry(); h.render();
  pending[2].resolve(booking(2)); await tick(); h.render();
  assert.equal(modal().booking.id, 2);
  modal().onClose(); h.render(); assert.equal(modal(), undefined);
  h.dispose();
});

test("detail panel renders all business sections without decision/payment/edit actions", () => {
  const { AdminBookingDetailModal, bookingValue } = load("AdminBookingDetailModal.tsx", { "lucide-react-native": { X: () => null } });
  const data = { ...booking(1), customer: { name: "Customer", email: "test@example.test" }, provider: null,
    quote_revisions: [{ id: 1, quote_amount: 12, decline_reason: "Declined" }], payments: [], refund_requests: [], attachments: [],
    status_history: [], complaints: [], reviews: [], complaint_summary: { open_complaint_count: 0, total_complaint_count: 0 } };
  const html = renderToStaticMarkup(React.createElement(AdminBookingDetailModal, { bookingId: 1, booking: data, onClose() {} }));
  for (const section of ["Service and location", "Schedule and lifecycle", "Pricing and current quote", "Customer and provider", "Quote revisions", "Payments", "Refund requests", "Attachments", "Status history", "Complaints", "Review"]) assert.ok(html.includes(section), section);
  assert.match(html, /Declined/);
  assert.doesNotMatch(html, />Approve<|>Reject<|>Pay<|>Save<|>Retry settlement</);
  assert.doesNotMatch(html, /Read-only booking details/);
  assert.equal(bookingValue("visit_fee_amount", 0), "0.00 TRY");
  assert.equal(bookingValue("onboarding_paused", false), "No");
  assert.equal(bookingValue("final_quote_amount", null), "—");
});

test("status selection immediately uses submitted IDs, not unsent/invalid draft IDs; Search intersects and Clear resets", async () => {
  const calls = [];
  const h = harness({ getAdminBookings: async (...args) => { calls.push(args); return result([booking(1)]); } });
  await tick(); h.render();
  h.find(p => p.label === "Customer user ID").onChangeText("2"); h.render();
  h.find(p => p.label === "Search").onPress(); h.render(); await tick(); h.render();
  h.find(p => p.label === "Customer user ID").onChangeText("invalid"); h.render();
  h.find(p => p.accessibilityLabel === "Booking status filter").onPress(); h.render();
  h.find(p => p.accessibilityLabel === "Filter bookings: Completed").onPress(); h.render(); await tick(); h.render();
  assert.equal(calls.at(-1)[0], 1);
  assert.equal(calls.at(-1)[2].customerId, 2);
  assert.equal(calls.at(-1)[2].status, "completed");
  h.find(p => p.label === "Customer user ID").onChangeText("7"); h.render();
  h.find(p => p.label === "Search").onPress(); h.render(); await tick(); h.render();
  assert.equal(calls.at(-1)[2].customerId, 7);
  assert.equal(calls.at(-1)[2].status, "completed");
  h.find(p => p.accessibilityLabel === "Booking status filter").onPress(); h.render();
  h.find(p => p.accessibilityLabel === "Filter bookings: All statuses").onPress(); h.render(); await tick(); h.render();
  assert.equal(calls.at(-1)[2].status, undefined);
  assert.equal(calls.at(-1)[2].customerId, 7);
  h.find(p => p.label === "Clear search").onPress(); h.render(); await tick(); h.render();
  assert.equal(Object.keys(calls.at(-1)[2]).length, 0);
  h.dispose();
});

test("a late earlier-status response cannot replace the current filter results", async () => {
  const pending = [];
  const h = harness({ getAdminBookings: () => new Promise(resolve => pending.push(resolve)) });
  h.find(p => p.accessibilityLabel === "Booking status filter").onPress(); h.render();
  h.find(p => p.accessibilityLabel === "Filter bookings: Completed").onPress(); h.render();
  pending[1](result([booking(2)])); await tick(); h.render();
  pending[0](result([booking(1)])); await tick(); h.render();
  assert.ok(h.find(p => p.accessibilityLabel === "View booking #2 details"));
  assert.equal(h.find(p => p.accessibilityLabel === "View booking #1 details"), undefined);
  h.dispose();
});

test("all 22 backend statuses have distinct exact filter values, with disambiguated Closed labels", () => {
  const { BOOKING_STATUS_OPTIONS, bookingStatusStyle } = load("bookingPresentation.ts");
  assert.equal(BOOKING_STATUS_OPTIONS.length, 22);
  assert.equal(new Set(BOOKING_STATUS_OPTIONS.map(option => option.value)).size, 22);
  assert.equal(new Set(BOOKING_STATUS_OPTIONS.map(option => option.label)).size, 22);
  assert.equal(bookingStatusStyle("completed").color, theme.colors.primary);
  assert.equal(bookingStatusStyle("cancelled").color, theme.colors.mutedText);
  assert.equal(bookingStatusStyle("pending").color, "#C2410C");
  assert.equal(bookingStatusStyle("quoted").color, "#3730A3");
  assert.equal(bookingStatusStyle("provider_no_show").color, theme.colors.danger);
});

test("all dossier timestamps use English dates, preserve missing values, and do not follow browser locale", () => {
  const { formatBookingDateTime } = load("bookingPresentation.ts");
  const { bookingValue } = load("AdminBookingDetailModal.tsx");
  for (const key of ["created_at", "booking_at", "scheduled_start_time", "scheduled_end_time", "onboarding_paused_at", "changed_at", "paid_at", "blockage_resolved_at"]) {
    const output = bookingValue(key, "2026-10-16T07:30:00Z");
    assert.match(output, /16 Oct 2026/);
    assert.doesNotMatch(output, /[\u4e00-\u9fff]/);
    assert.equal(output, formatBookingDateTime("2026-10-16T07:30:00Z"));
  }
  assert.equal(formatBookingDateTime(null), "—");
  assert.equal(formatBookingDateTime("not-a-date"), "—");
});

test("Admin booking API forwards status together with exact IDs and paging", async () => {
  let request;
  const api = load("../../api/admin.ts", { "./client": { apiClient: { get: async (...args) => { request = args; return { data: { data: {} } }; } } } });
  await api.getAdminBookings(2, 20, { status: "cancelled", bookingId: 10, customerId: 2, providerProfileId: 3 });
  assert.equal(request[0], "/admin/bookings");
  assert.deepEqual(JSON.parse(JSON.stringify(request[1].params)), { page: 2, page_size: 20, status: "cancelled", booking_id: 10, customer_id: 2, provider_profile_id: 3 });
});
