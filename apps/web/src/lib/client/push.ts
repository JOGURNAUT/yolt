/**
 * Browser side of web push. It never creates a service worker: it uses the registration the
 * PWA shell installs, which pulls in /sw-push.js to show the notifications.
 */

const DISMISSED_KEY = "yolt.push.prompt-dismissed";
const READY_TIMEOUT_MS = 4000;

export type PushConfig = { enabled: true; publicKey: string } | { enabled: false };

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

let configPromise: Promise<PushConfig> | null = null;
export function getPushConfig(): Promise<PushConfig> {
  configPromise ??= fetch("/api/push/config", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<PushConfig>) : { enabled: false as const }))
    .catch(() => ({ enabled: false as const }));
  return configPromise;
}

/** The active service worker registration, or null when there is none (push is then simply unavailable). */
export async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    if (!(await navigator.serviceWorker.getRegistration())) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS));
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch {
    return null;
  }
}

export async function currentPushSubscription() {
  const reg = await pushRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export const wasPushPromptDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
};
export const rememberPushPromptDismissed = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    /* private mode: the prompt may come back, which is acceptable */
  }
};

function keyBytes(base64Url: string) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Tells the server this browser belongs to the signed-in user (idempotent). */
export async function syncPushSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const res = await post("/api/push/subscribe", { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } }).catch(() => null);
  return Boolean(res?.ok);
}

export type EnableResult = { ok: true } | { ok: false; reason: "unsupported" | "disabled" | "blocked" | "error" };

/** Asks the browser for permission (if it hasn't been decided), subscribes and saves the subscription. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const config = await getPushConfig();
  if (!config.enabled) return { ok: false, reason: "disabled" };
  const reg = await pushRegistration();
  if (!reg) return { ok: false, reason: "unsupported" };
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return { ok: false, reason: "blocked" };
  try {
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }));
    return (await syncPushSubscription(sub)) ? { ok: true } : { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return true;
  const res = await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => null);
  await sub.unsubscribe().catch(() => false);
  return Boolean(res?.ok);
}

/** Whether Remind me should offer the prompt: supported, switched on, undecided, never dismissed, not already subscribed. */
export async function shouldOfferPushPrompt() {
  if (!pushSupported() || wasPushPromptDismissed() || Notification.permission === "denied") return false;
  const config = await getPushConfig();
  if (!config.enabled) return false;
  const reg = await pushRegistration();
  if (!reg) return false;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Already on here: make sure this account owns the subscription and say nothing.
    void syncPushSubscription(existing);
    return false;
  }
  return true;
}
