"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { cx } from "./ui/cx";

/**
 * Follow a store. Guests are sent to sign in and brought back. The count is shown beside the
 * button unless `showCount` is off (the store header prints it itself, from the server).
 */
export function FollowButton({
  sellerId,
  following,
  followers,
  signedIn,
  showCount = true,
  className,
}: {
  sellerId: string;
  following: boolean;
  followers: number;
  signedIn: boolean;
  showCount?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ following, followers });
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    setBusy(true);
    const res = state.following
      ? await fetch(`/api/follows/${sellerId}`, { method: "DELETE" })
      : await fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sellerId }) });
    setBusy(false);
    if (res.ok) {
      setState((s) => ({ following: !s.following, followers: s.followers + (s.following ? -1 : 1) }));
      router.refresh(); // the follower count in the store header is server-rendered
    }
  }

  return (
    <div className={cx("flex items-center gap-3 text-sm", className)}>
      <Button variant={state.following ? "secondary" : "primary"} onClick={toggle} disabled={busy} aria-pressed={state.following}>
        {state.following ? "Following" : "Follow"}
      </Button>
      {showCount && (
        <span className="text-muted">
          {state.followers} {state.followers === 1 ? "follower" : "followers"}
        </span>
      )}
    </div>
  );
}
