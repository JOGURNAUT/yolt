import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";

// A drop opens on the server's clock without a reload; claims go to checkout; the per-buyer limit holds.
test.beforeAll(() => reseed());

test("countdown → remind me → opens live → two claims → the third hits the limit", async ({ page, allowConsole }) => {
  allowConsole(/409/); // the limit is a 409 the page turns into a toast

  const dropId = await withDb(async (sql) => {
    const [drop] = await sql<{ id: string }[]>`
      UPDATE drops SET starts_at = now() + interval '20 seconds', status = 'SCHEDULED', opened_at = NULL
      WHERE title = 'Winter Vintage Drop' RETURNING id`;
    await sql`UPDATE listings SET status = 'SCHEDULED' WHERE drop_id = ${drop!.id}`;
    return drop!.id;
  });

  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  await expect(page.getByText("Opens in")).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  // The button flips straight away; the request saves it a moment later.
  await expect.poll(() => withDb(async (sql) => (await sql`SELECT 1 FROM drop_reminders WHERE drop_id = ${dropId}`).length)).toBe(1);

  // Opens by itself.
  const claim = page.getByRole("button", { name: "Claim" });
  await expect(claim).toHaveCount(3, { timeout: 45_000 });

  await claim.first().click();
  await page.waitForURL(/\/checkout\//);
  await page.goto(`/d/${dropId}`);
  await page.getByRole("button", { name: "Claim" }).first().click();
  await page.waitForURL(/\/checkout\//);

  await page.goto(`/d/${dropId}`);
  await page.getByRole("button", { name: "Claim" }).first().click();
  await expect(page.getByText("You can hold 2 pieces from this drop at a time. Pay for yours first.")).toBeVisible();
  await expect(page.getByText("Reserved", { exact: true })).toHaveCount(2);
});
