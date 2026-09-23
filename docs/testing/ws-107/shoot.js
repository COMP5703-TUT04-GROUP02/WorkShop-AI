// Captures WS-107: a provider's operating settings (price, service area,
// service radius).
//
// Needs the WS-106 backend (PR #26) on :8000, because that branch owns
// PATCH /provider/profile/operating-settings.
//
// The demo data has no unapproved provider, so the locked case is set up by
// flipping the qualification status in the database and restoring it again.
// The script ends by putting the profile back to the values it started with
// and asserts that it did, so it can be re-run.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PROVIDER = "demo_provider_1@workshop.ai";
const PASSWORD = "Demo1234";
const PROFILE_ID = 1;
const ACCOUNT_TAB = /^Account/;

const NEW_RATE = "210";
const NEW_RADIUS = "25";
const NEW_AREA = ["Ankara", "Ankara", "Cankaya"];
const NEW_AREA_LABEL = NEW_AREA.join(" / ");
const RESTORE_AREA = ["Istanbul", "Istanbul", "Adalar"];

const REPO = path.resolve(__dirname, "..", "..", "..");
const DB_URL = fs
  .readFileSync(path.join(REPO, ".env"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("WORKSHOP_DATABASE_URL="))
  .split("=")[1]
  .trim();
const DB_PASSWORD = DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1];

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

function readProfile() {
  const [rate, radius, locationId, province, identity, qualification] = sql(
    `select hourly_rate, service_radius_km, coalesce(service_location_id::text, 'null'),
            service_province, identity_verification_status, qualification_verification_status
     from provider_profiles where id = ${PROFILE_ID};`,
  ).split("|");

  return { rate, radius, locationId, province, identity, qualification };
}

let failures = 0;
function check(ok, pass, fail) {
  console.log(ok ? `PASS: ${pass}` : `FAIL: ${fail}`);
  if (!ok) failures += 1;
}
const visible = (page, text) =>
  page.getByText(text, { exact: true }).locator("visible=true").first();
const field = (page, placeholder) =>
  page.getByPlaceholder(placeholder).locator("visible=true").first();
const button = (page, name) =>
  page.getByRole("button", { name, exact: true }).locator("visible=true").first();
