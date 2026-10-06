import { expect, test } from "./fixtures";

// The site follows the system theme until the visitor picks one; the pick survives a reload.
const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("dark system", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system, switches to light with the header button, and remembers it", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    const dark = await bg(page);

    await page.getByRole("button", { name: "Switch between light and dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bg(page)).not.toBe(dark);

    // A saved choice is applied before first paint, so a reload never shows the other theme first.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // The footer selector offers System, which hands the decision back to the device.
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "System" }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    expect(await bg(page)).toBe(dark);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
  });
});

test.describe("light system", () => {
  test.use({ colorScheme: "light" });

  test("the footer selector picks dark and the header button flips back", async ({ page }) => {
    await page.goto("/");
    const light = await bg(page);
    const group = page.getByRole("group", { name: "Theme" });
    await group.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(group.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(await bg(page)).not.toBe(light);

    await page.getByRole("button", { name: "Switch between light and dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
