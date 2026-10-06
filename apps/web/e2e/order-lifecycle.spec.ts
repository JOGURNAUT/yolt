import { reseed } from "./db";
import { devSignIn, expect, newPhone, otpSignIn, test } from "./fixtures";
import { photoFile } from "./images";

// The core loop, buyer and seller together: sign in from Buy now, address, pay, ship, deliver,
// review, then a not-as-described report that the seller refunds.
test.beforeAll(() => reseed());

test("buy → pay → ship → deliver → review → report → refund", async ({ page, browser, allowConsole }) => {
  allowConsole(/401/); // a guest's Buy now is a 401 that sends them to sign in
  // Buyer: a guest taps Buy now, signs in with a new phone number and lands back on the piece.
  await page.goto("/search?q=baby+tee");
  await page.getByRole("link", { name: /Y2K graphic baby tee/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const productPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Buy now · ₹549" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await otpSignIn(page, "9876543210");
  await expect(page).toHaveURL((url) => url.pathname === productPath);

  // Reserve it, then add a first address.
  await page.getByRole("button", { name: "Buy now · ₹549" }).click();
  await page.waitForURL(/\/checkout\//);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Reserved for you for")).toBeVisible();
  await page.getByLabel("Full name").fill("Ananya Rao");
  await page.getByLabel("Mobile number (for the courier)").fill("9876543210");
  await page.getByLabel("Flat / house no., building, street").fill("Flat 12, Sunrise Apartments");
  await page.getByLabel("Area, locality (optional)").fill("Koregaon Park");
  await page.getByLabel("Pincode").fill("411001");
  await page.getByLabel("City / town").fill("Pune");
  await page.getByLabel("State").selectOption("Maharashtra");
  await page.getByRole("button", { name: "Deliver here" }).click();
  await expect(page.getByText("Deliver to Ananya Rao")).toBeVisible();

  // Pay through the sandbox gateway (it sends a signed webhook through the real webhook path).
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByRole("button", { name: "Approve payment" }).click();
  await expect(page.getByRole("heading", { name: /Order confirmed/ })).toBeVisible();

  // The piece is gone for everyone else.
  const other = await newPhone(browser);
  await other.page.goto(productPath);
  await expect(other.page.getByRole("button", { name: /^Buy now/ })).toHaveCount(0);

  // Seller: books the pickup, then the dev courier scans it through to delivery.
  const seller = await newPhone(browser);
  await devSignIn(seller.page, "Second Loop (demo seller)", `/seller/orders/${orderId}`);
  await expect(seller.page.getByText("Flat 12, Sunrise Apartments")).toBeVisible(); // address shown after payment
  await seller.page.getByRole("button", { name: "Packed — book pickup" }).click();
  for (let i = 0; i < 4; i++) {
    await seller.page.getByRole("button", { name: "Dev: next courier scan" }).click();
    await seller.page.waitForLoadState("networkidle");
  }
  await expect(seller.page.getByText(/Delivered/).first()).toBeVisible();

  // Buyer: reviews the piece; the review shows on the store page with the item bought.
  await page.goto(`/orders/${orderId}`);
  // The star radios are visually hidden behind their star glyphs, so check them directly.
  await page.getByRole("group", { name: "Overall" }).getByRole("radio", { name: "5 stars" }).check({ force: true });
  await page.getByRole("group", { name: /Matched the listing/ }).getByRole("radio", { name: "5 stars" }).check({ force: true });
  await page.getByPlaceholder(/How was the fit/).fill("Exactly as described, packed so well!");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("button", { name: "Post review" })).toHaveCount(0);
  await page.goto("/s/secondloop");
  await expect(page.getByText("Exactly as described, packed so well!")).toBeVisible();

  // Buyer: reports a problem with a photo.
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Report a problem" }).click();
  await page.getByLabel(/Not as described/).check();
  await page.getByLabel("What's wrong?").fill("There's a stain on the back that wasn't in the photos.");
  await page.locator('form input[type="file"]').setInputFiles(photoFile("stain.png", [180, 160, 140]));
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Waiting for the seller to respond.")).toBeVisible();

  // Seller: accepts, and the buyer sees the full refund.
  await seller.page.reload();
  await expect(seller.page.getByText(/Buyer reported a problem: Not as described/)).toBeVisible();
  seller.page.once("dialog", (d) => d.accept());
  await seller.page.getByRole("button", { name: "Accept and refund" }).click();
  await expect(seller.page.getByText("You refunded the buyer.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Resolved: you've been refunded in full.")).toBeVisible();

  await other.context.close();
  await seller.context.close();
});
