// Captures the screens WS-105 is accepted on.
//
// WS-104 is not merged, so the backend for this run came from the branch
// jdai0870/WS-104-two-step-provider-review in a local worktree. The frontend is
// this branch. Both are stated in the README.
//
// Three providers stand for the three states:
//   demo_provider_2   identity pending      — nothing unlocked
//   demo_provider_3   identity approved     — qualification can be applied for
//   demo_provider_16  both approved         — everything unlocked
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";
const ACCOUNT_TAB = /^Account/;

const CASES = [
  { email: "demo_provider_2@workshop.ai", shot: "01-identity-pending" },
  { email: "demo_provider_3@workshop.ai", shot: "02-identity-approved" },
  { email: "demo_provider_16@workshop.ai", shot: "03-both-approved" },
];

const visible = (page, text) =>
  page.getByText(text, { exact: true }).locator("visible=true").first();
const field = (page, placeholder) =>
  page.getByPlaceholder(placeholder).locator("visible=true").first();

let failures = 0;
function check(ok, pass, fail) {
  console.log(ok ? `PASS: ${pass}` : `FAIL: ${fail}`);
  if (!ok) failures += 1;
}
async function isShown(page, text) {
  return visible(page, text).isVisible().catch(() => false);
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

async function signIn(page, email) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await field(page, "you@example.com").fill(email);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch();
  const viewport = { width: 1100, height: 950 };

  // --- 1. Identity still under review: nothing is unlocked.
  const pendingPage = await browser.newPage({ viewport });
  await signIn(pendingPage, CASES[0].email);
  check(
    await isShown(pendingPage, "Verification"),
    "Provider Home shows the verification card",
    "the verification card is missing",
  );
  check(
    await isShown(pendingPage, "Submit your real name and contact details for review."),
    "identity is the first step and is actionable",
    "the identity step is not offered",
  );
  check(
    await isShown(pendingPage, "Available once your identity is approved."),
    "qualification waits for identity",
    "qualification was offered before identity approval",
  );
  await shot(pendingPage, CASES[0].shot);

  // The old gate opened as soon as the profile form was filled in. This
  // provider has a complete profile, so the tab must still be locked.
  await pendingPage
    .getByRole("button", { name: /^Schedule/ })
    .locator("visible=true")
    .first()
    .click();
  await pendingPage.waitForTimeout(1500);
  check(
    await isShown(pendingPage, "Verification required"),
    "a complete profile no longer unlocks the tabs",
    "the tab opened without an approved qualification",
  );
  await shot(pendingPage, "04-tab-locked");
  await pendingPage.close();

  // --- 2. Identity approved: qualification becomes actionable.
  const identityPage = await browser.newPage({ viewport });
  await signIn(identityPage, CASES[1].email);
  check(
    await isShown(identityPage, "Your identity has been approved."),
    "an approved identity is shown as approved",
    "the approved identity is not reflected",
  );
  check(
    await isShown(identityPage, "Apply for qualification"),
    "qualification can be applied for once identity is approved",
    "the qualification entry did not appear",
  );
  await shot(identityPage, CASES[1].shot);
  await identityPage.close();

  // --- 3. Qualification approved: everything is unlocked.
  const approvedPage = await browser.newPage({ viewport });
  await signIn(approvedPage, CASES[2].email);
  check(
    await isShown(
      approvedPage,
      "Approved. You appear in listings and can accept bookings.",
    ),
    "an approved qualification says the account is live",
    "the approved state is not reflected",
  );
  await approvedPage
    .getByRole("button", { name: /^Schedule/ })
    .locator("visible=true")
    .first()
    .click();
  await approvedPage.waitForTimeout(2000);
  check(
    !(await isShown(approvedPage, "Verification required")),
    "an approved provider reaches the Schedule tab",
    "an approved provider was blocked",
  );
  await shot(approvedPage, CASES[2].shot);
  await approvedPage.close();

  await browser.close();
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
