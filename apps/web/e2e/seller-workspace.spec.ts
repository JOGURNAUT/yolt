import { reseed } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// The seller workspace beyond the listing flow: tabs, confirm dialogs, checklist, settings, payouts,
// the apply form and a phone-width check on every page.
test.beforeAll(() => reseed());

test("listings: tabs with counts, and Sold elsewhere asks first", async ({ page }) => {
  await devSignIn(page, "Second Loop (demo seller)", "/seller/listings");
  const tabs = page.getByRole("navigation", { name: "Listing status" });
  await expect(tabs.getByRole("link", { name: /^Live \d+/ })).toBeVisible();
  await tabs.getByRole("link", { name: /^Drafts/ }).click();
  await expect(page).toHaveURL(/tab=draft/);
  await page.goto("/seller/listings");

  const sold = page.getByRole("button", { name: /^Sold elsewhere: / }).first();
  await sold.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Mark sold elsewhere?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();

  await sold.click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as sold" }).click();
  await expect(page.getByText("Marked as sold elsewhere.")).toBeVisible();
});

test("editor: the checklist shows the real messages", async ({ page }) => {
  await devSignIn(page, "Second Loop (demo seller)", "/seller/listings");
  await page.getByRole("button", { name: "New listing" }).click();
  await page.waitForURL(/\/seller\/listings\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Before you publish" })).toBeVisible();
  await page.getByRole("button", { name: /things? left/ }).first().click();
  await expect(page.getByText("Add a front photo.")).toBeVisible();
  await expect(page.getByText("Describe any flaws, or tick “No flaws” to confirm there are none.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Publish/ })).toBeDisabled();
});

test("store settings save and persist", async ({ page }) => {
  await devSignIn(page, "Second Loop (demo seller)", "/seller/store");
  const bio = `Washed and steamed, shipped fast ${Date.now() % 1000}`;
  await page.getByLabel("Bio").fill(bio);
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bio")).toHaveValue(bio);
});

test("payouts show balances and the pilot commission", async ({ page }) => {
  await devSignIn(page, "Second Loop (demo seller)", "/seller/payouts");
  await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
  const balances = page.getByRole("region", { name: "Balances" });
  for (const k of ["Pending", "Available", "Paid out"]) await expect(balances.getByText(k, { exact: true })).toBeVisible();
  await expect(page.getByText(/Pilot: no commission/).first()).toBeVisible();
});

test("apply to sell: errors, a valid application, then the same phone again", async ({ page }) => {
  const n = String(Date.now()).slice(-7);
  const phone = `98${n}1`.slice(0, 10);
  await page.goto("/sell");
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByText("Enter your store name (2 to 80 characters).")).toBeVisible();
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toBeVisible();

  const fill = async (handle: string) => {
    await page.getByLabel("Store name").fill("Test Thrift Co");
    await page.getByLabel("Instagram handle").fill(handle);
    await page.getByLabel("City you ship from").fill("Pune");
    await page.getByLabel("What you sell").fill("Vintage denim and jackets");
    await page.getByLabel("Pieces you sell in a month").selectOption({ label: "Under 20 pieces a month" });
    await page.getByLabel("Mobile number (WhatsApp)").fill(phone);
    await page.getByRole("button", { name: "Send application" }).click();
  };
  await fill(`@testthrift${n}`);
  await expect(page.getByRole("heading", { name: "Thanks, we have your application." })).toBeVisible();
  await expect(page.getByText("We'll message you on WhatsApp within 1 working day.")).toBeVisible();

  await page.goto("/sell");
  await fill(`@testthrift${n}`);
  await expect(page.getByRole("heading", { name: "We already have your application." })).toBeVisible();
});

test("no horizontal scroll at 390 on every seller page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devSignIn(page, "Second Loop (demo seller)", "/seller");
  await page.getByRole("button", { name: "New listing" }).first().click();
  await page.waitForURL(/\/seller\/listings\/[0-9a-f-]+$/);
  const editor = new URL(page.url()).pathname;

  await page.goto("/seller/orders");
  const orderLink = page.getByRole("list").last().getByRole("link").first();
  const order = (await orderLink.count()) ? await orderLink.getAttribute("href") : null;

  const paths = ["/seller", "/seller/listings", editor, "/seller/drops", "/seller/orders", "/seller/reviews", "/seller/payouts", "/seller/store", "/sell", ...(order ? [order] : [])];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
