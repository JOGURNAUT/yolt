import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

test.beforeAll(() => reseed());

const phone = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("sign-in: invalid number, wrong code with tries left, resend countdown, SMS fallback, sheet", async ({ page, allowConsole }) => {
  allowConsole(/401/);
  await page.goto("/login?next=/bag");
  await expect(page.getByText("Sign in to check out")).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByLabel("Mobile number").fill("98765");
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
  await expect(page.getByText("Enter a valid 10-digit mobile number.")).toBeVisible();

  await page.getByLabel("Mobile number").fill(phone());
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
  await expect(page.getByText("Development: your code is")).toBeVisible();
  await expect(page.getByText(/Resend in 0:\d\d/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send by SMS instead" })).toBeDisabled();
  await noHorizontalScroll(page);

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/That code didn't match\. 4 tries left\./)).toBeVisible();
});

test("sign-in opens as a sheet from Buy now and closes back to the piece", async ({ page, allowConsole }) => {
  allowConsole(/401/);
  await page.goto("/search?q=baby+tee");
  await page.getByRole("link", { name: /Y2K graphic baby tee/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const path = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Buy now · ₹549" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sign in to buy this piece")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL((u) => u.pathname === path);
});

test("bag: unavailable pieces say why and offer Remove and Find similar; checkout expiry and leaving", async ({ page, browser }) => {
  const listings = await withDb((sql) => sql<{ id: string }[]>`SELECT l.id FROM listings l JOIN sellers s ON s.id = l.seller_id WHERE s.handle = 'secondloop' AND l.status = 'AVAILABLE' ORDER BY l.created_at LIMIT 3`);
  await withDb((sql) => sql`DELETE FROM bag_items`);
  await devSignIn(page, "Ananya (demo buyer)", "/bag");
  await expect(page.getByText("Your bag is empty.")).toBeVisible();
  await noHorizontalScroll(page);

  for (const l of listings) await page.request.post("/api/bag", { data: { listingId: l.id } });
  await withDb(async (sql) => {
    await sql`UPDATE listings SET status = 'RESERVED', current_hold_id = gen_random_uuid() WHERE id = ${listings[1]!.id}`;
    await sql`UPDATE listings SET status = 'SOLD' WHERE id = ${listings[2]!.id}`;
  });
  await page.goto("/bag");
  await expect(page.getByText("Items in your bag aren't reserved. Unique pieces can sell.")).toBeVisible();
  await expect(page.getByText("Reserved right now")).toBeVisible();
  await expect(page.getByText("Sold to another buyer")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find similar" })).toBeVisible();
  await noHorizontalScroll(page);
  await withDb((sql) => sql`UPDATE listings SET status = 'AVAILABLE', current_hold_id = NULL WHERE id IN ${sql([listings[1]!.id, listings[2]!.id])}`);

  // Checkout: leave, then see the left-checkout screen.
  await page.goto("/bag");
  await page.getByRole("button", { name: /Check out from Second Loop/ }).click();
  await page.waitForURL(/\/checkout\//);
  const checkoutUrl = page.url();
  await expect(page.getByText("Reserved for you for")).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Leave checkout and release the item" }).click();
  await expect(page.getByText("You left checkout. The piece is back in stock.")).toBeVisible();
  await noHorizontalScroll(page);

  // A reservation that ran out.
  await page.goto("/bag");
  await page.getByRole("button", { name: /Check out from Second Loop/ }).click();
  await page.waitForURL(/\/checkout\//);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  expect(page.url()).not.toBe(checkoutUrl);
  await withDb((sql) => sql`UPDATE holds SET expires_at = now() - interval '1 minute' WHERE order_id = ${orderId}`);
  await page.reload();
  await expect(page.getByText("Your reservation ran out, so the piece went back on sale.")).toBeVisible();
  await noHorizontalScroll(page);
  void browser;
});

test("late dispatch cancel, orders pages and claim withdraw", async ({ page, allowConsole }) => {
  allowConsole(/.*/);
  await devSignIn(page, "Kabir (demo buyer)", "/orders");
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await noHorizontalScroll(page);

  // Arrange a paid, overdue order for Kabir straight in the database.
  const orderId = await withDb(async (sql) => {
    const [buyer] = await sql`SELECT id FROM users WHERE name ILIKE 'Kabir%' LIMIT 1`;
    const [seller] = await sql`SELECT id FROM sellers WHERE handle = 'secondloop'`;
    const [listing] = await sql`SELECT id, title, category, tag_size, condition, measurements FROM listings WHERE seller_id = ${seller!.id} AND status = 'AVAILABLE' LIMIT 1`;
    const [o] = await sql`INSERT INTO orders (reference, buyer_id, seller_id, status, subtotal_paise, shipping_paise, total_paise, dispatch_by, confirmed_at, shipping_address)
      VALUES ('YL-E2E001', ${buyer!.id}, ${seller!.id}, 'CONFIRMED', 54900, 0, 54900, now() - interval '4 days', now() - interval '6 days',
      ${sql.json({ name: "Kabir", phone: "9000000000", line1: "12 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" })}) RETURNING id`;
    await sql`INSERT INTO order_items (order_id, listing_id, price_paise, snapshot, allocated)
      VALUES (${o!.id}, ${listing!.id}, 54900, ${sql.json({ title: listing!.title, category: listing!.category, brandDeclared: null, tagSize: listing!.tag_size, measurements: {}, condition: listing!.condition, flaws: null, photoUrl: null })}, false)`;
    return o!.id as string;
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Late to ship")).toBeVisible();
  await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("/orders");
  await expect(page.getByText("YL-E2E001")).toBeVisible();
  await page.goto(`/orders/${orderId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel and refund me" }).click();
  await expect(page.getByText(/Cancelled\. Refund of ₹549 started\./)).toBeVisible();

  // Claim withdraw on a delivered order.
  await withDb(async (sql) => {
    await sql`UPDATE orders SET status = 'DELIVERED', cancelled_at = NULL, shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 hour' WHERE id = ${orderId}`;
    const [o] = await sql`SELECT buyer_id, seller_id FROM orders WHERE id = ${orderId}`;
    await sql`INSERT INTO claims (order_id, buyer_id, seller_id, reason, description, status) VALUES (${orderId}, ${o!.buyer_id}, ${o!.seller_id}, 'NOT_AS_DESCRIBED', 'A stain that was not shown in the photos.', 'OPEN')`;
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Waiting for the seller to respond.")).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: /^Withdraw/ }).click();
  await expect(page.getByText("You withdrew this report.")).toBeVisible();
});

test("buyer protection page and empty states fit a phone", async ({ page }) => {
  await page.goto("/legal/buyer-protection");
  await expect(page.getByText("No size returns: check the measurements. Full refund if it isn't as described, arrives damaged, or never arrives.")).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("/bag");
  await noHorizontalScroll(page);
});

