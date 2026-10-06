"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, ShoppingBag } from "lucide-react";
import { useShop } from "./shop-state";
import { Button, ButtonLink } from "./ui/button";
import { cx, ICON_STROKE } from "./ui/cx";
import { IconButton, IconLink } from "./ui/icon-button";

const SPARK = "M12 2 C12 8 16 12 22 12 C16 12 12 16 12 22 C12 16 8 12 2 12 C8 12 12 8 12 2 Z";
const SPARKS = [
  ["s1", "--accent-2"],
  ["s2", "--accent"],
  ["s3", "--accent-2"],
] as const;

/** Heart on product cards and pages (board C4). Works for guests (kept on this device). */
export function SaveButton({ listingId, className = "", variant = "card" }: { listingId: string; className?: string; variant?: "card" | "bar" }) {
  const { isSaved, toggleSave } = useShop();
  const saved = isSaved(listingId);
  const [pop, setPop] = useState(false);
  if (variant === "bar") {
    // The product page's own round button: same names and behaviour, filled heart when saved.
    return (
      <IconButton
        label={saved ? "Remove from saved" : "Save"}
        aria-pressed={saved}
        onClick={() => void toggleSave(listingId)}
        className={cx("!size-[50px] lg:!size-14", className)}
      >
        <Heart aria-hidden className="ic" strokeWidth={ICON_STROKE} style={{ fill: saved ? "var(--foreground)" : "none" }} />
      </IconButton>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save"}
      onClick={(e) => {
        e.preventDefault(); // cards are links
        e.stopPropagation();
        setPop(!saved); // the pop and sparkle play when saving, not when removing
        void toggleSave(listingId);
      }}
      className={cx("heart", saved && "is-saved", pop && saved && "pop", className)}
    >
      <span className="dot">
        <Heart aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
      </span>
      {SPARKS.map(([cls, color]) => (
        <svg key={cls} className={`spark ${cls}`} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: `var(${color})` }}>
          <path d={SPARK} />
        </svg>
      ))}
    </button>
  );
}

const BAG_ERRORS: Record<string, string> = {
  BAG_FULL: "Your bag is full (30 pieces). Check out or remove something first.",
  NOT_FOUND: "This piece isn't available.",
};

/** "Add to bag" on product pages. Adding never reserves the piece. */
export function AddToBagButton({
  listingId,
  size = "lg",
  onError,
  className,
}: {
  listingId: string;
  size?: "md" | "lg";
  /** When given, a failure is reported here instead of printed under the button. */
  onError?: (message: string | null) => void;
  className?: string;
}) {
  const { inBag, addToBag } = useShop();
  const [error, setError] = useState<string | null>(null);
  if (inBag(listingId)) {
    return (
      <ButtonLink href="/bag" variant="secondary" size={size} block className={className}>
        In your bag · View bag
      </ButtonLink>
    );
  }
  return (
    <div className={cx("space-y-1", className)}>
      <Button
        variant="secondary"
        size={size}
        block
        onClick={async () => {
          const r = await addToBag(listingId);
          const message = r.ok ? null : (BAG_ERRORS[r.error ?? ""] ?? "Couldn't add to bag.");
          if (onError) onError(message);
          else setError(message);
        }}
      >
        Add to bag
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/**
 * The card's hover bar (board C4): a pointer-only shortcut for Add to bag, or Find similar on sold
 * pieces. Phones never show it, and it stays out of the accessibility tree and tab order because
 * the product page it sits on top of has the real buttons.
 */
export function CardAction({ listingId, category, mode }: { listingId: string; category: string; mode: "add" | "similar" }) {
  const router = useRouter();
  const { inBag, addToBag } = useShop();
  const label = mode === "similar" ? "Find similar" : inBag(listingId) ? "In your bag" : "Add to bag";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className="add"
      onClick={(e) => {
        e.preventDefault(); // cards are links
        e.stopPropagation();
        if (mode === "similar") router.push(`/search?cat=${category}`);
        else if (inBag(listingId)) router.push("/bag");
        else void addToBag(listingId);
      }}
    >
      {mode === "add" && <ShoppingBag aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />}
      {label}
    </button>
  );
}

/** Header link with the bag count. */
export function BagLink() {
  const { bagCount } = useShop();
  return (
    <IconLink href="/bag" plain count={bagCount} label={`Bag, ${bagCount} ${bagCount === 1 ? "piece" : "pieces"}`}>
      <ShoppingBag aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
    </IconLink>
  );
}
