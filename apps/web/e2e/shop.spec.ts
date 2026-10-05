import { reseed } from "./db";
import { expect, otpSignIn, test } from "./fixtures";

// Guest saves and bag live on the device, merge into the account at sign-in, and the bag checks out.
test.beforeAll(() => reseed());

test("guest save and bag merge at sign-in, then bag checkout and follow", async ({ page }) => {
  await page.goto("/s/secondloop");
  const cards = page.locator('a[href^="/p/"]');
  const savedHref = (await cards.nth(0).getAttribute("href"))!;
  const bagHref = (await cards.nth(1).getAttribute("href"))!;

  // The heart on a card saves without opening the product.
  await cards.nth(0).getByRole("button", { name: "Save" }).click();
  await expect(cards.nth(0).getByRole("button", { name: "Remove from saved" })).toBeVisible();
  await expect(page).toHaveURL(/\/s\/secondloop$/);

  await page.goto(bagHref);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("link", { name: /In your bag/ })).toBeVisible();

  await page.goto("/saved");
  await expect(page.locator(`a[href="${savedHref}"]`).first()).toBeVisible();
  await page.goto("/bag");
  await expect(page.locator(`a[href="${bagHref}"]`).first()).toBeVisible();
  await expect(page.getByText(/aren.t reserved/)).toBeVisible();

  // Sign in: the device's saves and bag move into the account and leave the device.
  await page.getByRole("link", { name: "Sign in to check out" }).click();
  await otpSignIn(page, "9000000011");
  await page.waitForURL(/\/bag$/);
  await expect(page.getByRole("button", { name: /Check out Second Loop/ })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("yolt_saves"), localStorage.getItem("yolt_bag")])).toEqual([null, null]);
  await page.goto("/saved");
  await expect(page.locator(`a[href="${savedHref}"]`).first()).toBeVisible();

  // Bag checkout reserves the piece.
  await page.goto("/bag");
  await page.getByRole("button", { name: /Check out Second Loop/ }).click();
  await page.waitForURL(/\/checkout\//);
  await expect(page.getByText("Reserved for you for")).toBeVisible();

  // Follow persists.
  await page.goto("/s/secondloop");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
});
