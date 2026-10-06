import { reseed, withDb } from "./db";
import { expect, test } from "./fixtures";

// The store and product pages: gallery, reviews, the sticky bar, and the narrow-screen layout.
test.beforeAll(async () => {
  reseed();
  FLAWED = await slugOf("black-zip-off-cargo-pants-strap-detail");
  NIKE = await slugOf("nike-air-force-1-07");
});

// An available piece with exactly one flaw line, so each flaw can be paired with one flaw photo.
let FLAWED = "";
let NIKE = "";

/** Slugs get a random suffix on every seed, so look them up. */
const slugOf = (prefix: string) => withDb(async (sql) => `/p/${(await sql`SELECT slug FROM listings WHERE slug LIKE ${prefix + "-%"}`)[0]!.slug}`);

/** A tiny SVG as a data URI, so photos need no storage. */
const photo = (fill: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="${fill}"/></svg>`).toString("base64")}`;

test("both pages fit a 390 px screen, and the product page has its sticky bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  for (const path of ["/s/secondloop", "/s/secondloop?status=sold-out", "/s/secondloop?status=coming-soon", FLAWED]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await overflow(), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }

  await page.goto(FLAWED);
  const bar = page.getByRole("group", { name: "Actions" });
  await expect(bar.getByRole("button", { name: /^Buy now · ₹/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Add to bag" })).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844); // in view without scrolling
  await page.mouse.wheel(0, 1500);
  await expect(bar.getByRole("button", { name: /^Buy now/ })).toBeInViewport(); // and it stays
});

test("store reviews show three, then more on request", async ({ page }) => {
  await page.goto("/s/secondloop");
  const reviews = page.locator("#reviews article");
  await expect(reviews).toHaveCount(3);
  await page.getByRole("button", { name: "Show more reviews" }).click();
  await expect(reviews).toHaveCount(4); // all of the seeded reviews
  await expect(page.getByRole("button", { name: "Show more reviews" })).toHaveCount(0);
  await expect(reviews.first().getByRole("link", { name: /Bought:/ })).toBeVisible();
});

test("gallery: thumbnails, flaw tag, flaw link and zoom", async ({ page }) => {
  await withDb(async (sql) => {
    const [l] = await sql`SELECT id FROM listings WHERE slug LIKE 'black-zip-off-cargo-pants-strap-detail-%'`;
    await sql`DELETE FROM listing_photos WHERE listing_id = ${l!.id}`;
    const rows = [["FRONT", "#dfe3e6"], ["BACK", "#d8dde1"], ["FLAW", "#d2dae0"]] as const;
    for (const [i, [kind, fill]] of rows.entries()) {
      await sql`INSERT INTO listing_photos (listing_id, url, kind, position) VALUES (${l!.id}, ${photo(fill)}, ${kind}, ${i})`;
    }
  });
  await page.goto(FLAWED);
  const thumbs = page.getByRole("group", { name: "Photos" }).filter({ has: page.getByRole("button", { name: /^Photo 1/ }) });
  await expect(thumbs.getByRole("button")).toHaveCount(3);
  await expect(page.getByText("1 / 3")).toBeVisible();

  await thumbs.getByRole("button", { name: /^Photo 3: Flaw/ }).click();
  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(thumbs.getByRole("button", { name: /^Photo 3/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sticker", { hasText: "Flaw" })).toBeVisible();

  // The flaw list links to the flaw photo.
  await thumbs.getByRole("button", { name: /^Photo 1/ }).click();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.getByRole("button", { name: /^Photo 3 of the flaw/ }).click();
  await expect(page.getByText("3 / 3")).toBeVisible();

  // Tap to zoom opens a full-screen view that moves between photos and closes with Escape.
  await page.getByRole("button", { name: /^Zoom in: Flaw/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Previous photo" }).click();
  await expect(dialog.getByText(/2 \/ 3/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a product shows the protection line, brand note and delivery check states", async ({ page }) => {
  await page.goto(NIKE); // sneakers: the brand is only declared
  await expect(page.getByText("No size returns: check the measurements. Full refund if it isn't as described, arrives damaged, or never arrives.")).toBeVisible();
  await expect(page.getByText("Seller-declared, not authenticated by YOLT.")).toBeVisible();
  await expect(page.getByText("(declared by seller)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Flaws" })).toBeVisible();

  await page.getByRole("button", { name: "Check delivery" }).click();
  await expect(page.getByText("Enter a 6-digit pincode.")).toBeVisible();
  await page.getByLabel("Delivery pincode").fill("411001");
  await page.getByRole("button", { name: "Check delivery" }).click();
  await expect(page.getByText(/Delivers to 411001 in \d–\d days|We can't deliver to 411001 yet/)).toBeVisible();
});

test("units switch between cm and in", async ({ page }) => {
  await page.goto(FLAWED);
  await expect(page.getByText("108 cm")).toBeVisible();
  await page.getByRole("button", { name: "in", exact: true }).click();
  await expect(page.getByText("42.5 in")).toBeVisible(); // 108 cm
  await expect(page.getByText("Measured flat, one side.")).toBeVisible();
});

test("no reviews and an empty pill have their own messages", async ({ page }) => {
  await withDb(async (sql) => {
    await sql`DELETE FROM reviews`;
    await sql`UPDATE listings SET status = 'AVAILABLE', drop_id = NULL WHERE status = 'SCHEDULED'`;
  });
  await page.goto("/s/secondloop?status=coming-soon");
  await expect(page.getByText("Nothing coming soon yet.")).toBeVisible();
  await expect(page.getByText("Follow to hear about the next drop.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveCount(2); // header and empty state
  await expect(page.getByText("No reviews yet").first()).toBeVisible();
  await expect(page.getByText("Reviews come only from buyers who received an order from this store.")).toBeVisible();
});
