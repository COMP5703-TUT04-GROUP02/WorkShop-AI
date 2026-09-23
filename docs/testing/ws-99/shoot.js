// Captures WS-99: register cannot be submitted without a recommended place,
// and that place is carried all the way to where each role needs it.
//
// Needs a Places API key configured, since the point of the ticket is that the
// address comes from a chosen suggestion rather than typed coordinates.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";
const FIRST_NAME = "Ada";
const LAST_NAME = "Lovelace";
const STAMP = Date.now();
const CUSTOMER_EMAIL = `ws99_customer_${STAMP}@workshop.ai`;
const FAILING_EMAIL = `ws99_offline_${STAMP}@workshop.ai`;
const PROVIDER_EMAIL = `ws99_provider_${STAMP}@workshop.ai`;
const ACCOUNT_TAB = /^Account/;
const CERTIFICATE = process.env.CERTIFICATE_FILE || "/tmp/certificate.jpg";

const REPO = path.resolve(__dirname, "..", "..", "..");
const DB_PASSWORD = fs
  .readFileSync(path.join(REPO, ".env"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("WORKSHOP_DATABASE_URL="))
  .match(/:\/\/[^:]+:([^@]+)@/)[1];

function sql(query) {
  return execSync(
    `psql -h 127.0.0.1 -U workshop -d workshop_ai -tAc ${JSON.stringify(
      query.replace(/\s+/g, " ").trim(),
    )}`,
    { env: { ...process.env, PGPASSWORD: DB_PASSWORD } },
  )
    .toString()
    .trim();
}

const visible = (page, text) =>
  page.getByText(text, { exact: true }).locator("visible=true").first();
const field = (page, placeholder) =>
  page.getByPlaceholder(placeholder).locator("visible=true").first();
const button = (page, name) =>
  page.getByRole("button", { name, exact: true }).locator("visible=true").first();

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
// Two points are the same place when they agree to roughly a metre.
const samePoint = (a, b) => Math.abs(Number(a) - Number(b)) < 0.00002;

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
async function openPlacePicker(page) {
  await visible(page, "Search for your address").click();
  await page.waitForTimeout(1200);
}

async function pickPlace(page, { alreadyOpen = false } = {}) {
  if (!alreadyOpen) {
    await openPlacePicker(page);
  }

  await field(page, "Start typing an address").fill("Taksim");
  await page.waitForTimeout(3000);

  const suggestion = page
    .getByText(/Taksim.*(Türkiye|Turkiye)/)
    .locator("visible=true")
    .first();
  const chosen = ((await suggestion.textContent()) ?? "").trim();
  await suggestion.click();
  await page.waitForTimeout(2500);
  await button(page, "Confirm location").click();
  await page.waitForTimeout(1500);

  return chosen;
}

// The service area is WS-82's cascade. The form's own area row carries the
// same province name, and the modal renders after it, so the modal's options
// are the later matches.
async function pickServiceArea(page, [province, city, district]) {
  const named = (name) =>
    page.getByRole("button", { name, exact: true }).locator("visible=true");

  await named(province).first().click();
  await page.waitForTimeout(2500);
  await named(province).nth(1).click();
  await page.waitForTimeout(1800);
  await named(city).nth(2).click();
  await page.waitForTimeout(1800);
  await named(district).first().click();
  await page.waitForTimeout(800);
  await button(page, `Use ${[province, city, district].join(" / ")}`).click();
  await page.waitForTimeout(1000);
}

async function submit(page) {
  await button(page, "Create account").click();
  await page.waitForTimeout(2500);
}

async function waitForSignedIn(page) {
  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
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

  // --- A device fix carries no street address, so the picker refuses it
  //     instead of letting the row look chosen (review feedback).
  await openPlacePicker(customer);
  await button(customer, "Use current location").click();
  await customer.waitForTimeout(1500);
  check(
    await isShown(
      customer,
      "Your current location has no street address. Pick an address from the suggestions.",
    ),
    "the picker refuses a device fix where a real place is required",
    "the picker accepted a location with no place_id",
  );
  await shot(customer, "06-current-location-refused");

  // --- The place comes from WS-72's picker, not from typed coordinates.
  const chosen = await pickPlace(customer, { alreadyOpen: true });
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
  await waitForSignedIn(customer);
  check(true, `customer registered with a place (${CUSTOMER_EMAIL})`, "registration failed");
  await shot(customer, "04-registered");
  await customer.close();

  // --- The place lands in the address book and on the profile, because
  //     search measures distance from the profile's default point.
  const [bookAddress, bookLat, bookLng, bookDefault] = sql(
    `select a.formatted_address, a.latitude, a.longitude, a.is_default
     from customer_addresses a join users u on u.id = a.customer_id
     where u.email = '${CUSTOMER_EMAIL}';`,
  ).split("|");
  const [defaultAddress, defaultLat, defaultLng] = sql(
    `select p.default_service_address, p.default_service_latitude, p.default_service_longitude
     from customer_profiles p join users u on u.id = p.user_id
     where u.email = '${CUSTOMER_EMAIL}';`,
  ).split("|");

  console.log("address book:", bookAddress, bookLat, bookLng, bookDefault);
  console.log("profile default:", defaultAddress, defaultLat, defaultLng);
  check(
    Boolean(bookAddress) && bookDefault === "t",
    `the chosen place is the default address in the book (${bookAddress})`,
    "the chosen place did not reach the address book",
  );
  check(
    defaultAddress === bookAddress &&
      samePoint(defaultLat, bookLat) &&
      samePoint(defaultLng, bookLng),
    "the same place is the profile's default service location, so search measures from it",
    `the profile default does not match the address book: ${defaultAddress} / ${defaultLat} / ${defaultLng}`,
  );

  // --- A failed address save is told to the user, not swallowed by the
  //     sign-in that follows it (review feedback).
  const offline = await browser.newPage({ viewport });
  const dialogs = [];
  offline.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await offline.route("**/customer/addresses", (route) => route.abort());
  await openRegisterForm(offline);
  await fillRegisterForm(offline, FAILING_EMAIL, { role: "customer" });
  await pickPlace(offline);
  await submit(offline);
  await waitForSignedIn(offline);
  await offline.waitForTimeout(2000);
  check(
    dialogs.some((message) => message.includes("Address not saved")),
    `the user is told the address was not saved (${(dialogs[0] ?? "").split("\n")[0]})`,
    `a failed address save was hidden behind the sign-in: ${JSON.stringify(dialogs)}`,
  );
  await offline.close();

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
  const providerPlace = await pickPlace(provider);
  await shot(provider, "05-provider-same-picker");
  await submit(provider);
  await waitForSignedIn(provider);
  check(true, `provider registered with a place (${PROVIDER_EMAIL})`, "provider registration failed");

  // --- There is no provider profile yet, so the place waits on the device.
  const providerId = sql(`select id from users where email = '${PROVIDER_EMAIL}';`);
  const storageKey = `workshop.pendingProviderPlace.${providerId}`;
  const kept = await provider.evaluate(
    (key) => window.localStorage.getItem(key),
    storageKey,
  );
  const keptPlace = kept ? JSON.parse(kept) : null;
  console.log("picked at registration:", providerPlace);
  console.log("kept on device:", kept);
  check(
    Boolean(keptPlace) &&
      /Taksim/.test(keptPlace.address) &&
      typeof keptPlace.latitude === "number" &&
      typeof keptPlace.longitude === "number",
    `the provider's place is kept on the device until the profile exists (${keptPlace?.address})`,
    `the provider's place was discarded: ${kept}`,
  );

  // --- Creating the profile sends that place as address and coordinates.
  // A provider with no profile lands straight on the create form.
  await provider.getByRole("button", { name: /^Home/ }).locator("visible=true").first().click();
  await provider.waitForTimeout(3000);
  check(
    await isShown(provider, keptPlace.address),
    "the profile form opens with the address picked at registration",
    "the profile form did not carry the registered address",
  );
  await shot(provider, "07-profile-prefilled");

  await field(provider, "e.g. Istanbul CleanCare").fill("Ada Repairs");
  await field(provider, "Describe your services and experience").fill(
    "Appliance repair across the city.",
  );
  await field(provider, "Phone number").fill("5551234567");
  await field(provider, "e.g. 120").fill("150");
  await field(provider, "e.g. 3").fill("4");
  await field(provider, "e.g. 10").fill("12");
  await field(provider, "e.g. Business license").fill("Trade licence");
  await provider.getByText("Cleaning", { exact: true }).locator("visible=true").first().click();
  await provider.waitForTimeout(400);
  await pickServiceArea(provider, ["Istanbul", "Istanbul", "Adalar"]);

  const chooser = provider.waitForEvent("filechooser");
  await button(provider, "Add photo or video").click();
  await (await chooser).setFiles(CERTIFICATE);
  await provider.waitForTimeout(3000);

  await button(provider, "Submit for review").click();
  await provider.waitForTimeout(6000);
  await shot(provider, "08-profile-submitted");

  const [profileAddress, profileLat, profileLng] = sql(
    `select p.address, p.latitude, p.longitude
     from provider_profiles p join users u on u.id = p.user_id
     where u.email = '${PROVIDER_EMAIL}';`,
  ).split("|");
  console.log("provider profile:", profileAddress, profileLat, profileLng);
  check(
    Boolean(profileAddress) &&
      profileAddress === keptPlace.address &&
      samePoint(profileLat, keptPlace.latitude) &&
      samePoint(profileLng, keptPlace.longitude),
    `the profile is created on the registered place (${profileAddress})`,
    `the profile did not use the registered place: ${profileAddress} / ${profileLat} / ${profileLng}`,
  );

  const leftover = await provider.evaluate(
    (key) => window.localStorage.getItem(key),
    storageKey,
  );
  check(
    leftover === null,
    "the kept place is dropped once the profile has it",
    `the place was left on the device: ${leftover}`,
  );
  await provider.close();

  await browser.close();

  // Registration cannot be undone from the app, so the three accounts this run
  // created are removed here and the count is checked, to keep the demo
  // database as it was found.
  sql(`delete from users where email in ('${CUSTOMER_EMAIL}', '${FAILING_EMAIL}', '${PROVIDER_EMAIL}');`);
  check(
    sql(`select count(*) from users where email like 'ws99_%@workshop.ai';`) === "0",
    "the accounts this run created are removed",
    "test accounts were left behind",
  );

  console.log(`CUSTOMER_EMAIL=${CUSTOMER_EMAIL}`);
  console.log(`PROVIDER_EMAIL=${PROVIDER_EMAIL}`);
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
