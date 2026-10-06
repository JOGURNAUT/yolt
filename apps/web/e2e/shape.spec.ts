import { reseed } from "./db";
import { expect, test } from "./fixtures";

// The shape language: containers are square (the street shelf), controls keep their rounding.
test.beforeAll(() => reseed());
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const radius = (loc: import("@playwright/test").Locator) => loc.first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);

test("cards, photos and tiles are square; buttons, pills and stickers are round", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".pc").first()).toBeVisible();
  expect(await radius(page.locator(".pc .media"))).toBe("0px");
  expect(await radius(page.locator(".tile"))).toBe("0px");
  expect(await radius(page.locator(".card"))).toBe("0px");
  expect(await radius(page.locator(".ticket"))).toBe("0px");

  await page.goto("/s/secondloop");
  expect(await radius(page.locator(".pill"))).not.toBe("0px");
  expect(await radius(page.locator(".sticker"))).not.toBe("0px");
  expect(await radius(page.getByRole("button", { name: "Follow", exact: true }))).not.toBe("0px");
});
