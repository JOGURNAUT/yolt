import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// Automated WCAG 2.x A/AA check of the seller, sell, admin and system pages, in both themes.
const STAFF = "YOLT staff (demo curator)";
const SELLER = "Second Loop (demo seller)";
const NEWBIE = "Newbie Seller (demo)";
const THEMES = ["light", "dark"] as const;

const ids: Record<string, string> = {};

test.beforeAll(async () => {
  reseed();
  await withDb(async (sql) => {
    const [staff] = await sql`SELECT id FROM users WHERE name = ${STAFF}`;
    await sql`INSERT INTO admins (user_id, role, granted_by) VALUES (${staff!.id}, 'ADMIN', 'e2e')`;
    const [kabir] = await sql`SELECT id FROM users WHERE name = 'Kabir (demo buyer)'`;
    await sql`INSERT INTO admins (user_id, role, granted_by) VALUES (${kabir!.id}, 'SUPPORT', 'e2e')`;
    const [buyer] = await sql`SELECT id FROM users WHERE name = 'Ananya (demo buyer)'`;
    const [seller] = await sql`SELECT id FROM sellers WHERE handle = 'secondloop'`;
    const items = await sql`SELECT id, title, price_paise FROM listings WHERE status = 'AVAILABLE' ORDER BY title LIMIT 6`;
    const address = sql.json({ name: "Ananya Rao", phone: "+919876543210", line1: "Flat 12", city: "Pune", state: "Maharashtra", pincode: "411001" });
    const order = async (ref: string, status: string, item: (typeof items)[number], late: boolean) => {
      const [o] = await sql`
        INSERT INTO orders (reference, buyer_id, seller_id, status, subtotal_paise, shipping_paise, total_paise, shipping_address, dispatch_by, confirmed_at)
        VALUES (${ref}, ${buyer!.id}, ${seller!.id}, ${status}, ${item.price_paise}, 0, ${item.price_paise}, ${address},
                ${late ? sql`now() - interval '2 days'` : sql`now() + interval '2 days'`}, now() - interval '1 day')
        RETURNING id`;
      await sql`INSERT INTO order_items (order_id, listing_id, price_paise, snapshot)
        VALUES (${o!.id}, ${item.id}, ${item.price_paise}, ${sql.json({ title: item.title, category: "tops", brandDeclared: null, tagSize: "M", measurements: {}, condition: "GOOD", flaws: null, photoUrl: null })})`;
      const [p] = await sql`INSERT INTO payment_attempts (order_id, provider, amount_paise, status) VALUES (${o!.id}, 'sandbox', ${item.price_paise}, 'SUCCEEDED') RETURNING id`;
      return { id: o!.id as string, paymentId: p!.id as string };
    };
    const claim = (orderId: string, text: string, response: string | null, status: string) =>
      sql`INSERT INTO claims (order_id, buyer_id, seller_id, reason, description, status, seller_response, seller_responded_at)
          VALUES (${orderId}, ${buyer!.id}, ${seller!.id}, 'NOT_AS_DESCRIBED', ${text}, ${status}, ${response}, ${response ? sql`now()` : null})`;
    const escalated = await order("YL-E2E001", "DELIVERED", items[0]!, false);
    const late = await order("YL-E2E003", "CONFIRMED", items[2]!, true);
    ids.toShip = (await order("YL-QA004", "CONFIRMED", items[3]!, false)).id;
    ids.shipped = (await order("YL-QA005", "SHIPPED", items[4]!, false)).id;
    const open = await order("YL-QA006", "DELIVERED", items[5]!, false);
    ids.report = open.id;
    await claim(escalated.id, "The collar is stained and it was not in the photos.", "The stain is in the listing photos, see photo 3.", "ESCALATED");
    await claim(open.id, "The size tag says M but it fits like an S.", null, "OPEN");
    await sql`INSERT INTO refunds (order_id, payment_attempt_id, amount_paise, reason, status) VALUES (${late.id}, ${late.paymentId}, 54900, 'CANCELLED_BY_SELLER', 'FAILED')`;
    await sql`INSERT INTO seller_applications (store_name, instagram_handle, city, what_they_sell, pieces_per_month, phone, status)
      VALUES ('Dusty Rose Closet', 'dustyrose.closet', 'Jaipur', 'Block-print kurtas and vintage denim', 'UNDER_20', '+919811100022', 'NEW')`;
    const [nu] = await sql`INSERT INTO users (name, phone) VALUES (${NEWBIE}, '+910000000009') RETURNING id`;
    await sql`INSERT INTO sellers (user_id, track, status, kyc_status, handle, display_name) VALUES (${nu!.id}, 'STORE', 'APPROVED', 'NOT_STARTED', 'newbie', 'Newbie Closet')`;
    ids.live = (await sql`SELECT id FROM listings WHERE status = 'AVAILABLE' ORDER BY title LIMIT 1`)[0]!.id;
    ids.inDrop = (await sql`SELECT id FROM listings WHERE status = 'SCHEDULED' LIMIT 1`)[0]!.id;
    ids.sold = (await sql`SELECT id FROM listings WHERE status = 'SOLD' LIMIT 1`)[0]!.id;
    ids.drop = (await sql`SELECT id FROM drops LIMIT 1`)[0]!.id;
  });
});

async function check(page: Page, path: string, theme: (typeof THEMES)[number]) {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect.soft(summary, `${path} in ${theme}`).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test("system pages and /sell", async ({ page, allowConsole }) => {
      allowConsole(/404/);
      for (const path of ["/sell", "/offline", "/session-expired", "/maintenance", "/no/such/page"]) await check(page, path, theme);
    });

    test("seller pages", async ({ page }) => {
      await devSignIn(page, NEWBIE as never, "/seller");
      for (const path of ["/seller", "/seller/listings", "/seller/drops", "/seller/orders", "/seller/reviews", "/seller/payouts", "/seller/store"]) await check(page, path, theme);
      await page.context().clearCookies();
      await devSignIn(page, SELLER, "/seller");
      const paths = [
        "/seller", "/seller/listings", "/seller/listings?tab=draft", "/seller/listings?tab=sold",
        `/seller/listings/${ids.live}`, `/seller/listings/${ids.inDrop}`, `/seller/listings/${ids.sold}`,
        "/seller/drops", `/seller/drops/${ids.drop}`,
        "/seller/orders", `/seller/orders/${ids.toShip}`, `/seller/orders/${ids.shipped}`, `/seller/orders/${ids.report}`,
        "/seller/reviews", "/seller/payouts", "/seller/store",
      ];
      for (const path of paths) await check(page, path, theme);
    });

    test("admin pages", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await devSignIn(page, STAFF as never, "/admin");
      for (const path of ["/admin", "/admin/sellers", "/admin/claims", "/admin/refunds", "/admin/homepage", "/admin/audit"]) await check(page, path, theme);
      await page.goto("/admin/homepage");
      for (const tab of ["The edit", "Featured store"]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect.soft(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`), `homepage ${tab} in ${theme}`).toEqual([]);
      }
      await page.context().clearCookies();
      await devSignIn(page, "Kabir (demo buyer)", "/admin");
      for (const path of ["/admin", "/admin/homepage", "/admin/sellers"]) await check(page, path, theme);
    });
  });
}
