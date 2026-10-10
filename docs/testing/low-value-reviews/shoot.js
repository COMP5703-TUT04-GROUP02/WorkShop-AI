// Evidence for the two review sweeps. Every screenshot is backed by an
// assertion, and the run is a round trip: the three reviews it hides are put
// back by the restore sweep, so the database ends where it started.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";

const field = (p, ph) => p.getByPlaceholder(ph).locator("visible=true").first();
const button = (p, n) => p.getByRole("button", { name: n, exact: true }).locator("visible=true").first();

let passed = 0, failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else { failed += 1; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}
const shot = async (p, n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log(`      saved ${n}.png`); };

// Each panel owns one threshold box; nth(0) is the hide sweep, nth(1) restore.
const thresholdBox = (p, index) => p.getByPlaceholder("100").locator("visible=true").nth(index);
const checkButton = (p, index) => p.getByRole("button", { name: "Check", exact: true }).locator("visible=true").nth(index);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1150 } });
  page.on("dialog", (d) => void d.accept());

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await field(page, "you@example.com").fill("demo_admin@workshop.ai");
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await button(page, "Sign in").click();
  await page.waitForTimeout(9000);

  // ---------- the hide sweep
  const hideHeading = page.getByText("Reviews bought with cheap bookings", { exact: true }).locator("visible=true").first();
  await hideHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  check("the admin dashboard carries the hide sweep", await hideHeading.isVisible());

  const defaultCount = page.getByText(/^20 reviews matched/).locator("visible=true").first();
  check("it checks every visible review at the 100 TRY default", await defaultCount.isVisible());
  await shot(page, "01-default-check");

  const cheapest = page.getByText("51.80 TRY").locator("visible=true").first();
  check("each row shows the booking total behind the review", await cheapest.isVisible());
  await cheapest.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await shot(page, "02-list-with-amounts");

  await thresholdBox(page, 0).fill("53");
  await page.waitForTimeout(400);
  await checkButton(page, 0).click();
  await page.waitForTimeout(4500);
  const narrowed = page.getByText(/^3 reviews matched/).locator("visible=true").first();
  check("the threshold is the admin's to set", await narrowed.isVisible());
  await narrowed.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await shot(page, "03-threshold-changed");

  await button(page, "Hide these 3 reviews").click();
  await page.waitForTimeout(8000);
  const hidden = page.getByText(/3 reviews are now hidden/).locator("visible=true").first();
  check("hiding reports what it did", await hidden.isVisible());
  await hidden.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await shot(page, "04-hidden");

  // ---------- the restore sweep
  const restoreHeading = page.getByText("Restore hidden reviews on real bookings", { exact: true }).locator("visible=true").first();
  await restoreHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  check("the dashboard carries the mirror sweep", await restoreHeading.isVisible());

  await thresholdBox(page, 1).fill("50");
  await page.waitForTimeout(400);
  await checkButton(page, 1).click();
  await page.waitForTimeout(4500);
  const found = page.getByText(/^3 reviews matched/).locator("visible=true").last();
  check("the restore sweep finds the three that were just hidden", await found.isVisible());
  await found.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await shot(page, "05-restore-check");

  await button(page, "Make these 3 reviews visible").click();
  await page.waitForTimeout(8000);
  const restored = page.getByText(/3 reviews are visible again/).locator("visible=true").first();
  check("restoring reports what it did", await restored.isVisible());
  await restored.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await shot(page, "06-restored");

  const empty = page.getByText(/No hidden review is attached to a booking at or above this amount/).locator("visible=true").first();
  check("nothing is left hidden above that amount", await empty.isVisible());
  await shot(page, "07-nothing-left-hidden");

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
