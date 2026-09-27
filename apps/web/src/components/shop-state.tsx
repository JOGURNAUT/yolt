"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Saved items and bag, shared by every page. Signed-in: kept on the server. Guests: kept on
 * this device (most buyers arrive from Instagram without an account) and merged into the
 * account at sign-in. Storage can be unavailable (private mode, in-app browsers), so every
 * access is guarded and the page works without it.
 */
const SAVES_KEY = "yolt_saves";
const BAG_KEY = "yolt_bag";

function readLocal(key: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}
function writeLocal(key: string, ids: string[]) {
  try {
    if (ids.length) window.localStorage.setItem(key, JSON.stringify(ids));
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: the in-memory state still works for this visit */
  }
}

type ShopState = {
  signedIn: boolean;
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => Promise<void>;
  inBag: (id: string) => boolean;
  addToBag: (id: string) => Promise<{ ok: boolean; error?: string }>;
  removeFromBag: (id: string) => Promise<void>;
  bagCount: number;
  savedIds: string[];
  bagIds: string[];
};

const Ctx = createContext<ShopState | null>(null);

export function useShop() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShop outside ShopStateProvider");
  return v;
}

export function ShopStateProvider({
  signedIn,
  initialSaved,
  initialBag,
  children,
}: {
  signedIn: boolean;
  initialSaved: string[];
  initialBag: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<string[]>(initialSaved);
  const [bag, setBag] = useState<string[]>(initialBag);

  // Guests: load device state. Signed in: merge any device state into the account once.
  useEffect(() => {
    const localSaves = readLocal(SAVES_KEY);
    const localBag = readLocal(BAG_KEY);
    if (!signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from device storage after mount
      setSaved(localSaves);
      setBag(localBag);
      return;
    }
    if (localSaves.length === 0 && localBag.length === 0) return;
    void (async () => {
      const post = (path: string, listingIds: string[]) =>
        listingIds.length
          ? fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingIds }) })
          : Promise.resolve(null);
      const [s, b] = await Promise.all([post("/api/saves/merge", localSaves), post("/api/bag/merge", localBag)]);
      if (s === null || s.ok) writeLocal(SAVES_KEY, []);
      if (b === null || b.ok) writeLocal(BAG_KEY, []);
      router.refresh();
    })();
  }, [signedIn, router]);

  // When the server sends fresh lists (after router.refresh), adopt them — but only when signed
  // in: a guest's props are always empty and would wipe their device picks. Adjusting state
  // during render on a prop change is React's recommended alternative to a syncing effect.
  const [lastProps, setLastProps] = useState({ initialSaved, initialBag });
  if (signedIn && (lastProps.initialSaved !== initialSaved || lastProps.initialBag !== initialBag)) {
    setLastProps({ initialSaved, initialBag });
    setSaved(initialSaved);
    setBag(initialBag);
  }

  const toggleSave = useCallback(
    async (id: string) => {
      const was = saved.includes(id);
      const next = was ? saved.filter((x) => x !== id) : [id, ...saved];
      setSaved(next);
      if (!signedIn) return writeLocal(SAVES_KEY, next);
      const res = was
        ? await fetch(`/api/saves/${id}`, { method: "DELETE" })
        : await fetch("/api/saves", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: id }) });
      if (!res.ok) setSaved(saved); // roll back
    },
    [saved, signedIn],
  );

  const addToBag = useCallback(
    async (id: string) => {
      if (bag.includes(id)) return { ok: true };
      if (!signedIn) {
        if (bag.length >= 30) return { ok: false, error: "BAG_FULL" };
        const next = [...bag, id];
        setBag(next);
        writeLocal(BAG_KEY, next);
        return { ok: true };
      }
      const res = await fetch("/api/bag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: id }) });
      if (!res.ok) return { ok: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error };
      setBag([...bag, id]);
      router.refresh();
      return { ok: true };
    },
    [bag, signedIn, router],
  );

  const removeFromBag = useCallback(
    async (id: string) => {
      const next = bag.filter((x) => x !== id);
      setBag(next);
      if (!signedIn) return writeLocal(BAG_KEY, next);
      await fetch(`/api/bag/${id}`, { method: "DELETE" });
      router.refresh();
    },
    [bag, signedIn, router],
  );

  const value = useMemo<ShopState>(
    () => ({
      signedIn,
      isSaved: (id) => saved.includes(id),
      toggleSave,
      inBag: (id) => bag.includes(id),
      addToBag,
      removeFromBag,
      bagCount: bag.length,
      savedIds: saved,
      bagIds: bag,
    }),
    [signedIn, saved, bag, toggleSave, addToBag, removeFromBag],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
