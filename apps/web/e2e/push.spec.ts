import { reseed, withDb } from "./db";
import { devSignIn, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Remind me offers web push: the reason first, then the browser's own prompt. CI has no real push
// service, so the service worker registration and PushManager are stubbed in the page, and the
// assertions are about what the page asks for and what reaches /api/push/subscribe.
test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });

const SHOTS = process.env.PUSH_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/push-${name}.png` });
};

type Stub = { permission?: NotificationPermission; answer?: NotificationPermission; subscribed?: boolean };
type Probe = { asked: number; subscribeKeyBytes: number | null };
declare global {
  interface Window {
    __push: Probe;
  }
}

/** A service worker registration whose pushManager behaves like a browser that has push, minus the network. */
async function stubPush(page: Page, stub: Stub = {}) {
  await page.addInitScript((s) => {
    const probe = { asked: 0, subscribeKeyBytes: null as number | null };
    window.__push = probe;
    let permission = s.permission ?? "default";
    const make = () => ({
      endpoint: "https://push.example.test/send/e2e-endpoint",
      toJSON: () => ({ endpoint: "https://push.example.test/send/e2e-endpoint", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    });
    let current: ReturnType<typeof make> | null = s.subscribed ? make() : null;
    const registration = {
      pushManager: {
        getSubscription: async () => current,
        subscribe: async (opts: { applicationServerKey: Uint8Array }) => {
          probe.subscribeKeyBytes = opts.applicationServerKey.byteLength;
          current = make();
          return current;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => registration, ready: Promise.resolve(registration), addEventListener() {}, removeEventListener() {} },
    });
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => permission });
    Notification.requestPermission = async () => {
      probe.asked++;
      permission = s.answer ?? "granted";
      return permission;
    };
  }, stub);
}

let dropId = "";
test.beforeAll(async () => {
  reseed();
});
test.beforeEach(async () => {
  dropId = await withDb(async (sql) => {
    await sql`DELETE FROM drop_reminders`;
    await sql`DELETE FROM push_subscriptions`;
    const [drop] = await sql<{ id: string }[]>`
      UPDATE drops SET starts_at = now() + interval '2 hours', status = 'SCHEDULED', opened_at = NULL, reminders_queued_at = NULL
      WHERE title = 'Winter Vintage Drop' RETURNING id`;
    await sql`UPDATE listings SET status = 'SCHEDULED' WHERE drop_id = ${drop!.id}`;
    return drop!.id;
  });
});

const prompt = (page: Page) => page.getByRole("region", { name: "Get a ping when Winter Vintage Drop opens?" });
const subscriptions = () => withDb((sql) => sql<{ endpoint: string; p256dh: string; auth: string; user_agent: string | null }[]>`SELECT endpoint, p256dh, auth, user_agent FROM push_subscriptions`);

test("Remind me asks with the reason first, then subscribes with the right shape", async ({ page }) => {
  await stubPush(page);
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  // Never on arrival.
  await expect(page.getByRole("button", { name: "Remind me" })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page).getByText("one ping 15 minutes before")).toBeVisible();
  await expect(prompt(page).getByText("no offers")).toBeVisible();
  // The reason comes first: the browser has not been asked yet.
  expect(await page.evaluate(() => window.__push.asked)).toBe(0);
  await shot(page, "ask");

  const request = page.waitForRequest((r) => r.url().endsWith("/api/push/subscribe") && r.method() === "POST");
  await prompt(page).getByRole("button", { name: "Turn on pings" }).click();
  const body = (await request).postDataJSON();
  expect(body).toEqual({
    endpoint: "https://push.example.test/send/e2e-endpoint",
    keys: { p256dh: expect.stringMatching(/^[\w-]{20,}$/), auth: expect.stringMatching(/^[\w-]{10,}$/) },
  });
  expect(await page.evaluate(() => window.__push)).toEqual({ asked: 1, subscribeKeyBytes: 65 });
  await expect(page.getByText("Pings are on")).toBeVisible();
  await shot(page, "done");

  const rows = await subscriptions();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ endpoint: "https://push.example.test/send/e2e-endpoint" });
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(prompt(page)).toHaveCount(0);
});

test("Not now is remembered: no second prompt, now or after a reload", async ({ page }) => {
  await stubPush(page);
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole("button", { name: "Not now" }).click();
  await expect(prompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__push.asked)).toBe(0);

  // Off and on again in the same visit, then after a reload.
  await page.getByRole("button", { name: "Reminder set ✓" }).click();
  await expect(page.getByRole("button", { name: "Remind me" })).toBeVisible();
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Reminder set ✓" }).click();
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  expect(await subscriptions()).toHaveLength(0);
});

test("a blocked browser shows the blocked state once and creates nothing", async ({ page }) => {
  await stubPush(page, { answer: "denied" });
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  await page.getByRole("button", { name: "Remind me" }).click();
  await prompt(page).getByRole("button", { name: "Turn on pings" }).click();
  await expect(page.getByRole("region", { name: "Notifications are blocked" })).toBeVisible();
  await expect(page.getByText("allow them in the site settings")).toBeVisible();
  await shot(page, "blocked");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("region", { name: "Notifications are blocked" })).toHaveCount(0);
  expect(await subscriptions()).toHaveLength(0);

  // The reminder itself still works, and nothing asks again.
  await page.getByRole("button", { name: "Reminder set ✓" }).click();
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby=push-prompt-h]")).toHaveCount(0);
});

test("already denied in the browser: Remind me sets the reminder and says nothing more", async ({ page }) => {
  await stubPush(page, { permission: "denied" });
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby=push-prompt-h]")).toHaveCount(0);
  await expect.poll(() => withDb(async (sql) => (await sql`SELECT 1 FROM drop_reminders WHERE drop_id = ${dropId}`).length)).toBe(1);
});

test("an already subscribed browser is not asked again, and is attached to this account", async ({ page }) => {
  await stubPush(page, { permission: "granted", subscribed: true });
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  const request = page.waitForRequest((r) => r.url().endsWith("/api/push/subscribe"));
  await page.getByRole("button", { name: "Remind me" }).click();
  await request;
  await expect(page.locator("section[aria-labelledby=push-prompt-h]")).toHaveCount(0);
  await expect.poll(async () => (await subscriptions()).length).toBe(1);
});

test("the account page toggles notifications for this device", async ({ page }) => {
  await stubPush(page);
  await devSignIn(page, "Kabir (demo buyer)", "/account");
  const toggle = page.getByRole("switch", { name: /Notifications/ });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("On for this device")).toBeVisible();
  expect(await subscriptions()).toHaveLength(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => withDb(async (sql) => (await sql`SELECT 1 FROM push_subscriptions WHERE revoked_at IS NULL`).length)).toBe(0);
});

test("without a service worker nothing is offered", async ({ page }) => {
  await devSignIn(page, "Kabir (demo buyer)", `/d/${dropId}`);
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByRole("button", { name: "Reminder set ✓" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby=push-prompt-h]")).toHaveCount(0);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
});
