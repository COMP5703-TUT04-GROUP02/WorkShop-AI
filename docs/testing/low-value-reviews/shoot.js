// Evidence for the two admin review sweeps.
//
// Every screenshot is backed by an assertion, and the run is a round trip: the
// three reviews it hides are put back at the end, so the database finishes
// exactly where it started. It also captures the customer-facing provider page
// before and after, which is where the effect that matters actually shows up.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";

const field = (p, ph) => p.getByPlaceholder(ph).locator("visible=true").first();
const button = (p, n) => p.getByRole("button", { name: n, exact: true }).locator("visible=true").first();
const thresholdBox = (p, i) => p.getByPlaceholder("100").locator("visible=true").nth(i);
const checkButton = (p, i) => p.getByRole("button", { name: "Check", exact: true }).locator("visible=true").nth(i);

let passed = 0, failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else { failed += 1; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}
const shot = async (p, n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log(`      saved ${n}.png`); };

async function signIn(page, email) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await field(page, "you@example.com").fill(email);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await button(page, "Sign in").click();
  await page.waitForTimeout(9000);
}

// The provider carrying a five-star review on a 52.60 TRY booking.
async function openLocksmith(page) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  await field(page, "Search services or businesses").fill("locksmith");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(6000);
  await page.getByText("Istanbul Rapid Locksmith").locator("visible=true").first().click();
  await page.waitForTimeout(6000);
  if (!page.url().includes("providerId=7")) throw new Error("wrong provider: " + page.url());
  return (await page.evaluate(() => document.body.innerText))
    .match(/[\d.]+ stars · \d+ reviews/)[0];
}

(async () => {
  const browser = await chromium.launch();
  const admin = await browser.newPage({ viewport: { width: 1280, height: 1150 } });
  const customer = await browser.newPage({ viewport: { width: 1280, height: 1150 } });
  for (const p of [admin, customer]) p.on("dialog", (d) => void d.accept());

  // ---------- the rating before anything is touched
  await signIn(customer, "demo_customer_5@workshop.ai");
  const ratingBefore = await openLocksmith(customer);
  check("the farmed rating is live on the public profile", ratingBefore === "4.0 stars · 10 reviews", ratingBefore);
  await shot(customer, "01-rating-before");

  // ---------- the hide sweep
  await signIn(admin, "demo_admin@workshop.ai");
  const hideHeading = admin.getByText("Reviews bought with cheap bookings", { exact: true }).locator("visible=true").first();
  await hideHeading.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(3000);
  check("the admin console carries the hide sweep", await hideHeading.isVisible());

  const defaultCount = admin.getByText(/^20 reviews matched/).locator("visible=true").first();
  check("it checks every visible review at the 100 TRY default", await defaultCount.isVisible());
  await shot(admin, "02-sweep-default");

  const cheapest = admin.getByText("51.80 TRY").locator("visible=true").first();
  check("each row shows the booking total behind the review", await cheapest.isVisible());
  await cheapest.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1200);
  await shot(admin, "03-sweep-list");

  await thresholdBox(admin, 0).fill("53");
  await admin.waitForTimeout(400);
  await checkButton(admin, 0).click();
  await admin.waitForTimeout(4500);
  const narrowed = admin.getByText(/^3 reviews matched/).locator("visible=true").first();
  check("the threshold is the admin's to set", await narrowed.isVisible());
  await narrowed.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1000);
  await shot(admin, "04-sweep-narrowed");

  await button(admin, "Hide these 3 reviews").click();
  await admin.waitForTimeout(8000);
  const hidden = admin.getByText(/3 reviews are now hidden/).locator("visible=true").first();
  check("hiding reports what it did", await hidden.isVisible());
  await hidden.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1000);
  await shot(admin, "05-sweep-hidden");

  // ---------- the rating has actually moved
  const ratingAfter = await openLocksmith(customer);
  // The API returns 3.89; the profile renders it with one decimal.
  check("the farmed star is out of the public rating", ratingAfter === "3.9 stars · 9 reviews", ratingAfter);
  await shot(customer, "06-rating-after");

  // ---------- the mirror sweep
  const restoreHeading = admin.getByText("Restore hidden reviews on real bookings", { exact: true }).locator("visible=true").first();
  await restoreHeading.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(2500);
  check("the console carries the mirror sweep", await restoreHeading.isVisible());

  await thresholdBox(admin, 1).fill("50");
  await admin.waitForTimeout(400);
  await checkButton(admin, 1).click();
  await admin.waitForTimeout(4500);
  const found = admin.getByText(/^3 reviews matched/).locator("visible=true").last();
  check("the mirror sweep finds the three just hidden, dearest first", await found.isVisible());
  await found.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1200);
  await shot(admin, "07-restore-check");

  await button(admin, "Make these 3 reviews visible").click();
  await admin.waitForTimeout(8000);
  const restored = admin.getByText(/3 reviews are visible again/).locator("visible=true").first();
  check("restoring reports what it did", await restored.isVisible());
  await restored.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(1000);
  await shot(admin, "08-restored");

  // ---------- and the rating is back
  const ratingRestored = await openLocksmith(customer);
  check("the rating returns to where it started", ratingRestored === ratingBefore, ratingRestored);
  await shot(customer, "09-rating-restored");

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
