import { reseed } from "./db";
import { expect, test } from "./fixtures";

// Browse pages use the width of the screen (product grids 5 across at 1920 px); text pages stay a
// readable column. Nothing may scroll sideways at any width.
test.beforeAll(() => reseed());

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1024, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** The body clips sideways overflow, so also check that the page's own blocks sit inside the screen. */
async function overflowing(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll("header, main, footer, .page-wide, .shelf, .shelf-row, [aria-roledescription=carousel]")) {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > w + 1) out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return [document.documentElement.scrollWidth > w ? "page scrolls sideways" : "", ...out].filter(Boolean);
  });
}

const BROWSE = ["/", "/s/secondloop", "/search?sort=newest", "/drops", "/saved", "/legal/terms", "/login", "/bag"];

for (const size of WIDTHS) {
  test(`no horizontal scroll at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const path of BROWSE) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await overflowing(page), `${path} at ${size.width}px`).toEqual([]);
    }
    await page.goto("/search?sort=newest");
    const product = await page.getByRole("link", { name: /Y2K graphic baby tee/ }).first().getAttribute("href");
    await page.goto(product!);
    expect(await overflowing(page), `product at ${size.width}px`).toEqual([]);
  });
}

async function columns(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
}

test("product grids run 5 across and edge to edge at 1920px, 2 across on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/s/secondloop");
  expect(await columns(page, ".shelf")).toBeGreaterThan(4);
  const box = await page.locator(".shelf").first().boundingBox();
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.x + box!.width).toBeGreaterThanOrEqual(1919);

  await page.goto("/");
  expect(await columns(page, ".shelf")).toBeGreaterThan(4); // Fresh finds

  // Beside the filter sidebar the grid takes the rest of the width.
  await page.goto("/search?sort=newest");
  expect(await columns(page, ".shelf")).toBeGreaterThan(4);
  const sidebar = await page.locator("aside").first().boundingBox();
  expect(sidebar!.width).toBeLessThan(300);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/s/secondloop");
  expect(await columns(page, ".shelf")).toBe(2);
});

test("form and text pages stay a readable column on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const path of ["/legal/terms", "/login"]) {
    await page.goto(path);
    const box = await page.locator("main > *").first().boundingBox();
    expect(box!.width, path).toBeLessThanOrEqual(1248);
  }
});
