"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js when the server says so (see lib/pwa.ts). When it says no, any worker an
 * earlier build registered on this origin is removed, so a dev server never inherits one.
 */
export function ServiceWorkerRegister({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (enabled) {
      const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      if (document.readyState === "complete") register();
      else {
        window.addEventListener("load", register, { once: true });
        return () => window.removeEventListener("load", register);
      }
    } else {
      void navigator.serviceWorker
        .getRegistrations()
        .then((all) => all.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).forEach((r) => void r.unregister()))
        .catch(() => {});
    }
  }, [enabled]);
  return null;
}
