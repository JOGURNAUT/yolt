"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/** Follow a store. Guests are sent to sign in and brought back. */
export function FollowButton({ sellerId, following, followers, signedIn }: { sellerId: string; following: boolean; followers: number; signedIn: boolean }) {
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
    if (res.ok) setState((s) => ({ following: !s.following, followers: s.followers + (s.following ? -1 : 1) }));
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state.following}
        className={`rounded-full px-4 py-1.5 font-medium disabled:opacity-60 ${state.following ? "border border-line" : "bg-foreground text-background"}`}
      >
        {state.following ? "Following" : "Follow"}
      </button>
      <span className="text-muted">
        {state.followers} {state.followers === 1 ? "follower" : "followers"}
      </span>
    </div>
  );
}
