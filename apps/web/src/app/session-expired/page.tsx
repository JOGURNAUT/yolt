import type { Metadata } from "next";
import { SessionExpired } from "@/components/system/session-expired";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Session ended", robots: { index: false } };

/** Where to send someone whose session lapsed: /session-expired?next=<where they were>. */
export default async function SessionExpiredPage({ searchParams }: PageProps<"/session-expired">) {
  const sp = await searchParams;
  return <SessionExpired next={safeNext(sp.next)} />;
}
