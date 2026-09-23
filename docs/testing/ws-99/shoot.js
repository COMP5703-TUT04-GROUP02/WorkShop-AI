// Captures WS-99: register cannot be submitted without a recommended place.
//
// Needs a Places API key configured, since the point of the ticket is that the
// address comes from a chosen suggestion rather than typed coordinates.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";
const FIRST_NAME = "Ada";
const LAST_NAME = "Lovelace";
const STAMP = Date.now();
const CUSTOMER_EMAIL = `ws99_customer_${STAMP}@workshop.ai`;
const PROVIDER_EMAIL = `ws99_provider_${STAMP}@workshop.ai`;
const ACCOUNT_TAB = /^Account/;

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

async function openRegisterForm(page) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await visible(page, "Don't have an account? Create one").click();
  await page.waitForTimeout(1200);
}

async function fillRegisterForm(page, email, { role }) {
  await field(page, "Your first name").fill(FIRST_NAME);
  await field(page, "Your last name").fill(LAST_NAME);
  await field(page, "you@example.com").fill(email);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await field(page, "Repeat your password").fill(PASSWORD);

  if (role === "provider") {
    await page.getByRole("button", { name: "Provider" }).click();
    await page.waitForTimeout(400);
  }

  await page
    .getByRole("checkbox")
    .locator("visible=true")
    .first()
    .click({ position: { x: 11, y: 11 } });
  await page.waitForTimeout(400);
}

// The picker is WS-72's, reached from the register screen for both roles.
async function pickPlace(page) {
  await visible(page, "Search for your address").click();
  await page.waitForTimeout(1200);
  await field(page, "Start typing an address").fill("Taksim");
  await page.waitForTimeout(3000);

  const suggestion = page
    .getByText(/Taksim.*(Türkiye|Turkiye)/)
    .locator("visible=true")
    .first();
  const chosen = ((await suggestion.textContent()) ?? "").trim();
  await suggestion.click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Confirm location" }).click();
  await page.waitForTimeout(1500);

  return chosen;
}

async function submit(page) {
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch();
  const viewport = { width: 1100, height: 1000 };

  // --- A complete form without a place must not submit.
  const customer = await browser.newPage({ viewport });
  await openRegisterForm(customer);
  check(
    await isShown(customer, "Service location"),
    "register asks for a service location",
    "the service location row is missing",
  );
  await shot(customer, "01-register-with-location-row");

  await fillRegisterForm(customer, CUSTOMER_EMAIL, { role: "customer" });
  await submit(customer);
  check(
    await isShown(customer, "Pick your service location from the suggestions."),
    "a form without a place cannot be submitted",
    "registration went ahead without a place",
  );
  await shot(customer, "02-place-required");

  // --- The place comes from WS-72's picker, not from typed coordinates.
  const chosen = await pickPlace(customer);
  // The form shows the formatted address from /places/details, which is not
  // character-for-character the suggestion text, so match on the place name.
  const shownPlace = customer
    .getByText(/Taksim.*(Türkiye|Turkiye)/)
    .locator("visible=true")
    .first();
  check(
    (await shownPlace.count()) > 0,
    `the chosen place is shown on the form (${((await shownPlace.textContent()) ?? "").trim().slice(0, 48)}…)`,
    "the chosen place did not appear on the form",
  );
  await shot(customer, "03-place-chosen");

  await submit(customer);
  await customer
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  check(true, `customer registered with a place (${CUSTOMER_EMAIL})`, "registration failed");
  await shot(customer, "04-registered");
  await customer.close();

  // --- Both roles use the same picker.
  const provider = await browser.newPage({ viewport });
  await openRegisterForm(provider);
  await fillRegisterForm(provider, PROVIDER_EMAIL, { role: "provider" });
  await submit(provider);
  check(
    await isShown(provider, "Pick your service location from the suggestions."),
    "a provider is held to the same rule",
    "a provider could register without a place",
  );
  await pickPlace(provider);
  await shot(provider, "05-provider-same-picker");
  await submit(provider);
  await provider
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  check(true, `provider registered with a place (${PROVIDER_EMAIL})`, "provider registration failed");
  await provider.close();

  await browser.close();
  console.log(`CUSTOMER_EMAIL=${CUSTOMER_EMAIL}`);
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
