import type { Page } from "@playwright/test";
import { reseed } from "./db";
import { expect, otpSignIn, test } from "./fixtures";

// System pages and the installable-app shell: 404, offline, session ended, maintenance, manifest,
// icons, the service worker file, and the install card (never on arrival; after an order).
test.beforeAll(() => reseed());

test.use({ viewport: { width: 390, height: 844 } });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const pngSize = (bytes: Buffer) => {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};

test("an unknown URL gets the branded 404 with a working search", async ({ page, allowConsole }) => {
  allowConsole(/404/); // the browser logs the 404 document itself
  const res = await page.goto("/no/such/page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page wandered off" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByRole("searchbox", { name: "Search" }).last().fill("denim");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=denim/);
});

test("the offline page, session-ended page and maintenance page render", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto("/session-expired?next=/bag");
  await expect(page.getByRole("heading", { name: "Your session ended" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fbag");
  await noHorizontalScroll(page);

  // Only same-site paths are accepted for where to return to.
  await page.goto("/session-expired?next=//evil.example");
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2F");

  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: "Back soon" })).toBeVisible();
  await noHorizontalScroll(page);
});

test("the manifest is valid and its icons are real PNGs of the stated sizes", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);

  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "YOLT", short_name: "YOLT", start_url: "/", display: "standalone" });
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
    const png = await request.get(icon.src);
    expect(png.status(), icon.src).toBe(200);
    expect(png.headers()["content-type"]).toBe(icon.type);
    expect(pngSize(await png.body()), icon.src).toBe(icon.sizes);
  }
  const apple = await request.get("/icons/apple-touch-icon.png");
  expect(pngSize(await apple.body())).toBe("180x180");
});

test("the service worker file is served, and nothing registers it outside deployed builds", async ({ page, request }) => {
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const source = await sw.text();
  expect(source).toContain('"/offline"');
  expect((await request.get("/sw-push.js")).status()).toBe(200);

  // This server is an optimised build with APP_ENV=development, so it must not register the worker.
  await page.goto("/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(registrations).toBe(0);
});

// The first order: enough of checkout to reach the confirmed state.
async function placeOrder(page: Page) {
  await page.goto("/search?q=baby+tee");
  await page.getByRole("link", { name: /Y2K graphic baby tee/ }).first().click();
  await page.getByRole("button", { name: "Buy now · ₹549" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await otpSignIn(page, "9876500001");
  await page.getByRole("button", { name: "Buy now · ₹549" }).click();
  await page.waitForURL(/\/checkout\//);
  await page.getByLabel("Full name").fill("Ananya Rao");
  await page.getByLabel("Mobile number (for the courier)").fill("9876500001");
  await page.getByLabel("Flat / house no., building, street").fill("Flat 12, Sunrise Apartments");
  await page.getByLabel("Pincode").fill("411001");
  await page.getByLabel("City / town").fill("Pune");
  await page.getByLabel("State").selectOption("Maharashtra");
  await page.getByRole("button", { name: "Deliver here" }).click();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByRole("button", { name: "Approve payment" }).click();
}

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test("install card: not on arrival, after the order is confirmed, dismissible and remembered", async ({ page, browser, allowConsole }) => {
  allowConsole(/401/);
  const card = page.getByRole("region", { name: "Add YOLT to your home screen" });
  const fireInstallEvent = () => page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));

  // Chrome fires the event on arrival. Having it is not a reason to show the card.
  await page.goto("/");
  await fireInstallEvent();
  await page.waitForTimeout(300);
  await expect(card).toHaveCount(0);

  await placeOrder(page);
  await expect(page.getByRole("heading", { name: /Order confirmed/ })).toBeVisible();
  await fireInstallEvent();
  await expect(card).toBeVisible();
  await expect(card.getByText("Add YOLT to your home screen for drop reminders")).toBeVisible();
  await expect(card.getByRole("button", { name: "Add to home screen" })).toBeVisible();
  await noHorizontalScroll(page);
  const notNow = card.getByRole("button", { name: "Not now" });
  expect((await notNow.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const checkoutUrl = page.url();
  const storage = await page.context().storageState();

  await notNow.click();
  await expect(card).toHaveCount(0);

  // Stays dismissed after a reload, even when the order confirmation asks for it again.
  await page.goto(checkoutUrl);
  await expect(page.getByRole("heading", { name: /Order confirmed/ })).toBeVisible();
  await fireInstallEvent();
  await page.waitForTimeout(300);
  await expect(card).toHaveCount(0);

  // iPhone Safari has no install event: it gets the two steps instead.
  const ios = await browser.newContext({ storageState: storage, userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const iosPage = await ios.newPage();
  await iosPage.goto(checkoutUrl);
  const iosCard = iosPage.getByRole("region", { name: "Add YOLT to your home screen" });
  await expect(iosCard).toBeVisible();
  await expect(iosCard).toContainText("Tap");
  await expect(iosCard).toContainText("Add to Home Screen");
  await expect(iosCard.getByRole("button", { name: "Add to home screen" })).toHaveCount(0);
  await noHorizontalScroll(iosPage);
  await ios.close();

  // Already installed (opened from the home screen): never shown.
  const installed = await browser.newContext({ storageState: storage, userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await installed.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const installedPage = await installed.newPage();
  await installedPage.goto(checkoutUrl);
  await expect(installedPage.getByRole("heading", { name: /Order confirmed/ })).toBeVisible();
  await installedPage.waitForTimeout(300);
  await expect(installedPage.getByRole("region", { name: "Add YOLT to your home screen" })).toHaveCount(0);
  await installed.close();
});
