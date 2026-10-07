import type { Page } from "@playwright/test";
import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// The landing page (boards Main and WebHome): hero carousel, Trending, the first-screen budget.
test.beforeAll(async () => {
  reseed();
  // The seeded drop is a few days out; pin it so the drop slide and ticker are predictable.
  await withDb(async (sql) => {
    await sql`UPDATE drops SET starts_at = now() + interval '3 days', status = 'SCHEDULED' WHERE title = 'Winter Vintage Drop'`;
    // The second store's drop is always later, so the hero's drop slide is the Winter one.
    await sql`UPDATE drops SET starts_at = now() + interval '5 days' WHERE title = 'Vintage biker collection'`;
  });
});

const hero = (page: Page) => page.getByRole("region", { name: "Featured" });
const slides = (page: Page) => hero(page).getByRole("button", { name: /^Go to slide/ });

test.describe("phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("first screen: about 55% hero, then Trending with the first two images in view", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page)).toBeVisible();
    const box = (await hero(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844 * 0.6);

    const trending = page.getByRole("region", { name: /Just dropped|Trending now/ });
    await expect(trending.getByRole("heading")).toBeVisible();
    const photos = trending.locator(".ph");
    for (const i of [0, 1]) {
      const b = (await photos.nth(i).boundingBox())!;
      expect(b.y).toBeGreaterThan(box.y + box.height);
      // above the 68 px bottom nav, so the whole image is on screen
      expect(b.y + b.height).toBeLessThanOrEqual(844 - 68);
    }
  });

  test("no horizontal scroll, as guest and signed in", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/dev?next=/");
    await page.getByRole("button", { name: "Ananya (demo buyer)" }).click();
    await expect(page.getByRole("heading", { name: /^Hey Ananya$/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("hero: segments move between slides, the arrow keys too, and pause holds the slide", async ({ page }) => {
    await page.goto("/");
    // brand, drop, store, seller-or-edit, fit. Web-first, because the carousel is still hydrating when the page loads.
    await expect(slides(page)).toHaveCount(5);
    const slide = (n: number) => hero(page).getByRole("button", { name: new RegExp(`^Go to slide ${n}:`) });
    await expect(slide(1)).toHaveAttribute("aria-current", "true");

    await slide(2).click();
    await expect(slide(2)).toHaveAttribute("aria-current", "true");
    // Slide 2 is the drop: a ticking countdown on the server's clock and Remind me.
    await expect(hero(page).getByRole("timer", { name: /^Opens in 2 days/ })).toBeVisible();
    await expect(hero(page).getByRole("button", { name: "Remind me" })).toBeVisible();
    // The store behind the drop is named and links to its page.
    await expect(hero(page).getByRole("link", { name: "Second Loop" })).toHaveAttribute("href", "/s/secondloop");

    await hero(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(slide(3)).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(slide(1)).toHaveAttribute("aria-current", "true");

    await hero(page).getByRole("button", { name: "Pause slideshow" }).click();
    await expect(hero(page).getByRole("button", { name: "Play slideshow" })).toBeVisible();
    await page.waitForTimeout(7000); // longer than one 6 s turn
    await expect(slide(1)).toHaveAttribute("aria-current", "true");
  });

  test("the carousel and its cards have square corners", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page)).toBeVisible();
    expect(await hero(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");
    // The brand slide's photo cards (placeholders when a piece has no photo) are square too.
    const photos = hero(page).locator(".ph");
    for (let i = 0; i < Math.min(await photos.count(), 3); i++) {
      expect(await photos.nth(i).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");
    }
  });

  test("hero autoplays every 6 seconds", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page).getByRole("button", { name: /^Go to slide 2:/ })).toHaveAttribute("aria-current", "true", { timeout: 12_000 });
  });

  test("Trending says what it is: just dropped until pieces have enough saves, then most saved", async ({ page }) => {
    await page.goto("/");
    // Role queries skip the hidden copy the loading skeleton streams in first; getByText would see both.
    await expect(page.getByRole("heading", { name: "Just dropped" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Just dropped" }).getByText("Newest pieces first")).toBeVisible();
    await expect(page.getByText("Trending", { exact: true })).toHaveCount(0);

    // Three buyers saving each of four pieces tips it into trending mode.
    await withDb(async (sql) => {
      const users = [];
      for (const n of [1, 2, 3]) {
        const [u] = await sql<{ id: string }[]>`INSERT INTO users (phone) VALUES (${`+9190000009${n}0`}) RETURNING id`;
        users.push(u!.id);
      }
      const pieces = await sql<{ id: string }[]>`SELECT id FROM listings WHERE status = 'AVAILABLE' ORDER BY created_at LIMIT 4`;
      for (const u of users) for (const p of pieces) await sql`INSERT INTO saved_items (user_id, listing_id) VALUES (${u}, ${p.id})`;
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Trending now" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Trending now" }).getByText("Most saved this week")).toBeVisible();
    await expect(page.getByText("Trending", { exact: true }).first()).toBeVisible();
    await withDb((sql) => sql`DELETE FROM saved_items`);
  });

  test("shop your size links to the normal search", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#shop-your-size");
    await card.getByRole("button", { name: "L", exact: true }).click();
    await card.getByRole("link", { name: "Measured pieces that fit" }).click();
    await expect(page).toHaveURL(/\/search\?size=L$/);
  });

  test("preferences: set sizes from the signed-in home and see pieces in them", async ({ page }) => {
    await devSignIn(page, "Ananya (demo buyer)");
    await page.getByRole("link", { name: /Set your sizes/ }).click();
    await expect(page).toHaveURL(/\/preferences$/);
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Show my feed" }).click();
    await expect(page.getByRole("heading", { name: "In your sizes" })).toBeVisible();
    await expect(page.getByText("M", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit sizes" })).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("the carousel does not autoplay and offers Play", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page).getByRole("button", { name: "Play slideshow" })).toBeVisible();
    await page.waitForTimeout(7000);
    await expect(hero(page).getByRole("button", { name: /^Go to slide 1:/ })).toHaveAttribute("aria-current", "true");
  });
});

test.describe("desktop, 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("hero: arrows, dots and pause; the Grails rail sits beside it", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page).getByRole("button", { name: "Next slide" })).toBeVisible();
    await hero(page).getByRole("button", { name: "Next slide" }).click();
    await expect(hero(page).getByRole("button", { name: /^Slide 2:/ })).toHaveAttribute("aria-current", "true");
    await hero(page).getByRole("button", { name: "Previous slide" }).click();
    await expect(hero(page).getByRole("button", { name: /^Slide 1:/ })).toHaveAttribute("aria-current", "true");
    await hero(page).getByRole("button", { name: "Pause slideshow" }).click();
    await expect(hero(page).getByRole("button", { name: "Play slideshow" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = (await hero(page).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(440);
  });
});
