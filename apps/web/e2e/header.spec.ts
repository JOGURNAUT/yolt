import { reseed } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// The desktop header must fit at laptop widths and keep its promises: current page, Stores link, menu.
test.beforeAll(() => reseed());

for (const width of [1024, 1100, 1280]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: false, hasTouch: false });

    test("everything fits on one line, with the bag and account in view", async ({ page }) => {
      await page.goto("/search?q=jacket");
      const header = page.getByRole("banner");
      for (const name of ["Explore", "Drops", "Stores", "Sell on YOLT"]) {
        const box = await header.getByRole("link", { name, exact: true }).boundingBox();
        expect(box?.height, `${name} wraps`).toBeLessThanOrEqual(48);
      }
      for (const name of ["Saved", "Switch between light and dark", "Bag"]) {
        const box = await header.getByRole("link", { name: new RegExp(`^${name}`) }).or(header.getByRole("button", { name })).first().boundingBox();
        expect(box, `${name} is missing`).not.toBeNull();
        expect(box!.x + box!.width, `${name} is cut off`).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("marks the current page, and Stores goes to the stores list for everyone", async ({ page }) => {
    await page.goto("/search?q=jacket");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    await page.goto("/drops");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Drops" })).toHaveAttribute("aria-current", "page");

    // Stores lands on the Explore page's list; it also works signed in, where the landing page has no such section.
    await devSignIn(page, "Ananya (demo buyer)");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Stores" }).click();
    await expect(page).toHaveURL(/\/search#stores$/);
    await expect(page.getByRole("heading", { name: "Stores", exact: true })).toBeInViewport();
  });

  test("account menu has Profile, and Escape closes it and returns focus", async ({ page }) => {
    await devSignIn(page, "Ananya (demo buyer)");
    const account = page.getByRole("button", { name: "Account" });
    await account.click();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Profile" })).toBeHidden();
    await expect(account).toBeFocused();
  });

  test("a keyboard user can skip the header", async ({ page }) => {
    await page.goto("/drops");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });
});
