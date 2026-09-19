// Captures the screens WS-72 is accepted on.
//
// This picker is not mounted anywhere yet on purpose — WS-72 owns the component,
// and WS-99 / WS-100 own hanging it on register and booking. For capture only,
// a temporary Account row opens it; that row is not part of the commit.
//
// MODE=unconfigured  the real state of this machine: no Places key, so the
//                    backend answers 503 and the picker shows that message.
// MODE=stubbed       the Google call is stubbed locally so the suggestion ->
//                    details -> coordinates path can be seen end to end. The
//                    app still goes through GET /places/autocomplete and
//                    GET /places/details.
const { chromium } = require("playwright");

const APP = "http://localhost:8090";
const OUT = __dirname;
const PASSWORD = "Demo1234";
const CUSTOMER = "demo_customer_1@workshop.ai";
const ACCOUNT_TAB = /^Account/;
const MODE = process.env.MODE === "unconfigured" ? "unconfigured" : "stubbed";

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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  await page.goto(APP, { waitUntil: "networkidle" });
  await field(page, "you@example.com").fill(CUSTOMER);
  await field(page, "Minimum 8 characters").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page
    .getByRole("button", { name: ACCOUNT_TAB })
    .locator("visible=true")
    .first()
    .click();
  await page.waitForTimeout(2000);
  await visible(page, "Location picker (dev)").click();
  await page.waitForTimeout(1500);

  check(
    await isShown(page, "No location selected"),
    "picker opens with nothing selected",
    "picker did not open",
  );

  // Every request the picker makes must go to our own proxy.
  const placesCalls = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/places/")) placesCalls.push(url);
    if (url.includes("maps.googleapis.com")) placesCalls.push(`DIRECT:${url}`);
  });

  await field(page, "Start typing an address").fill("Istanbul");
  await page.waitForTimeout(3000);

  if (MODE === "unconfigured") {
    check(
      await isShown(page, "Places service is not configured"),
      "the backend's 503 is shown to the user",
      "the configuration error was not surfaced",
    );
    await shot(page, "03-places-not-configured");
  } else {
    check(
      await isShown(page, "Taksim Square, Beyoglu, Istanbul, Turkiye"),
      "typing shows suggestions from /places/autocomplete",
      "no suggestions appeared",
    );
    await shot(page, "01-suggestions");

    await visible(page, "Taksim Square, Beyoglu, Istanbul, Turkiye").click();
    await page.waitForTimeout(2500);
    check(
      await isShown(page, "41.036945, 28.985139"),
      "picking a suggestion fills coordinates from /places/details",
      "coordinates were not filled from the details call",
    );
    check(
      await isShown(page, "Taksim Square, Beyoglu, 34435 Istanbul, Turkiye"),
      "the chosen place's formatted address is shown",
      "the formatted address is missing",
    );
    await shot(page, "02-selected-place");
  }

  check(
    placesCalls.length > 0 && placesCalls.every((url) => !url.startsWith("DIRECT:")),
    `only our proxy was called (${placesCalls.length} request(s), no maps.googleapis.com)`,
    `the app called Google directly: ${placesCalls.filter((u) => u.startsWith("DIRECT:")).join(", ")}`,
  );

  // There is no way to type a coordinate any more.
  check(
    (await page.getByPlaceholder("-33.8688").count()) === 0 &&
      (await page.getByPlaceholder("151.2093").count()) === 0,
    "the hand-typed latitude and longitude fields are gone",
    "coordinate inputs are still present",
  );

  await browser.close();
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
