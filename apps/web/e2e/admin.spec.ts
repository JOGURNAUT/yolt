import type { Page } from "@playwright/test";
import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// The staff area: closed to everyone else, counts and nav, the reason every write needs, homepage
// curation reaching the landing page, the read-only SUPPORT role, re-auth and phone width.
const STAFF = "YOLT staff (demo curator)";

/** One-click dev sign-in for the staff account (the shared helper only lists buyers and the seller). */
async function signInStaff(page: Page, next = "/admin") {
  await page.goto(`/dev?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: STAFF }).click();
  await expect(page).toHaveURL((url) => url.pathname === next.split("?")[0]);
}

test.beforeAll(async () => {
  reseed();
  // Arranged in the database: the UI can't make an escalated report or a failed refund quickly.
  await withDb(async (sql) => {
    const [staff] = await sql`SELECT id FROM users WHERE name = ${STAFF}`;
    await sql`INSERT INTO admins (user_id, role, granted_by) VALUES (${staff!.id}, 'ADMIN', 'e2e')`;
    const [buyer] = await sql`SELECT id FROM users WHERE name = 'Ananya (demo buyer)'`;
    const [seller] = await sql`SELECT id FROM sellers WHERE handle = 'secondloop'`;
    const items = await sql`SELECT id, title FROM listings WHERE status = 'AVAILABLE' ORDER BY title LIMIT 3`;
    const address = sql.json({ name: "Ananya Rao", phone: "+919876543210", line1: "Flat 12", city: "Pune", state: "Maharashtra", pincode: "411001" });

    const order = async (ref: string, status: string, item: (typeof items)[number], lateBy: string | null) => {
      const [o] = await sql`
        INSERT INTO orders (reference, buyer_id, seller_id, status, subtotal_paise, shipping_paise, total_paise, shipping_address, dispatch_by)
        VALUES (${ref}, ${buyer!.id}, ${seller!.id}, ${status}, 54900, 0, 54900, ${address},
                ${lateBy ? sql`now() - ${lateBy}::interval` : sql`now() + interval '2 days'`})
        RETURNING id`;
      await sql`INSERT INTO order_items (order_id, listing_id, price_paise, snapshot)
        VALUES (${o!.id}, ${item.id}, 54900, ${sql.json({ title: item.title, category: "tops", brandDeclared: null, tagSize: "M", measurements: {}, condition: "GOOD", flaws: null, photoUrl: null })})`;
      const [p] = await sql`INSERT INTO payment_attempts (order_id, provider, amount_paise, status) VALUES (${o!.id}, 'sandbox', 54900, 'SUCCEEDED') RETURNING id`;
      return { id: o!.id as string, paymentId: p!.id as string };
    };
    const claim = (orderId: string, text: string, response: string) =>
      sql`INSERT INTO claims (order_id, buyer_id, seller_id, reason, description, status, seller_response, seller_responded_at)
          VALUES (${orderId}, ${buyer!.id}, ${seller!.id}, 'NOT_AS_DESCRIBED', ${text}, 'ESCALATED', ${response}, now())`;

    const reject = await order("YL-E2E001", "DELIVERED", items[0]!, null);
    const refund = await order("YL-E2E002", "DELIVERED", items[1]!, null);
    const late = await order("YL-E2E003", "CONFIRMED", items[2]!, "2 days");
    await claim(reject.id, "The collar is stained and it was not in the photos.", "The stain is in the listing photos, see photo 3.");
    await claim(refund.id, "Arrived with a hole under the arm.", "It left here intact.");
    await sql`INSERT INTO refunds (order_id, payment_attempt_id, amount_paise, reason, status)
      VALUES (${late.id}, ${late.paymentId}, 54900, 'CANCELLED_BY_SELLER', 'FAILED')`;
    await sql`INSERT INTO seller_applications (store_name, instagram_handle, city, what_they_sell, pieces_per_month, phone, status)
      VALUES ('Dusty Rose Closet', 'dustyrose.closet', 'Jaipur', 'Block-print kurtas and vintage denim', 'UNDER_20', '+919811100022', 'NEW')`;
  });
});

test.describe("access", () => {
  test("non-staff get a 404", async ({ page, allowConsole }) => {
    allowConsole(/404/);
    for (const path of ["/admin", "/admin/sellers", "/admin/claims", "/admin/refunds", "/admin/audit", "/admin/homepage"]) {
      expect((await page.goto(path))?.status(), `${path} for a guest`).toBe(404);
    }
    await devSignIn(page, "Ananya (demo buyer)");
    for (const path of ["/admin", "/admin/homepage"]) expect((await page.goto(path))?.status(), `${path} for a buyer`).toBe(404);
    expect((await page.request.get("/api/admin/homepage-slots")).status()).toBe(404);
  });

  test("a login older than 12 hours must be renewed before any admin change", async ({ page }) => {
    await signInStaff(page);
    await withDb((sql) => sql`UPDATE sessions SET created_at = now() - interval '13 hours' WHERE user_id = (SELECT id FROM users WHERE name = ${STAFF})`);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Sign in again to make admin changes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible();
    const res = await page.request.post("/api/admin/homepage-slots", { data: { kind: "GRAILS", listingIds: [], reason: "Trying with an old login" } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: "REAUTH_REQUIRED" });
    await page.getByRole("button", { name: "Sign in again" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("staff see the nav and the counts", async ({ page }) => {
    await signInStaff(page);
    const nav = page.getByRole("navigation", { name: "Admin", exact: true });
    for (const name of ["Overview", "Sellers", "Reports", "Refunds", "Homepage", "Audit log"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(page.getByText("Signed in as staff · every action needs a reason")).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Sellers/ })).toContainText("1");
    await expect(nav.getByRole("link", { name: /^Reports/ })).toContainText("2");
    const counts = { dispatch: "1", late: "1", reports: "2", refunds: "1", apps: "1" };
    for (const [key, n] of Object.entries(counts)) await expect(page.locator(`[data-count="${key}"]`), key).toHaveText(n);
    await expect(page.getByRole("banner")).toBeVisible(); // the site header stays; the bottom bar is for buyers only
  });

  test("an application status change needs a reason", async ({ page }) => {
    await signInStaff(page, "/admin/sellers");
    await expect(page.getByRole("heading", { name: "Dusty Rose Closet" })).toBeVisible();
    await page.getByRole("button", { name: /^Mark contacted/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Staff note (optional)").fill("Called, wants to start in November.");
    await dialog.getByRole("button", { name: "Mark contacted" }).click();
    await expect(dialog.getByText("Write a reason (at least 5 characters). It goes in the audit log.")).toBeVisible();
    await dialog.getByLabel("Reason").fill("Spoke to the owner on WhatsApp");
    await dialog.getByRole("button", { name: "Mark contacted" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Dusty Rose Closet" })).toHaveCount(0);

    await page.getByRole("link", { name: /^Contacted/ }).click();
    await expect(page.getByRole("heading", { name: "Dusty Rose Closet" })).toBeVisible();
    await expect(page.getByText("Called, wants to start in November.")).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByText("Application status changed").first()).toBeVisible();
    await expect(page.getByText("Spoke to the owner on WhatsApp")).toBeVisible();
    await expect(page.getByText("status: NEW").first()).toBeVisible();
    await expect(page.getByText("status: CONTACTED").first()).toBeVisible();
  });

  test("a report decision needs a reason, then a confirmation", async ({ page }) => {
    await signInStaff(page, "/admin/claims");
    const stain = page.getByRole("listitem", { name: "Report on order YL-E2E001" });
    await expect(stain.getByText("The collar is stained and it was not in the photos.")).toBeVisible(); // buyer's side
    await expect(stain.getByText("The stain is in the listing photos, see photo 3.")).toBeVisible(); // seller's side

    // No reason: nothing is asked, the field says why.
    await stain.getByRole("button", { name: "Reject report" }).click();
    await expect(stain.getByText("Write a reason (at least 5 characters). It goes in the audit log.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // With a reason: confirm, then the done state.
    await stain.getByLabel("Your decision, in your words").fill("The stain is visible in photo 3 of the listing.");
    await stain.getByRole("button", { name: "Reject report" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Reject this report?" })).toBeVisible();
    await expect(dialog.getByText("The stain is visible in photo 3 of the listing.")).toBeVisible();
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toBeHidden();
    await stain.getByRole("button", { name: "Reject report" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reject report" }).click();
    await expect(stain.getByText("Report rejected. No refund.")).toBeVisible();
    await stain.getByRole("button", { name: "Back to the queue" }).click();
    await expect(page.getByRole("listitem", { name: "Report on order YL-E2E001" })).toHaveCount(0);

    // Refund: the refund shows up in the refunds queue.
    const hole = page.getByRole("listitem", { name: "Report on order YL-E2E002" });
    await hole.getByLabel("Your decision, in your words").fill("The seller can't show the item left intact.");
    await hole.getByRole("button", { name: "Refund buyer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Refund buyer" }).click();
    await expect(hole.getByText("Refund of ₹549 queued for the buyer.")).toBeVisible();

    await page.goto("/admin/refunds");
    await expect(page.getByText("YL-E2E002", { exact: true })).toBeVisible();
    await page.goto("/admin/claims?status=RESOLVED");
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Refunded", { exact: true })).toBeVisible();
  });

  test("a failed refund can be retried, with a reason", async ({ page }) => {
    await signInStaff(page, "/admin/refunds");
    const row = page.getByRole("listitem").filter({ hasText: "YL-E2E003" });
    await expect(row.getByText("Failed", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: /^Retry/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Retry refund" }).click();
    await expect(dialog.getByText("Write a reason (at least 5 characters). It goes in the audit log.")).toBeVisible();
    await dialog.getByLabel("Reason").fill("Provider outage has ended");
    await dialog.getByRole("button", { name: "Retry refund" }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText("To issue", { exact: true })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByText("Refund retried").first()).toBeVisible();
  });

  test("a Grails list can be saved and then appears on the landing page", async ({ page, browser }) => {
    await signInStaff(page, "/admin/homepage");
    await expect(page.getByRole("heading", { name: "Grails list" })).toBeVisible();

    // Start from empty, then add one piece the seed doesn't already feature.
    const remove = page.locator("form ol").getByRole("button", { name: /^Remove / });
    while (await remove.count()) await remove.first().click();
    await page.getByLabel("Find a live piece").fill("baby tee");
    await page.getByRole("button", { name: /^Add Y2K graphic baby tee/ }).click();
    await expect(page.getByText("1 of 12")).toBeVisible();
    await expect(page.getByRole("region", { name: "Preview" }).getByText("Y2K graphic baby tee")).toBeVisible();

    // The reason is required.
    await page.getByRole("button", { name: "Save Grails list" }).click();
    await expect(page.getByText("Write a reason (at least 5 characters). It goes in the audit log.")).toBeVisible();
    await page.getByLabel("Reason").fill("Spotlight the baby tee for the weekend");
    await page.getByRole("button", { name: "Save Grails list" }).click();
    await expect(page.getByText("Saved. It is on the homepage now.")).toBeVisible();

    // A guest sees it on the landing page.
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const landing = await guest.newPage();
    await landing.goto("/");
    const grails = landing.getByRole("region", { name: "Grails" });
    await expect(grails.getByText("Y2K graphic baby tee")).toBeVisible();
    await guest.close();

    // And the change is in the audit log with its reason.
    await page.goto("/admin/audit");
    await expect(page.getByText("Spotlight the baby tee for the weekend")).toBeVisible();
    await expect(page.getByText("Homepage slot changed").first()).toBeVisible();
  });

  test("the edit needs a 3 to 40 character title; the featured store can be scheduled", async ({ page, allowConsole }) => {
    allowConsole(/400/); // the title check is the API refusing a 2-character title
    await signInStaff(page, "/admin/homepage");
    await page.getByRole("button", { name: "The edit", exact: true }).click();
    await page.getByLabel("Find a live piece").fill("a");
    await page.getByRole("button", { name: /^Add / }).first().click();
    await page.getByLabel("Title").fill("ab");
    await page.getByLabel("Reason").fill("Autumn layers edit");
    await page.getByRole("button", { name: "Save the edit" }).click();
    await expect(page.getByText(/^Check the title/)).toBeVisible();
    await page.getByLabel("Title").fill("Autumn layers");
    await page.getByRole("button", { name: "Save the edit" }).click();
    await expect(page.getByText("Saved. It is on the homepage now.")).toBeVisible();

    await page.getByRole("button", { name: "Featured store", exact: true }).click();
    await page.getByLabel("Store", { exact: true }).selectOption({ label: "Second Loop (@secondloop)" });
    await page.getByLabel("Show from").fill("2099-01-01T10:00");
    await page.getByLabel("Reason").fill("Diwali feature, scheduled early");
    await page.getByRole("button", { name: "Save featured store" }).click();
    await expect(page.getByText(/^Saved. It will show on the homepage from/)).toBeVisible();
    await expect(page.getByText("Upcoming", { exact: true }).first()).toBeVisible();
  });

  test("SUPPORT can look but not write", async ({ page }) => {
    await withDb(async (sql) => {
      const [kabir] = await sql`SELECT id FROM users WHERE name = 'Kabir (demo buyer)'`;
      await sql`INSERT INTO admins (user_id, role, granted_by) VALUES (${kabir!.id}, 'SUPPORT', 'e2e') ON CONFLICT (user_id) DO UPDATE SET role = 'SUPPORT'`;
      await sql`INSERT INTO seller_applications (store_name, instagram_handle, city, what_they_sell, pieces_per_month, phone, status)
        VALUES ('Quiet Hanger', 'quiet.hanger', 'Goa', 'Linen shirts', 'UNDER_20', '+919811100033', 'NEW')`;
    });
    await devSignIn(page, "Kabir (demo buyer)", "/admin");
    await expect(page.getByText("Read-only access.")).toBeVisible();

    await page.goto("/admin/homepage");
    await expect(page.getByRole("heading", { name: "Grails list" })).toBeVisible();
    await expect(page.getByText(/SUPPORT staff can see the homepage picks/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Grails list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Remove)/ })).toHaveCount(0);

    await page.goto("/admin/sellers");
    await expect(page.getByRole("heading", { name: "Quiet Hanger" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mark contacted/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Onboard an invited store" })).toHaveCount(0);

    await page.goto("/admin/claims?status=RESOLVED");
    await expect(page.getByRole("button", { name: /Refund buyer|Reject report/ })).toHaveCount(0);

    // The API refuses too.
    const res = await page.request.post("/api/admin/homepage-slots", { data: { kind: "GRAILS", listingIds: [], reason: "Trying as support" } });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: "READ_ONLY_ROLE" });
    const retry = await page.request.post("/api/admin/refunds/00000000-0000-4000-8000-000000000000/retry", { data: { reason: "Trying as support" } });
    expect(retry.status()).toBe(403);
  });
});

test("no horizontal scroll at 390 on every admin page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInStaff(page);
  const paths = ["/admin", "/admin/sellers", "/admin/sellers?applications=CONTACTED", "/admin/claims", "/admin/claims?status=RESOLVED", "/admin/refunds", "/admin/audit", "/admin/homepage"];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  for (const tab of ["The edit", "Featured store", "Grails list"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `homepage ${tab} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
