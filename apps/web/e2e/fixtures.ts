import { test as base, expect, type Browser, type Page } from "@playwright/test";

/**
 * Every test fails if the page throws or logs a console error, unless the error is expected
 * (e.g. a 409 the UI handles with a toast). Add expected patterns per test with `allowConsole`.
 */
export const test = base.extend<{ allowConsole: (pattern: RegExp) => void }>({
  allowConsole: [
    async ({ page }, use) => {
      const allowed: RegExp[] = [];
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && !allowed.some((re) => re.test(m.text()))) errors.push(m.text());
      });
      await use((pattern) => allowed.push(pattern));
      expect(errors, "browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** One-click sign-in as a seeded demo account (development builds only). */
export async function devSignIn(page: Page, account: "Second Loop (demo seller)" | "Ananya (demo buyer)" | "Kabir (demo buyer)", next = "/") {
  await page.goto(`/dev?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: account }).click();
  await expect(page).toHaveURL((url) => url.pathname === next.split("?")[0]);
}

/** Phone sign-in. Development builds show the code on screen instead of sending it. */
export async function otpSignIn(page: Page, tenDigits: string) {
  await page.getByLabel("Mobile number").fill(tenDigits);
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
  const code = (await page.getByText("Development: your code is").locator("span").textContent())?.trim() ?? "";
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A second person in the same test (e.g. the seller reacting to a buyer's order). */
export async function newPhone(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  return { context, page: await context.newPage() };
}
