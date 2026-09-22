// Captures the three WS-82 cascade-picker entry points against the live app.
const { chromium } = require("playwright");

const APP = process.env.WORKSHOP_APP_URL || "http://127.0.0.1:8081";
const OUT = __dirname;
const PASSWORD = "Demo1234";

async function signIn(page, email) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Home", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 60000,
  });
  await page.waitForTimeout(1000);
}

async function showAllSearchLevels(page) {
  const provinceSearch = page.getByPlaceholder("Search province");
  await provinceSearch.waitFor({ state: "visible", timeout: 30000 });
  await provinceSearch.fill("Istanbul");
  await page.getByRole("button", { name: "Istanbul", exact: true }).last().click();

  const citySearch = page.getByPlaceholder("Search city");
  await citySearch.waitFor({ state: "visible", timeout: 30000 });
  await citySearch.fill("Istanbul");
  await page.getByRole("button", { name: "Istanbul", exact: true }).last().click();
  await page.getByPlaceholder("Search district").waitFor({
    state: "visible",
    timeout: 30000,
  });
}

async function capture(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`saved ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const viewport = { width: 1280, height: 800 };
  const only = process.env.WS82_SCREEN;

  if (!only || only === "home") {
    const home = await browser.newPage({ viewport });
    await signIn(home, "demo_customer_1@workshop.ai");
    await home.getByRole("button", { name: "Service area" }).click();
    await showAllSearchLevels(home);
    await capture(home, "01-customer-home-cascade");
    await home.close();
  }

  if (!only || only === "account") {
    const account = await browser.newPage({ viewport });
    await signIn(account, "demo_customer_1@workshop.ai");
    await account.getByRole("button", { name: /^Account/ }).last().click();
    await account.getByRole("button", { name: "Edit profile" }).click();
    await account.getByText("Service area", { exact: true }).waitFor();
    await account.getByRole("button", { name: /Istanbul/ }).last().click();
    await showAllSearchLevels(account);
    await capture(account, "02-account-edit-cascade");
    await account.close();
  }

  if (!only || only === "provider") {
    const provider = await browser.newPage({ viewport });
    await signIn(provider, "demo_provider_16@workshop.ai");
    const editProfile = provider.getByRole("button", {
      name: "Edit provider profile",
    });
    if (await editProfile.isVisible()) {
      await editProfile.click();
    }
    await provider.getByText("Service area", { exact: true }).waitFor({
      state: "visible",
      timeout: 60000,
    });
    await provider.getByRole("button", { name: /Istanbul/ }).last().click();
    await showAllSearchLevels(provider);
    await capture(provider, "03-provider-profile-cascade");
    await provider.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
