import { reseed } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// Guest browsing and access rules. Every public page must render without browser errors.
test.beforeAll(() => reseed());

test("store page: pills switch between in stock, sold out and coming soon, kept in the URL", async ({ page }) => {
  await page.goto("/s/secondloop");
  await expect(page.getByRole("heading", { name: "Second Loop" })).toBeVisible();
  const pills = page.getByRole("navigation", { name: "Filter by availability" });

  await expect(page.locator('a[href^="/p/"]').first()).toBeVisible();
  await pills.getByRole("link", { name: /Sold out/ }).click();
  await expect(page).toHaveURL(/status=sold-out/);
  await expect(page.getByText("Sold out", { exact: true }).first()).toBeVisible();

  await pills.getByRole("link", { name: /Coming soon/ }).click();
  await expect(page).toHaveURL(/status=coming-soon/);
  await expect(page.locator('a[href^="/p/"]')).toHaveCount(3); // the seeded drop's pieces
});

test("product pages: available can be bought, sold out and coming soon can't", async ({ page }) => {
  await page.goto("/s/secondloop");
  await page.locator('a[href^="/p/"]').first().click();
  await expect(page.getByRole("button", { name: /^Buy now · ₹/ })).toBeVisible();
  await expect(page.getByText("No size returns: check the measurements.")).toBeVisible();

  await page.goto("/s/secondloop?status=sold-out");
  await page.locator('a[href^="/p/"]').first().click();
  await expect(page.getByText("Sold out. This piece found a home.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Buy now/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Find similar pieces" })).toBeVisible();

  await page.goto("/s/secondloop?status=coming-soon");
  await page.locator('a[href^="/p/"]').first().click();
  await expect(page.getByText(/Coming soon in Winter Vintage Drop/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Buy now/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Go to the drop" }).click();
  await expect(page.getByText("Opens in")).toBeVisible();
});

test("search finds pieces, tolerates typos, and filters by measurements", async ({ page }) => {
  await page.goto("/search?q=levis");
  await expect(page.getByRole("link", { name: /Vintage Levi's 501 jeans/ }).first()).toBeVisible();

  await page.goto("/search?q=carhart"); // missing a "t"
  await expect(page.getByRole("link", { name: /Carhartt workwear jacket/ }).first()).toBeVisible();

  await page.goto("/search?q=zzzz-nothing-matches");
  await expect(page.locator('a[href^="/p/"]')).toHaveCount(0);
});

for (const path of ["/", "/drops", "/sell", "/legal/terms", "/legal/privacy", "/legal/buyer-protection", "/legal/grievance"]) {
  test(`renders ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible();
  });
}

test("staff and seller areas stay closed to others", async ({ page, allowConsole }) => {
  allowConsole(/404/); // the admin area answers 404 on purpose
  // Guests: the admin area doesn't exist for them, the seller area asks them to sign in.
  expect((await page.goto("/admin"))?.status()).toBe(404);
  await page.goto("/seller/listings");
  await expect(page).toHaveURL(/\/login\?next=%2Fseller/);

  // A buyer who isn't a seller is sent to "Sell on YOLT"; admin is still a 404.
  await devSignIn(page, "Kabir (demo buyer)");
  await page.goto("/seller/listings");
  await expect(page).toHaveURL(/\/sell$/);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});
