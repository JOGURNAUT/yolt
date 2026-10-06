import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, Store, Ticket, Wallet } from "lucide-react";
import { ApplyForm } from "@/components/seller/apply-form";
import { ICON_STROKE } from "@/components/ui/cx";
import { Sticker } from "@/components/ui/sticker";
import { getCurrentSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sell on YOLT" };

const PERKS = [
  { icon: Wallet, t: "Prepaid orders only", b: "Buyers pay before you pack. No COD, no chasing screenshots." },
  { icon: Store, t: "₹0 commission in the pilot", b: "You get the full price. Buyers pay shipping separately." },
  { icon: Ticket, t: "Drops built in", b: "Schedule a drop, followers get reminded, first to claim pays within 5 minutes." },
  { icon: Link2, t: "Your store, your link", b: "Put it in your Instagram bio. Buyers who come through it are yours." },
];

const STEPS = [
  ["Apply", "Tell us about your store. We reply on WhatsApp within 1 working day."],
  ["We set you up", "YOLT staff verify you and open your store with you while we pilot."],
  ["List and sell", "Add pieces with real measurements and honest flaws. Ship when an order lands."],
];

const RULES = [
  "Photos are of the exact piece, flaws included.",
  "Measurements are real, in centimetres.",
  "You ship within the time you promise.",
  "No size returns: a buyer is refunded when a piece isn't as described.",
];

export default async function SellPage() {
  if (await getCurrentSeller()) redirect("/seller");
  return (
    <div className="mx-auto max-w-[1120px] space-y-10 lg:space-y-14">
      <section className="band-dark flex flex-col gap-3.5 rounded-3xl p-6 lg:p-12">
        <Sticker className="self-start">For thrift stores</Sticker>
        <h1 className="t-display max-w-[760px] text-white">Give your pieces a second life, without the DMs.</h1>
        <p className="t-body-lg max-w-[560px] text-[#e4e2dc]">
          YOLT is invite-only while we pilot with a small group of thrift stores. Buyers pay through YOLT, so there are no screenshots or UPI IDs to chase.
        </p>
        <a href="#apply" className="btn btn-lg self-start bg-white text-[#0d0d0c] shadow-[3px_3px_0_0_#c8b6ff]">
          Apply to sell
        </a>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-12">
        <div className="space-y-10">
          <section aria-labelledby="perks-h" className="space-y-4">
            <h2 id="perks-h" className="t-h2">
              What you get
            </h2>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {PERKS.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[#0d0d0c]">
                    <p.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
                  </span>
                  <span className="t-small flex flex-col gap-0.5 pt-0.5">
                    <strong>{p.t}</strong>
                    <span className="muted">{p.b}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="how-h" className="space-y-4">
            <h2 id="how-h" className="t-h2">
              How it works
            </h2>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {STEPS.map(([t, b], i) => (
                <li key={t} className="card flex items-start gap-3 p-4">
                  <span className="t-mono flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">{i + 1}</span>
                  <span className="t-small flex flex-col gap-0.5">
                    <strong>{t}</strong>
                    <span className="muted">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="rules-h" className="space-y-3">
            <h2 id="rules-h" className="t-h2">
              What sellers agree to
            </h2>
            <ul className="t-small m-0 flex list-disc flex-col gap-1.5 pl-5">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="t-small muted">
              Questions? See the{" "}
              <Link href="/legal/terms" className="font-bold">
                terms
              </Link>{" "}
              or write to YOLT support.
            </p>
          </section>
        </div>

        <div id="apply" className="scroll-mt-24 lg:sticky lg:top-24">
          <ApplyForm />
        </div>
      </div>
    </div>
  );
}
