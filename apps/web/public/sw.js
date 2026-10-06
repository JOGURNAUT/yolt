/*
 * YOLT service worker. Small and boring on purpose.
 *
 * Files:
 *   /sw.js          this file: offline fallback and static-asset caching. Registered by
 *                   src/components/system/service-worker-register.tsx, in deployed builds only
 *                   (never `next dev`, never APP_ENV=development; see src/lib/pwa.ts).
 *   /sw-push.js     the push hook, loaded below with importScripts. Push handling lives there.
 *   /offline        the page shown when a navigation fails (src/app/offline/page.tsx).
 *
 * What it caches, and what it never does:
 *   - Precached at install: /offline (fetched without cookies, so it is the signed-out page), the
 *     hashed CSS and JS it needs, and the app icons.
 *   - Cached as you browse: hashed files under /_next/static/ only (cache-first, they never change;
 *     the newest 120 are kept).
 *   - Never cached: pages, API responses, checkout, orders, photos, anything personal. Pages are
 *     always fetched from the network, so prices and availability are never stale. The offline
 *     page is used only when the network request itself fails.
 *
 * Bump VERSION to drop every old cache on the next activate (for example when /offline changes).
 */
const VERSION = "v1";
const CACHE = `yolt-static-${VERSION}`; // precached: the offline page and what it needs
const RUNTIME = `yolt-runtime-${VERSION}`; // hashed files seen while browsing
const OFFLINE_URL = "/offline";
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_STATIC_ENTRIES = 120;

// ---- PUSH HOOK: push, notificationclick and subscription handling live in /sw-push.js. ----
importScripts("/sw-push.js");

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  // credentials: "omit" so the cached copy is the signed-out page, never someone's account menu.
  const res = await fetch(OFFLINE_URL, { credentials: "omit", cache: "reload" });
  if (!res.ok) throw new Error(`offline page: ${res.status}`);
  const html = await res.clone().text();
  await cache.put(OFFLINE_URL, res);
  // The offline page is unstyled without its CSS and fonts, so keep the files it links to.
  const assets = [...new Set(html.match(/\/_next\/static\/[^"')\s\\]+/g) ?? [])];
  await Promise.all(assets.map((url) => cache.add(new Request(url, { credentials: "omit" })).catch(() => {})));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("yolt-") && n !== CACHE && n !== RUNTIME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network first, always. Only a failed request (offline, DNS, timeout) gets the offline page.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticFirst(request));
  }
  // Everything else (API, photos, RSC payloads, data) goes straight to the network, uncached.
});

async function staticFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

// Hashed files pile up across deploys; keep the newest entries (cache keys come back oldest first).
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map((k) => cache.delete(k)));
}
