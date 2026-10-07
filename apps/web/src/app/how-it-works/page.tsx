import type { Metadata } from "next";
import { Camera, Hand, ShieldCheck, Truck, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { Sticker } from "@/components/ui/sticker";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  { icon: Camera, t: "Find a piece", b: "Every listing is one of one, with flat measurements and every flaw photographed. A Sold out pill stays on pieces that are gone." },
  { icon: Hand, t: "Claim it", b: "Tap Buy now and the piece is held for you for 5 minutes, so nobody else can buy it while you pay. In a drop, the first to claim gets it." },
  { icon: Wallet, t: "Pay through YOLT", b: "Prepaid only, no COD. Pay in the app and never to a personal UPI QR. YOLT holds the money until the order is on its way." },
  { icon: Truck, t: "It ships, you track it", b: "The store packs and ships within the time it promised. You see the tracking on your order page." },
  { icon: ShieldCheck, t: "Covered if it's wrong", b: "No size returns, so check the measurements. A full refund if it isn't as described, arrives damaged or never arrives." },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <Sticker tone="accent" className="self-start">
          How it works
        </Sticker>
        <h1 className="t-display">Thrift without the DMs.</h1>
        <p className="t-body-lg text-muted">YOLT puts the best Instagram thrift stores in one place, with real measurements and safe, prepaid checkout.</p>
      </section>
      <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {STEPS.map((s, i) => (
          <li key={s.t} className="flex items-start gap-4 bg-background p-4 lg:p-5">
            <span aria-hidden="true" className="t-display !text-[28px] !leading-[28px] text-foreground">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="t-h3 flex items-center gap-2">
                <s.icon aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
                {s.t}
              </h2>
              <p className="t-body text-muted">{s.b}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/search?sort=newest" variant="primary">
          Shop new arrivals
        </ButtonLink>
        <ButtonLink href="/legal/buyer-protection" variant="ghost">
          Read buyer protection
        </ButtonLink>
        <ButtonLink href="/sell" variant="ghost">
          Sell on YOLT
        </ButtonLink>
      </div>
    </div>
  );
}
