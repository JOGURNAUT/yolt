import { reseed } from "./db";
import { expect, test } from "./fixtures";

// The demo store's newest piece carries a seller's description; a buyer has to be able to read it.
test.beforeAll(() => reseed());

test("the seller's description shows on the product page, after the facts", async ({ page }) => {
  await page.goto("/search?q=cargo");
  await page.getByRole("link", { name: /Black zip-off cargo pants/ }).first().click();
  const about = page.getByRole("region", { name: "About this piece" });
  await expect(about).toContainText("legs that zip off at the knee");

  // Facts first: condition, measurements and flaws come before the seller's words.
  const y = async (name: string) => (await page.getByRole("region", { name }).boundingBox())!.y;
  expect(await y("Condition")).toBeLessThan(await y("About this piece"));
  expect(await y("Flaws")).toBeLessThan(await y("About this piece"));
});
