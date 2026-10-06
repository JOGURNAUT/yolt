import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { reseed, withDb } from "./db";
import { devSignIn, expect, newPhone, test } from "./fixtures";

// WCAG 2.x A and AA on every buyer page, in light and dark, on a phone and on a desktop canvas.
// Pages that need a state (reserved, withdrawn, a drop before/live/ended) get it from the database.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
  }));
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

type Spec = { name: string; path: () => string; as?: "buyer" };
let slugs: Record<"avail" | "soon" | "sold" | "reserved" | "withdrawn", string>;
let dropId = "";

test.beforeAll(async ({ browser }) => {
  reseed();
  await withDb(async (sql) => {
    const slug = async (title: string) => (await sql<{ slug: string }[]>`SELECT slug FROM listings WHERE title ILIKE ${title}`)[0]!.slug;
    slugs = {
      avail: await slug("Vintage Levi%"),
      soon: await slug("Flannel%"),
      sold: (await sql<{ slug: string }[]>`SELECT slug FROM listings WHERE status = 'SOLD' LIMIT 1`)[0]!.slug,
      reserved: await slug("Nike Air%"),
      withdrawn: await slug("Corduroy%"),
    };
    dropId = (await sql<{ id: string }[]>`SELECT id FROM drops LIMIT 1`)[0]!.id;
    await sql`UPDATE listings SET status = 'WITHDRAWN' WHERE slug = ${slugs.withdrawn}`;
  });
  // Someone else holds the Nikes.
  const other = await newPhone(browser);
  await devSignIn(other.page, "Kabir (demo buyer)");
  await other.page.goto(`/p/${slugs.reserved}`);
  await other.page.getByRole("button", { name: /^Buy now/ }).click();
  await other.page.waitForURL(/\/checkout\//);
  await other.context.close();
});

const setDrop = (status: "SCHEDULED" | "LIVE" | "ENDED") =>
  withDb(
    (sql) =>
      status === "SCHEDULED"
        ? sql`UPDATE drops SET status = 'SCHEDULED', starts_at = now() + interval '3 days' WHERE id = ${dropId}`
        : sql`UPDATE drops SET status = ${status}, starts_at = now() - interval '1 hour' WHERE id = ${dropId}`,
  );

const pages: Spec[] = [
  { name: "home (guest)", path: () => "/" },
  { name: "home (signed in)", path: () => "/", as: "buyer" },
  { name: "store: in stock", path: () => "/s/secondloop" },
  { name: "store: sold out", path: () => "/s/secondloop?stock=sold" },
  { name: "store: coming soon", path: () => "/s/secondloop?stock=soon" },
  { name: "product: available", path: () => `/p/${slugs.avail}` },
  { name: "product: reserved", path: () => `/p/${slugs.reserved}` },
  { name: "product: sold out", path: () => `/p/${slugs.sold}` },
  { name: "product: coming soon", path: () => `/p/${slugs.soon}` },
  { name: "product: removed", path: () => `/p/${slugs.withdrawn}` },
  { name: "search: no query", path: () => "/search" },
  { name: "search: results", path: () => "/search?q=jeans" },
  { name: "search: zero results", path: () => "/search?q=zzzqqq" },
  { name: "search: filtered", path: () => "/search?category=clothing&sort=price-asc" },
  { name: "drops", path: () => "/drops" },
  { name: "saved (guest)", path: () => "/saved" },
  { name: "saved (signed in)", path: () => "/saved", as: "buyer" },
  { name: "bag (guest)", path: () => "/bag" },
  { name: "bag (signed in)", path: () => "/bag", as: "buyer" },
  { name: "login", path: () => "/login" },
  { name: "orders", path: () => "/orders", as: "buyer" },
  { name: "account", path: () => "/account", as: "buyer" },
  { name: "addresses", path: () => "/account/addresses", as: "buyer" },
  { name: "preferences", path: () => "/preferences", as: "buyer" },
  { name: "welcome", path: () => "/welcome", as: "buyer" },
  { name: "legal: terms", path: () => "/legal/terms" },
  { name: "legal: privacy", path: () => "/legal/privacy" },
  { name: "legal: buyer protection", path: () => "/legal/buyer-protection" },
  { name: "legal: grievance", path: () => "/legal/grievance" },
];

const views = [
  { name: "phone", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 800 } },
] as const;

for (const colorScheme of ["light", "dark"] as const) {
  for (const view of views) {
    test.describe(`${colorScheme} ${view.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(view.size);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      });

      for (const spec of pages) {
        test(spec.name, async ({ page }) => {
          if (spec.as) await devSignIn(page, "Ananya (demo buyer)");
          await page.goto(spec.path());
          await expectNoViolations(page, spec.name);
        });
      }

      for (const status of ["SCHEDULED", "LIVE", "ENDED"] as const) {
        test(`drop: ${status.toLowerCase()}`, async ({ page }) => {
          await setDrop(status);
          await page.goto(`/d/${dropId}`);
          await expectNoViolations(page, `drop ${status}`);
        });
      }
    });
  }

  // Every step of buying, on a phone: the address form, the review, the sandbox payment and the confirmed order.
  test(`checkout and order (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await devSignIn(page, "Kabir (demo buyer)");
    await page.goto(`/p/${slugs.avail}`);
    await page.getByRole("button", { name: /^Buy now/ }).click();
    await page.waitForURL(/\/checkout\//);
    const orderId = new URL(page.url()).pathname.split("/").pop()!;
    await expectNoViolations(page, "checkout: first step");
    const deliver = page.getByRole("button", { name: "Deliver here" });
    if (await deliver.isVisible()) {
      await page.getByLabel("Full name").fill("Kabir Mehta");
      await page.getByLabel("Mobile number (for the courier)").fill("9876543211");
      await page.getByLabel("Flat / house no., building, street").fill("Flat 12, Sunrise Apartments");
      await page.getByLabel("Pincode").fill("411001");
      await page.getByLabel("City / town").fill("Pune");
      await page.getByLabel("State").selectOption("Maharashtra");
      await deliver.click();
    }
    await expect(page.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
    await expectNoViolations(page, "checkout: review");
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page.getByRole("button", { name: "Approve payment" })).toBeVisible();
    await expectNoViolations(page, "checkout: payment");
    await page.getByRole("button", { name: "Approve payment" }).click();
    await expect(page.getByRole("heading", { name: /Order confirmed/ })).toBeVisible();
    await expectNoViolations(page, "checkout: confirmed");
    await page.goto(`/orders/${orderId}`);
    await expectNoViolations(page, "order detail");
  });
}
