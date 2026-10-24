const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Render the real components with native primitives/hooks replaced locally.
// This checks role/layout scope, not device rendering or network behavior.
const native = Object.fromEntries(["View", "Text", "ScrollView", "Pressable", "TextInput"].map(name => [name,
  ({ children }) => React.createElement("div", { "data-native": name }, children),
]));
native.StyleSheet = { create: value => value, hairlineWidth: 1 };
const theme = {
  colors: { primary: "green", mutedText: "gray", border: "gray", background: "white", text: "black" },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 6, md: 8 },
  layout: { webSidebarWidth: 248 },
};
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "../..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === "react-native") return native;
      if (name === "../theme/theme") return theme;
      if (name === "../theme/adminTypography") return load("theme/adminTypography.ts");
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return module.exports;
}
/** The real nav module, so the destinations the shells show are the real ones. */
function navModule(role) {
  const tab = role === "admin" ? "AdminDashboard" : role === "provider" ? "ProviderHome" : "CustomerHome";
  const Icon = () => null;
  return load("navigation/desktopNav.tsx", {
    "@react-navigation/native": {
      useNavigation: () => ({ navigate() {} }),
      useNavigationState: callback => callback({ index: 0, routes: [{ name: "Main", state: { index: 0, routes: [{ name: tab }] } }] }),
    },
    "../context/AuthContext": { useAuth: () => ({ user: { role } }) },
    "../context/ProviderProfileGateContext": { useProviderProfileGate: () => ({ isProviderProfileRequired: false }) },
    "../context/RealtimeContext": { useRealtime: () => ({ chatUnreadCount: 0, notificationUnreadCount: 0 }) },
    "../api/customer": { getCustomerBookings: async () => ({ items: [] }) },
    "../features/current-job/current-job": {
      pickCurrentJob: () => ({ id: 1, title: "Ceiling light install", statusLabel: "Visit fee due", amountDue: 150, needsCustomer: true }),
    },
    "./tabIcons": { tabIcons: Object.fromEntries(["home", "schedule", "bookings", "chats", "aiChat", "account"].map(name => [name, Icon])) },
  });
}
const shellMocks = role => ({
  "../components/BrandMark": { BrandMark: () => React.createElement("svg", null) },
  "../components/PersonAvatar": { PersonAvatar: () => React.createElement("img", null) },
  "../utils/money": { formatMoney: value => `${value} TRY` },
  "../components/NotificationsButton": { NotificationsButton: () => React.createElement("button", null, "Notifications") },
  "./AdminMenu": { AdminMenu: () => React.createElement("nav", null, "Admin menu") },
  "./desktopNav": navModule(role),
});
function sidebar(role) {
  const { DesktopSidebar } = load("navigation/DesktopSidebar.tsx", shellMocks(role));
  return renderToStaticMarkup(React.createElement(DesktopSidebar));
}
function topBar(role) {
  const { DesktopTopBar } = load("navigation/DesktopTopBar.tsx", shellMocks(role));
  return renderToStaticMarkup(React.createElement(DesktopTopBar));
}
for (const [role, labels] of [
  ["customer", ["Home", "Chats", "AI Chat", "Bookings", "Account"]],
  ["provider", ["Home", "Schedule", "Bookings", "Chats", "Account"]],
]) {
  test(`${role} retains its original View container and navigation, without Admin`, () => {
    const html = sidebar(role);
    assert.doesNotMatch(html, /ScrollView|Admin menu/);
    labels.forEach(label => assert.ok(html.includes(`>${label}<`), label));
  });
}
test("the top bar carries the same destinations, with Account as the avatar", () => {
  for (const [role, labels] of [
    ["customer", ["Home", "Chats", "AI Chat", "Bookings"]],
    ["provider", ["Home", "Schedule", "Bookings", "Chats"]],
  ]) {
    const html = topBar(role);
    assert.doesNotMatch(html, /Admin menu/);
    labels.forEach(label => assert.ok(html.includes(`>${label}<`), `${role}: ${label}`));
    assert.doesNotMatch(html, />Account</, `${role}: Account is the avatar, not a nav row`);
  }
});
test("only Admin gets the scrollable menu", () => {
  const html = sidebar("admin");
  assert.match(html, /data-native="ScrollView"/);
  assert.match(html, /Admin menu/);
  assert.match(html, />Account</);
});
test("shared settlement card keeps legacy layout unless adminLayout is explicitly enabled", () => {
  const { MarketplaceBreakdownCard } = load("components/MarketplaceBreakdownCard.tsx", {
    react: { ...React, useState: () => [true, () => {}] },
    "../utils/money": { formatMoney: value => `${value} TRY` },
    "../utils/marketplace": { getMarketplaceBreakdown: () => ({ total: 100, estimatedProviderIncome: 80, providerShare: 90, platformCommission: 10, iyzicoFee: 5, taxAmount: 5 }) },
  });
  const render = props => renderToStaticMarkup(React.createElement(MarketplaceBreakdownCard, props));
  const original = render({ amount: 100 });
  assert.equal(original, render({ amount: 100, adminLayout: false }));
  assert.ok(original.indexOf("Total deductions") < original.indexOf("Expected provider income"));
  assert.match(original, /Provider share/);
  const admin = render({ amount: 100, adminLayout: true });
  assert.ok(admin.indexOf("Expected provider income") < admin.indexOf("Total deductions"));
  assert.doesNotMatch(admin, /Provider share/);
  const titleStyle = props => {
    const title = MarketplaceBreakdownCard({ amount: 100, ...props }).props.children[0];
    return Object.assign({}, ...title.props.style.filter(Boolean));
  };
  const compactTitle = titleStyle({});
  const adminTitle = titleStyle({ adminLayout: true });
  assert.ok(compactTitle.fontSize < adminTitle.fontSize, "other roles keep the smaller compact split title");
  assert.equal(compactTitle.fontWeight, "800", "and carry it on weight rather than size");
  assert.equal(adminTitle.fontSize, 16, "only Admin opts into its card hierarchy");
  assert.equal(adminTitle.fontWeight, "700");
});
test("shared TextField leaves old callers unchanged and only forwards an opt-in submit callback", () => {
  const { TextField } = load("components/TextField.tsx");
  const input = props => TextField({ label: "Test", value: "", onChangeText() {}, ...props }).props.children.find(child => child?.type === native.TextInput);
  assert.equal(input({}).props.onSubmitEditing, undefined);
  let submitted = false;
  input({ onSubmitEditing: () => { submitted = true; } }).props.onSubmitEditing();
  assert.equal(submitted, true);
});
