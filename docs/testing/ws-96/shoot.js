// Captures the screens WS-108 / WS-109 / WS-110 are accepted on, against the
// live API. Re-runnable: every PR needs this evidence.
//
// React Navigation keeps inactive screens mounted, so every locator is scoped
// to visible elements — otherwise a hidden copy on another screen matches.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";

const visible = (page, text) =>
  page.getByText(text, { exact: true }).locator("visible=true").first();

async function signIn(page, email) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(4500);
}

async function openAccountTab(page) {
  await page
    .getByRole("button", { name: "Account", exact: true })
    .locator("visible=true")
    .first()
    .click();
  await page.waitForTimeout(2500);
}

async function openRow(page, label) {
  await visible(page, label).click();
  await page.waitForTimeout(2500);
}

// The web build does not push a history entry per screen, so goBack() does
// nothing here. Tapping the sidebar's Account item pops back to the tab.
async function back(page) {
  await openAccountTab(page);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });

  await signIn(page, "demo_customer_1@workshop.ai");
  await openAccountTab(page);
  await shot(page, "01-account-customer");

  await openRow(page, "Payments");
  await shot(page, "02-payments-customer");
  await back(page);

  await openRow(page, "Help and Support");
  await shot(page, "03-help-and-support");
  await back(page);

  await openRow(page, "Notification settings");
  await shot(page, "04-notification-settings");
  await back(page);

  await openRow(page, "Favourites");
  await shot(page, "05-favourites-customer");
  await back(page);

  await openRow(page, "Sign out");
  await page.waitForTimeout(4500);

  await signIn(page, "demo_provider_1@workshop.ai");
  await openAccountTab(page);
  await shot(page, "06-account-provider");

  const favouritesVisible = await visible(page, "Favourites")
    .isVisible()
    .catch(() => false);
  console.log(
    favouritesVisible
      ? "FAIL: provider can see Favourites"
      : "PASS: Favourites hidden for provider",
  );

  await openRow(page, "Payments");
  await shot(page, "07-payments-provider");

  await browser.close();
})();
