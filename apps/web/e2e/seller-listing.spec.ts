import { reseed } from "./db";
import { devSignIn, expect, test } from "./fixtures";
import { photoFile } from "./images";

// A seller lists a piece from their phone: the checklist blocks publishing until it's complete.
test.beforeAll(() => reseed());

test("new listing: photos, details, checklist, publish, live on the store page", async ({ page }) => {
  await devSignIn(page, "Second Loop (demo seller)", "/seller/listings");
  await page.getByRole("button", { name: "New listing" }).click();
  await page.waitForURL(/\/seller\/listings\/[0-9a-f-]+$/);
  const publish = page.getByRole("button", { name: "Publish" });
  await expect(publish).toBeDisabled();

  await page.getByLabel(/^Title/).fill("Washed denim trucker jacket");
  await page.getByLabel(/^Category/).selectOption({ label: "Jackets & coats" });
  await page.getByLabel(/^Size on the tag/).fill("M");
  await page.getByLabel("Flat, across one side").check();
  await page.getByLabel(/^Chest/).fill("54");
  await page.getByLabel(/^Length/).fill("66");
  await page.getByText("Good", { exact: true }).click();
  await page.getByLabel("No flaws — I checked the whole item").check();
  await page.getByLabel(/^Price/).fill("1250");

  // Guided photo slots: front, back, label.
  const file = page.locator('input[type="file"]');
  for (const [slot, rgb] of [["Add front", [40, 60, 90]], ["Add back", [50, 70, 100]], ["Add label / size tag", [200, 200, 190]]] as const) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: slot }).click();
    await (await chooser).setFiles(photoFile(`${slot}.png`, [...rgb]));
    await expect(page.getByRole("button", { name: slot })).toHaveCount(0);
  }
  await expect(file).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Ready to publish" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  await publish.click();
  // Publishing opens the live product page.
  await expect(page).toHaveURL(/\/p\/washed-denim-trucker-jacket/);
  await expect(page.getByRole("button", { name: "Buy now · ₹1,250" })).toBeVisible();
  await page.goto("/s/secondloop");
  await expect(page.getByRole("link", { name: /Washed denim trucker jacket/ }).first()).toBeVisible();
});
