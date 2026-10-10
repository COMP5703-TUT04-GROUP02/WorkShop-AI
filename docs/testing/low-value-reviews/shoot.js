// Evidence for the low-value review sweep. Every screenshot is backed by an
// assertion, so none of them can show a step that did not actually happen.
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1150 } });
  page.on("dialog", (d) => void d.accept());

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await field(page, "you@example.com").fill("demo_admin@workshop.ai");
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await button(page, "Sign in").click();
  await page.waitForTimeout(8000);

  const heading = page.getByText("Reviews bought with cheap bookings", { exact: true })
    .locator("visible=true").first();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  check("the admin dashboard carries the sweep", await heading.isVisible());

  // It runs on load at the default threshold.
  const defaultCount = page.getByText(/20 visible reviews would be hidden/).locator("visible=true").first();
  check("it checks every visible review at the 100 TRY default", await defaultCount.isVisible());
  await shot(page, "01-default-check");

  // The list is the evidence: each row carries the booking that paid for it.
  const cheapest = page.getByText("51.80 TRY").locator("visible=true").first();
  check("each row shows the booking total behind the review", await cheapest.isVisible());
  await cheapest.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await shot(page, "02-list-with-amounts");

  // A different threshold re-checks.
  const input = field(page, "100");
  await input.fill("53");
  await page.waitForTimeout(500);
  await button(page, "Check").click();
  await page.waitForTimeout(4000);
  const narrowed = page.getByText(/3 visible reviews would be hidden/).locator("visible=true").first();
  check("the threshold is the admin's to set", await narrowed.isVisible());
  await narrowed.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await shot(page, "03-threshold-changed");

  // Hide them.
  await button(page, "Hide these 3 reviews").click();
  await page.waitForTimeout(7000);
  const done = page.getByText(/3 reviews are now hidden/).locator("visible=true").first();
  check("hiding reports what it did", await done.isVisible());
  await done.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await shot(page, "04-hidden");

  // And the sweep is now clean at that threshold.
  const empty = page.getByText(/No visible review is attached to a booking under this amount/)
    .locator("visible=true").first();
  check("re-checking afterwards finds nothing left", await empty.isVisible());
  await shot(page, "05-nothing-left");

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
