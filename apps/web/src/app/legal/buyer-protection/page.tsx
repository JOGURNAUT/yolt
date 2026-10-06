import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Package, ShieldCheck, Truck, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { Sticker } from "@/components/ui/sticker";

export const metadata: Metadata = { title: "Buyer protection and refunds" };

const COVERED = [
  { icon: CircleCheck, t: "It isn't as described", b: "A flaw, size label, measurement or detail that the listing didn't show or got wrong." },
  { icon: Package, t: "It arrives damaged", b: "Torn, stained or broken in transit. Show the parcel in your photos." },
  { icon: Truck, t: "It never arrives", b: "Not delivered, or not shipped within 48 h of the ship-by date. Cancel in one tap." },
  { icon: Package, t: "It's the wrong item", b: "You received a different piece from the one you bought." },
];

const NOT_COVERED = [
  { t: "It doesn't fit.", b: "Every listing has flat measurements. Compare them with a piece you own." },
  { t: "You changed your mind.", b: "Each piece is one of one, so sales are final once it matches the listing." },
  { t: "A flaw that was shown.", b: "If it's in the photos or the flaw list, it was described." },
];

const HOW = [
  { t: "Report within 48 h of delivery", b: "From the order page. Pick the reason, describe it and add photos. For a parcel that never arrives, you can report it 10 days after it shipped." },
  { t: "The seller responds", b: "They can accept and refund, or reply with their side." },
  { t: "If you disagree, YOLT decides", b: "We review both sides against this policy." },
  { t: "Refund to how you paid", b: "Item and shipping, in full." },
];

export default function BuyerProtectionPage() {
  return (
    <div className="not-prose flex flex-col gap-7">
      <section className="flex flex-col gap-3">
        <Sticker tone="accent" className="self-start">
          Buyer protection
        </Sticker>
        <h1 className="t-display">One of one, covered.</h1>
        <div className="flex items-start gap-3 rounded-lg bg-[#0d0d0c] p-4 text-white">
          <ShieldCheck aria-hidden className="ic ic-24 shrink-0 text-accent" strokeWidth={ICON_STROKE} />
          <p className="t-body font-semibold">No size returns: check the measurements. Full refund if it isn&apos;t as described, arrives damaged, or never arrives.</p>
        </div>
        <p className="t-small muted">On every order paid on YOLT. No fees, no extra cost. Every order is prepaid through the payment gateway: no DMs, no personal UPI QR codes.</p>
      </section>

      <section aria-labelledby="cv-h" className="flex flex-col gap-3">
        <h2 id="cv-h" className="t-h2 !mt-0">
          Covered: full refund
        </h2>
        {COVERED.map((c) => (
          <div key={c.t} className="card flex items-start gap-3 p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
              <c.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="t-h3 !text-[15px]">{c.t}</span>
              <span className="t-small muted">{c.b}</span>
            </span>
          </div>
        ))}
      </section>

      <section aria-labelledby="nc-h" className="flex flex-col gap-3">
        <h2 id="nc-h" className="t-h2 !mt-0">
          Not covered
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {NOT_COVERED.map((n) => (
            <li key={n.t} className="t-small !ml-0 flex items-start gap-2.5 !list-none">
              <X aria-hidden className="ic ic-16 mt-px shrink-0" strokeWidth={ICON_STROKE} />
              <span>
                <strong>{n.t}</strong> {n.b}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hw-h" className="flex flex-col gap-3">
        <h2 id="hw-h" className="t-h2 !mt-0">
          How it works
        </h2>
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {HOW.map((h, i) => (
            <li key={h.t} className="!ml-0 flex items-start gap-3 !list-none">
              <span className="t-mono flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground !text-[13px] text-background">{i + 1}</span>
              <span className="flex flex-col gap-0.5 pt-[3px]">
                <span className="t-small font-bold">{h.t}</span>
                <span className="t-small muted">{h.b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ld-h" className="flex flex-col gap-2 rounded-lg bg-surface-2 p-4">
        <h2 id="ld-h" className="t-h3 !mt-0 !normal-case" style={{ fontFamily: "var(--font-body)", fontStretch: "100%" }}>
          Late dispatch and payments
        </h2>
        <p className="t-small">
          If a seller hasn&apos;t shipped your order 48 hours after the dispatch date shown on it, you can cancel it for a full refund from the order page. If you&apos;re charged after your reservation ended and the item went to someone else, we refund you
          automatically. If a payment is still processing, the checkout page tells you so: never pay twice.
        </p>
      </section>

      <section aria-labelledby="ab-h" className="flex flex-col gap-2 rounded-lg bg-surface-2 p-4">
        <h2 id="ab-h" className="t-h3 !mt-0 !normal-case" style={{ fontFamily: "var(--font-body)", fontStretch: "100%" }}>
          About sellers and brands
        </h2>
        <p className="t-small">
          &quot;Identity verified&quot; means YOLT checked the seller&apos;s PAN and bank account. Items are not authenticated by YOLT. Brands are declared by sellers, and every listing shows its measurements and flaws in photos.
        </p>
      </section>

      <ButtonLink href="/orders" size="lg" block>
        Report a problem with an order
      </ButtonLink>
      <p className="t-caption muted !font-medium">
        Questions? See the <Link href="/legal/grievance">grievance officer</Link> page, or the <Link href="/legal/terms">Terms</Link>.
      </p>
    </div>
  );
}
