"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatINR } from "@/lib/format";
import { GarmentImage } from "./garment-image";
import { useShop } from "./shop-state";

type Card = {
  id: string;
  slug: string;
  title: string;
  tagSize: string | null;
  pricePaise: number;
  status: string;
  category: string;
  sellerName: string;
  sellerHandle: string;
  coverUrl: string | null;
};

/** Cards for ids held on a guest's device. */
function useCards(ids: string[]) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch
      setCards([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/listings/cards?ids=${key}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((c: Card[]) => !cancelled && setCards(c));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return cards;
}

const soldOut = (s: string) => s === "SOLD" || s === "SOLD_ELSEWHERE";

export function GuestSaved() {
  const { savedIds } = useShop();
  const cards = useCards(savedIds);
  if (cards === null) return <p className="text-sm text-muted">Loading…</p>;
  if (cards.length === 0) return <p className="py-6 text-sm text-muted">Tap ♡ on anything you like to keep it here.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.id} href={`/p/${c.slug}`} className="block">
          <div className={`overflow-hidden rounded-lg ${soldOut(c.status) ? "opacity-60" : ""}`}>
            <GarmentImage src={c.coverUrl} alt={c.title} category={c.category} />
          </div>
          <p className="mt-2 line-clamp-1 text-sm font-medium">{c.title}</p>
          <p className="text-sm font-semibold">{soldOut(c.status) ? "Sold out" : formatINR(c.pricePaise)}</p>
        </Link>
      ))}
    </div>
  );
}

/** A guest's bag: shown grouped by store; checking out needs sign-in, which merges it into the account. */
export function GuestBag() {
  const { bagIds, removeFromBag } = useShop();
  const cards = useCards(bagIds);
  if (cards === null) return <p className="text-sm text-muted">Loading…</p>;
  if (cards.length === 0) return <p className="py-6 text-sm text-muted">Your bag is empty.</p>;
  const stores = [...new Set(cards.map((c) => c.sellerHandle))];
  return (
    <div className="space-y-6">
      {stores.map((handle) => {
        const items = cards.filter((c) => c.sellerHandle === handle);
        return (
          <section key={handle} className="space-y-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="font-semibold">{items[0]!.sellerName}</h2>
            <ul className="divide-y divide-line text-sm">
              {items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/p/${c.slug}`} className="hover:underline">
                    {c.title}
                    {c.tagSize && <span className="text-muted"> · {c.tagSize}</span>}
                  </Link>
                  <span className="flex items-center gap-3">
                    {soldOut(c.status) ? <span className="text-muted">Sold out</span> : formatINR(c.pricePaise)}
                    <button type="button" onClick={() => removeFromBag(c.id)} className="text-xs text-muted underline">
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <Link href="/login?next=/bag" className="block w-full rounded-full bg-foreground py-3 text-center font-semibold text-background">
        Sign in to check out
      </Link>
    </div>
  );
}
