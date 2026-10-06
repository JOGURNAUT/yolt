"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** "Remind me" on a drop ticket. Guests are sent to sign in and brought back. */
export function ReminderButton({ dropId, on, signedIn }: { dropId: string; on: boolean; signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [set, setSet] = useState(on);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}&for=remind`);
    const next = !set;
    setSet(next);
    setBusy(true);
    const res = await fetch(`/api/drops/${dropId}/reminder`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    setBusy(false);
    if (!res.ok) setSet(!next);
  }

  return (
    <Button
      size="sm"
      variant={set ? "secondary" : "primary"}
      aria-pressed={set}
      disabled={busy}
      onClick={toggle}
      className="h-auto min-h-11 w-full whitespace-normal px-2 py-1.5 leading-tight"
    >
      {set ? "Reminder set" : "Remind me"}
    </Button>
  );
}
