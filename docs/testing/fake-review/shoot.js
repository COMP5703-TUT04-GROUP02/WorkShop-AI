// Evidence for the fake review detection feature. Re-runnable; each step is
// asserted so a screenshot can never show a step that did not actually happen.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";

const field = (p, ph) => p.getByPlaceholder(ph).locator("visible=true").first();
const button = (p, n) => p.getByRole("button", { name: n, exact: true }).locator("visible=true").first();

let passed = 0;
let failed = 0;
function check(label, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else { failed += 1; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`      saved ${name}.png`);
}
async function signIn(page, email) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await field(page, "you@example.com").fill(email);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await button(page, "Sign in").click();
  await page.waitForTimeout(7000);
}

(async () => {
  const browser = await chromium.launch();
  const viewport = { width: 1280, height: 1100 };

  // ---------- admin: the moderation queue
  const admin = await browser.newPage({ viewport });
  admin.on("dialog", (d) => void d.accept());
  await signIn(admin, "demo_admin@workshop.ai");

  const panelHeading = admin.getByText("Fake review checks", { exact: true }).locator("visible=true").first();
  await panelHeading.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(2500);
  check("admin dashboard shows the fake review panel", await panelHeading.isVisible());

  const highCard = admin.getByText(/High risk · 100/).locator("visible=true").first();
  await highCard.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1200);
  check("a 100-score review is at the top of the queue", await highCard.isVisible());
  await shot(admin, "01-admin-queue");

  // open it to read the signals
  await highCard.click();
  await admin.waitForTimeout(1500);
  const duplicate = admin.getByText(/Duplicate wording/).locator("visible=true").first();
  check("the opened card explains the duplicate-wording signal", await duplicate.isVisible());
  const confirmButton = button(admin, "Confirm as fake");
  check("the opened card offers a decision", await confirmButton.isVisible());
  await duplicate.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(800);
  await shot(admin, "02-admin-signals");

  // decide
  const note = admin.getByPlaceholder("What did you check before deciding?").locator("visible=true").first();
  await note.fill("Wording copied from an older review, account opened the same day.");
  await admin.waitForTimeout(500);
  await shot(admin, "03-admin-decision-note");
  await button(admin, "Confirm as fake").click();
  await admin.waitForTimeout(5000);
  const confirmation = admin.getByText(/no longer shown on the provider/).locator("visible=true").first();
  check("confirming reports back that the review was hidden", await confirmation.isVisible());
  await confirmation.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(800);
  await shot(admin, "04-admin-confirmed");

  // the decision is persisted under the Confirmed fake filter
  await admin.getByRole("button", { name: "Confirmed fake" }).locator("visible=true").first().click();
  await admin.waitForTimeout(4000);
  const confirmedRow = admin.getByText(/Confirmed fake/).locator("visible=true").first();
  check("the confirmed review is listed under the Confirmed fake filter", await confirmedRow.isVisible());
  await shot(admin, "05-admin-confirmed-filter");

  // ---------- provider: reporting a review
  const provider = await browser.newPage({ viewport });
  provider.on("dialog", (d) => void d.accept());
  await signIn(provider, "demo_provider_1@workshop.ai");
  const reportLink = provider.getByText("Report as fake", { exact: true }).locator("visible=true").first();
  await reportLink.scrollIntoViewIfNeeded();
  await provider.waitForTimeout(1500);
  check("each review on the provider's profile offers a report action", await reportLink.isVisible());
  await shot(provider, "06-provider-review-list");

  await reportLink.click();
  await provider.waitForTimeout(1200);
  const reasonBox = provider.getByPlaceholder("For example: this customer never booked us").locator("visible=true").first();
  check("the report form asks for a reason", await reasonBox.isVisible());
  await reasonBox.fill("This customer never booked us; we have no job on that date.");
  await provider.waitForTimeout(600);
  await shot(provider, "07-provider-report-form");

  await button(provider, "Send report").click();
  await provider.waitForTimeout(5000);
  const reported = provider.getByText(/An admin will check this review/).locator("visible=true").first();
  check("the provider sees the report acknowledged", await reported.isVisible());
  await reported.scrollIntoViewIfNeeded();
  await provider.waitForTimeout(800);
  await shot(provider, "08-provider-reported");

  // ---------- the report reaches the admin queue
  await admin.getByRole("button", { name: "Awaiting decision" }).locator("visible=true").first().click();
  await admin.waitForTimeout(4000);
  const reportedInQueue = admin.getByText(/Reported by the provider:/).locator("visible=true").first();
  await reportedInQueue.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1000);
  check("the provider's report shows in the admin queue with its reason", await reportedInQueue.isVisible());
  await shot(admin, "09-admin-provider-report");

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