async function isShown(page, text) {
  return visible(page, text).isVisible().catch(() => false);
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

// Province and city share a name in this data set ("Ankara / Ankara / ..."),
// and the three levels render in order, so the city is the second match.
async function pickArea(page, [province, city, district]) {
  const named = (name) =>
    page.getByRole("button", { name, exact: true }).locator("visible=true");

  await named(province).first().click();
  await page.waitForTimeout(1500);
  await named(city).nth(city === province ? 1 : 0).click();
  await page.waitForTimeout(1500);
  await named(district).first().click();
  await page.waitForTimeout(800);
  await button(page, `Use ${[province, city, district].join(" / ")}`).click();
  await page.waitForTimeout(800);
}

async function openAccount(page) {
  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .click();
  await page.waitForTimeout(2000);
}

async function openSettings(page) {
  await openAccount(page);
  await button(page, "Operating settings").click();
  await page.waitForTimeout(2500);
}

(async () => {
  const original = readProfile();
  console.log("profile before:", JSON.stringify(original));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });

  // --- Locked: an unapproved qualification hides the row completely.
  sql(
    `update provider_profiles set qualification_verification_status = 'pending' where id = ${PROFILE_ID};`,
  );

  await page.goto(APP, { waitUntil: "networkidle" });
  await field(page, "you@example.com").fill(PROVIDER);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await button(page, "Sign in").click();
  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);

  await openAccount(page);
  check(
    (await page.getByRole("button", { name: "Operating settings", exact: true }).count()) === 0,
    "the Account menu hides operating settings while the qualification is unapproved",
    "operating settings were offered to an unapproved provider",
  );
  await shot(page, "01-account-locked");

  // --- Approved: the row appears.
  sql(
    `update provider_profiles set qualification_verification_status = 'approved' where id = ${PROFILE_ID};`,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await openAccount(page);
  check(
    await button(page, "Operating settings").isVisible().catch(() => false),
    "an approved provider sees operating settings in the Account menu",
    "the approved provider never got the operating settings row",
  );
  await shot(page, "02-account-approved");

  // --- The screen opens on what is already saved.
  await button(page, "Operating settings").click();
  await page.waitForTimeout(3000);
  check(
    (await field(page, "500").inputValue()) === original.rate &&
      (await field(page, "15").inputValue()) === String(Number(original.radius)),
    `the screen loads the saved rate and radius (${original.rate} / ${original.radius})`,
    "the screen did not load the saved rate and radius",
  );
  await shot(page, "03-settings-loaded");

  // --- An empty rate is refused before any request.
  await field(page, "500").fill("");
  await button(page, "Save").click();
  await page.waitForTimeout(1200);
  check(
    await isShown(page, "Enter an hourly rate above 0."),
    "an empty hourly rate blocks the save",
    "an empty hourly rate was accepted",
  );
  await shot(page, "04-rate-required");

  // --- A district outside Istanbul can be chosen.
  await field(page, "500").fill(NEW_RATE);
  await field(page, "15").fill(NEW_RADIUS);
  await button(page, "Service area").click();
  await page.waitForTimeout(2500);
  const named = (name) =>
    page.getByRole("button", { name, exact: true }).locator("visible=true");
  await named(NEW_AREA[0]).first().click();
  await page.waitForTimeout(1500);
  await named(NEW_AREA[1]).nth(1).click();
  await page.waitForTimeout(1500);
  await named(NEW_AREA[2]).first().click();
  await page.waitForTimeout(800);
  await shot(page, "05-area-outside-istanbul");
  await button(page, `Use ${NEW_AREA_LABEL}`).click();
  await page.waitForTimeout(800);

  // --- Saving reports success.
  await button(page, "Save").click();
  await page.waitForTimeout(3000);
  check(
    await isShown(page, "Operating settings saved."),
    "saving the price, area and radius succeeds",
    "the save did not report success",
  );
  check(
    await isShown(page, NEW_AREA_LABEL),
    `the saved area reads back as the full path (${NEW_AREA_LABEL})`,
    "the saved area did not read back as a province / city / district path",
  );
  await shot(page, "06-saved");

  // --- The database has the new values and the review states are untouched.
  const after = readProfile();
  console.log("profile after:", JSON.stringify(after));
  check(
    after.rate === NEW_RATE &&
      Number(after.radius) === Number(NEW_RADIUS) &&
      after.province === NEW_AREA[0],
    `the profile stores the new settings (${after.rate} / ${after.radius} / ${after.province})`,
    `the profile did not store the new settings: ${JSON.stringify(after)}`,
  );
  check(
    after.identity === original.identity &&
      after.qualification === original.qualification &&
      after.qualification === "approved",
    "saving leaves both verification statuses approved — the profile does not go back to review",
    `saving changed a verification status: ${after.identity} / ${after.qualification}`,
  );

  // --- Reopening the screen shows what was saved.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await openSettings(page);
  check(
    (await field(page, "500").inputValue()) === NEW_RATE &&
      (await field(page, "15").inputValue()) === NEW_RADIUS &&
      (await isShown(page, NEW_AREA_LABEL)),
    "the saved settings come back after leaving the screen",
    "the saved settings did not come back",
  );
  await shot(page, "07-reopened");

  // --- Put the demo profile back.
  await field(page, "500").fill(original.rate);
  await field(page, "15").fill(String(Number(original.radius)));
  await button(page, "Service area").click();
  await page.waitForTimeout(2500);
  await pickArea(page, RESTORE_AREA);
  await button(page, "Save").click();
  await page.waitForTimeout(3000);
  sql(
    `update provider_profiles
     set service_location_id = ${original.locationId === "null" ? "null" : original.locationId},
         service_province = '${original.province}'
     where id = ${PROFILE_ID};`,
  );
  const restored = readProfile();
  check(
    JSON.stringify(restored) === JSON.stringify(original),
    "the demo profile is restored",
    `the demo profile was left changed: ${JSON.stringify(restored)}`,
  );

  await browser.close();
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
