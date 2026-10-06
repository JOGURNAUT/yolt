import { reseed, withDb } from "./db";
import { expect, test } from "./fixtures";

// A card's hover shows the piece's BACK photo, on every page that lists cards, and nothing else.
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const photo = (fill: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="${fill}"/></svg>`).toString("base64")}`;

test.beforeAll(async () => {
  reseed();
  await withDb(async (sql) => {
    const [l] = await sql<{ id: string }[]>`SELECT id FROM listings WHERE title LIKE 'Y2K graphic%'`;
    await sql`DELETE FROM listing_photos WHERE listing_id = ${l!.id}`;
    // Cover, then a DETAIL, then the BACK: the hover has to pick the BACK, not simply the second photo.
    for (const [i, [kind, fill]] of ([["FRONT", "#dfe3e6"], ["DETAIL", "#aa3333"], ["BACK", "#33aa33"]] as const).entries()) {
      await sql`INSERT INTO listing_photos (listing_id, url, kind, position) VALUES (${l!.id}, ${photo(fill)}, ${kind}, ${i})`;
    }
    // A piece with no BACK photo at all.
    const [n] = await sql<{ id: string }[]>`SELECT id FROM listings WHERE title LIKE 'Nike Air%'`;
    await sql`DELETE FROM listing_photos WHERE listing_id = ${n!.id}`;
    await sql`INSERT INTO listing_photos (listing_id, url, kind, position) VALUES (${n!.id}, ${photo("#dfe3e6")}, 'FRONT', 0), (${n!.id}, ${photo("#aa3333")}, 'DETAIL', 1)`;
  });
});

const backOf = (card: import("@playwright/test").Locator) => card.locator(".shot.back img");

for (const [name, path] of [["the store page", "/s/secondloop"], ["search results", "/search?q=tee"], ["the landing page", "/"]] as const) {
  test(`hover shows the BACK photo on ${name}`, async ({ page }) => {
    await page.goto(path);
    const card = page.locator(".pc", { hasText: "Y2K graphic baby tee" }).first();
    await expect(backOf(card)).toHaveAttribute("src", /^data:image\/svg\+xml/);
    const src = await backOf(card).getAttribute("src");
    expect(Buffer.from(src!.split(",")[1]!, "base64").toString()).toContain("#33aa33"); // the BACK, not the DETAIL
  });
}

test("a piece with no BACK photo has nothing to swap to", async ({ page }) => {
  await page.goto("/s/secondloop");
  const card = page.locator(".pc", { hasText: "Nike Air Force" }).first();
  await expect(card).toBeVisible();
  await expect(card.locator(".shot.back")).toHaveCount(0);
});
