import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// Search and filters, the drops list and drop page states, saved tabs, the account page. Phone viewport.
test.beforeAll(() => reseed());

const noOverflow = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test("search: filter sheet, chips, sort, stores tab, explore", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Explore", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /^Jeans/ }).first().click();
  await expect(page).toHaveURL(/cat=jeans/);
  await expect(page.getByRole("link", { name: "Remove filter: Jeans" })).toBeVisible();

  await page.goto("/search?q=vintage");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Jackets & coats").check();
  await sheet.getByLabel("Maximum price, rupees").fill("3000");
  await expect(sheet.getByRole("button", { name: /^Show \d+ pieces?$/ })).toBeVisible();
  await sheet.getByRole("button", { name: /^Show \d+ pieces?$/ }).click();
  await expect(page).toHaveURL(/cat=jackets/);
  await expect(page).toHaveURL(/price=-3000/);
  await expect(page.getByRole("link", { name: "Remove filter: Under ₹3,000" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Remove filter: Jackets & coats" }).first().click();
  await expect(page).not.toHaveURL(/cat=/);

  // Zero results: chips with what each gives back, and Clear all.
  await page.goto("/search?q=levis&cat=jackets&size=XS");
  await expect(page.getByText("No pieces match all your filters.")).toBeVisible();
  await page.getByRole("link", { name: "Clear all filters" }).click();
  await expect(page).not.toHaveURL(/size=/);

  // Typo note, then the Stores tab.
  await page.goto("/search?q=carhatt");
  await expect(page.getByText("Showing results for")).toBeVisible();
  await page.getByRole("tab", { name: /^Stores/ }).click();
  await expect(page.getByRole("tabpanel", { name: /Stores/ })).toBeVisible();
  await noOverflow(page);
});

test("drops list and drop page states", async ({ page, allowConsole }) => {
  allowConsole(/409/);
  const id = await withDb(async (sql) => {
    const [d] = await sql<{ id: string }[]>`SELECT id FROM drops WHERE title = 'Winter Vintage Drop'`;
    await sql`UPDATE drops SET starts_at = now() + interval '3 days', status = 'SCHEDULED', opened_at = NULL WHERE id = ${d!.id}`;
    await sql`UPDATE listings SET status = 'SCHEDULED' WHERE drop_id = ${d!.id}`;
    return d!.id;
  });

  await page.goto("/drops");
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("link", { name: "Preview" }).first().click();
  await expect(page.getByRole("heading", { name: "Winter Vintage Drop", level: 1 })).toBeVisible();
  await expect(page.getByRole("timer", { name: /Drop opens in/ })).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(3);
  await noOverflow(page);

  // Live, signed out: Claim sends to sign-in.
  await withDb(async (sql) => {
    await sql`UPDATE drops SET starts_at = now() - interval '5 minutes', status = 'LIVE', opened_at = now() WHERE id = ${id}`;
    await sql`UPDATE listings SET status = 'AVAILABLE' WHERE drop_id = ${id}`;
  });
  await page.goto(`/d/${id}`);
  await expect(page.getByText("The drop is open. First to claim gets 5 minutes to pay.")).toBeVisible();
  await page.getByRole("button", { name: "Claim" }).first().click();
  await expect(page).toHaveURL(/\/login\?next=/);

  // Signed in: claim, then the Pay now bar and Reserved badge show.
  await devSignIn(page, "Kabir (demo buyer)", `/d/${id}`);
  await page.getByRole("button", { name: "Claim" }).first().click();
  await page.waitForURL(/\/checkout\//);
  await page.goto(`/d/${id}`);
  await expect(page.getByRole("link", { name: "Pay now" })).toBeVisible();
  await expect(page.getByText("Reserved", { exact: true }).first()).toBeVisible();

  // Ended and cancelled.
  await withDb(async (sql) => {
    await sql`UPDATE drops SET status = 'ENDED' WHERE id = ${id}`;
    await sql`UPDATE listings SET status = 'SOLD', sold_at = now(), current_hold_id = NULL WHERE drop_id = ${id}`;
  });
  await page.goto(`/d/${id}`);
  await expect(page.getByText(/This drop has ended/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Follow Second Loop for the next one/ })).toBeVisible();
  await page.goto("/drops");
  await expect(page.getByRole("heading", { name: "Recently ended" })).toBeVisible();

  await withDb((sql) => sql`UPDATE drops SET status = 'CANCELLED' WHERE id = ${id}`);
  await page.goto(`/d/${id}`);
  await expect(page.getByText("This drop was cancelled")).toBeVisible();
});

test("saved tabs, account page, addresses and signing out of other devices", async ({ page, browser, baseURL }) => {
  reseed();
  await page.goto("/saved");
  await expect(page.getByText("Saved on this device.")).toBeVisible();

  await devSignIn(page, "Ananya (demo buyer)");
  await page.goto("/saved");
  await page.getByRole("link", { name: /^Following/ }).click();
  await expect(page).toHaveURL(/tab=following/);
  await expect(page.getByRole("link", { name: /^Pieces/ })).toBeVisible();

  // The Profile tab opens /account.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "More" }).getByRole("link", { name: /Sell on YOLT/ })).toBeVisible();
  await noOverflow(page);

  // Addresses: add, make default, delete.
  await page.getByRole("link", { name: /^Addresses/ }).click();
  await expect(page).toHaveURL(/\/account\/addresses$/);
  await page.getByRole("button", { name: "Add an address" }).click();
  await page.getByLabel("Full name").fill("Ananya Rao");
  await page.getByLabel("Mobile number (for the courier)").fill("9876543210");
  await page.getByLabel("Flat / house no., building, street").fill("12 Park Street");
  await page.getByLabel("Pincode").fill("403001");
  await page.getByLabel("City / town").fill("Panaji");
  await page.getByLabel("State").selectOption("Goa");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("12 Park Street")).toBeVisible();
  await expect(page.getByText("Default", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Delete address for/ }).click();
  await page.getByRole("button", { name: "Delete address", exact: true }).click();
  await expect(page.getByText("No saved addresses")).toBeVisible();

  // A second device signs in, then the first signs it out.
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await devSignIn(otherPage, "Ananya (demo buyer)");
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out of other devices" }).click();
  await expect(page.getByText(/Signed out of 1 other device/)).toBeVisible();
  await otherPage.goto("/account");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();

  // Last, because the dev sign-in lists accounts by name.
  await page.getByRole("button", { name: "Edit name" }).click();
  await page.getByLabel("Your name").fill("Ananya R");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Ananya R", { exact: true })).toBeVisible();
});
