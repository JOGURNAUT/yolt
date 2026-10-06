import type { Metadata } from "next";
import { RetryButton } from "@/components/system/retry-button";
import { SystemPage } from "@/components/system/system-page";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

/** SysOffline. The service worker serves this when a page navigation fails (public/sw.js). */
export default function OfflinePage() {
  return (
    <SystemPage tag="Offline" title="You're offline" actions={<RetryButton />}>
      <p>Reconnect to see your saved pieces. Prices and stock need a connection, so we never show you old ones.</p>
    </SystemPage>
  );
}
