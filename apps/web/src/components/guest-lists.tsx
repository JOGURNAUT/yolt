"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatINR } from "@/lib/format";
import { BagLine, StoreInitials } from "./bag/bag-line";
import { GarmentImage } from "./garment-image";
import { useShop } from "./shop-state";
import { ButtonLink } from "./ui/button";
import { EmptyState } from "./ui/empty-state";

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
        <div key={c.id}>
          <Link href={`/p/${c.slug}`} className="block">
            <div className={`overflow-hidden rounded-lg ${soldOut(c.status) ? "opacity-60" : ""}`}>
              <GarmentImage src={c.coverUrl} alt={c.title} category={c.category} />
            </div>
            <p className="mt-2 line-clamp-1 text-sm font-medium">{c.title}</p>
            <p className="text-sm font-semibold">{soldOut(c.status) ? "Sold out" : formatINR(c.pricePaise)}</p>
          </Link>
          {soldOut(c.status) && (
            <Link href={`/search?cat=${c.category}`} className="btn btn-sm btn-ghost !h-11 !px-0">
              Find similar
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

/** A guest's bag: shown grouped by store; checking out needs sign-in, which merges it into the account. */
export function GuestBag() {
  const { bagIds } = useShop();
  const cards = useCards(bagIds);
  if (cards === null) return <p className="text-sm text-muted">Loading…</p>;
  if (cards.length === 0)
    return (
      <EmptyState
        tag="Empty"
        title="Your bag is empty."
        className="mx-auto w-full max-w-md"
        action={
          <div className="flex flex-col items-center gap-1">
            <ButtonLink href="/search">Start exploring</ButtonLink>
            <ButtonLink href="/drops" variant="ghost" size="sm" className="!h-11">
              See upcoming drops
            </ButtonLink>
          </div>
        }
      >
        Every piece here is one of one. Find one that deserves a second life.
      </EmptyState>
    );
  const stores = [...new Set(cards.map((c) => c.sellerHandle))];
  return (
    <div className="flex flex-col gap-4">
      {stores.map((handle) => {
        const items = cards.filter((c) => c.sellerHandle === handle);
        return (
          <section key={handle} aria-label={items[0]!.sellerName} className="card flex flex-col gap-4 p-4 lg:p-5">
            <Link href={`/s/${handle}`} className="flex min-h-11 items-center gap-2.5 no-underline">
              <StoreInitials name={items[0]!.sellerName} />
              <span className="t-h3 grow">{items[0]!.sellerName}</span>
            </Link>
            <ul className="flex flex-col gap-4">
              {items.map((c) => (
                <BagLine key={c.id} item={{ ...c, meta: c.tagSize ?? "", buyable: c.status === "AVAILABLE" }} />
              ))}
            </ul>
          </section>
        );
      })}
      <ButtonLink href="/login?next=/bag&for=checkout" size="lg" block>
        Sign in to check out
      </ButtonLink>
    </div>
  );
}
