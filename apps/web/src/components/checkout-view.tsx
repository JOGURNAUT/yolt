"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { formatIndianMobile } from "@yolt/shared";
import { formatINR } from "@/lib/format";
import { AddressStep } from "./address-step";
import { HoldTimer } from "./checkout/hold-timer";
import { PaymentStatus } from "./checkout/payment-status";
import { PriceSummary } from "./checkout/price-summary";
import { SnapshotLine } from "./checkout/snapshot-line";
import { useInstallPrompt } from "./system/install-prompt";
import { SessionExpired } from "./system/session-expired";
import { ProtectionNote } from "./product/detail-blocks";
import { Button, ButtonLink } from "./ui/button";
import { ICON_STROKE } from "./ui/cx";

type Order = {
  id: string;
  reference: string;
  status: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  dispatchBy: string | null;
  holdExpiresAt: string | null;
  payment: string | null;
  shippingAddress: { name: string; phone?: string; line1: string; line2?: string | null; city: string; state?: string; pincode: string } | null;
  items: { listingId: string; title: string; tagSize: string | null; condition?: string; category?: string; photoUrl?: string | null; pricePaise: number }[];
};

const SIGNED_OUT = "signed-out";

type Session = { providerOrderId: string; holdExpiresAt: string; resumed: boolean };
type Context = { sellerName: string; sellerHandle: string; slugs: Record<string, string> };

const dispatchDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function CheckoutView({ orderId, sandbox, context }: { orderId: string; sandbox: boolean; context: Context }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [changing, setChanging] = useState(false);
  const [eta, setEta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const { showInstallHint } = useInstallPrompt();

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
    if (res.ok) setOrder((await res.json()) as Order);
    else setError(res.status === 401 ? SIGNED_OUT : "Order not found.");
  }, [orderId]);

  useEffect(() => {
    // Initial fetch; setState happens after the await, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // While a payment is in flight, poll: the webhook, not this page, decides the outcome.
  const paying = order?.payment === "PENDING" || order?.payment === "UNKNOWN";
  useEffect(() => {
    if (!paying) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [paying, load]);

  // After an order, offer the home-screen card (once per cool-down, and only where install works).
  const confirmed = order?.status === "CONFIRMED";
  useEffect(() => {
    if (confirmed) showInstallHint("order");
  }, [confirmed, showInstallHint]);

  if (error === SIGNED_OUT) return <SessionExpired next={`/checkout/${orderId}`} />;
  if (error) return <p className="py-10 text-center text-muted">{error}</p>;
  if (!order) return <p className="py-10 text-center text-muted">Loading…</p>;

  const expiresAt = session?.holdExpiresAt ?? order.holdExpiresAt;
  const secondsLeft = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  const expired = order.status === "EXPIRED" || (order.status === "AWAITING_PAYMENT" && expiresAt !== null && secondsLeft === 0 && !paying);
  const first = order.items[0];
  const back = first && context.slugs[first.listingId] ? `/p/${context.slugs[first.listingId]}` : "/search";

  async function pay() {
    setBusy(true);
    setPayError(null);
    const res = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setSession((await res.json()) as Session);
      await load();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setPayError(
        body.error === "HOLD_EXPIRED"
          ? "Your reservation ran out before payment started."
          : body.error === "ADDRESS_REQUIRED"
            ? "Choose a delivery address first."
            : "Couldn't start payment.",
      );
    }
  }

  async function simulate(outcome: "success" | "failure") {
    if (!session) return;
    setBusy(true);
    await fetch("/api/dev/sandbox/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerOrderId: session.providerOrderId, outcome }),
    });
    setBusy(false);
    if (outcome === "failure") setSession(null);
    await load();
  }

  async function cancel() {
    await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
    await load();
  }

  const heading = (
    <h1 className="t-h1 flex items-baseline gap-3">
      {order.status === "CONFIRMED" ? "Order confirmed" : "Checkout"}
      <span className="t-mono muted !text-[13px]">{order.reference}</span>
    </h1>
  );

  // ---- Outcomes that end checkout ----
  if (order.status === "CONFIRMED") {
    const a = order.shippingAddress;
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="sr-only">{heading}</div>
        <PaymentStatus kind="success" big title="They're yours." body="Your payment went through and the seller has been told to pack it.">
          <div className="card flex w-full flex-col gap-3 p-4 text-left">
            {order.items.map((i) => (
              <SnapshotLine key={i.listingId} item={i} thumb={52} />
            ))}
            <div className="t-small flex flex-col gap-1.5 border-t border-line pt-3">
              <span>
                <strong>Order</strong> <span className="t-mono !text-[13px]">{order.reference}</span> · {formatINR(order.totalPaise)} paid
              </span>
              {a && (
                <span>
                  <strong>Delivering to</strong> {a.line1}, {a.city} {a.pincode}
                </span>
              )}
              {order.dispatchBy && (
                <span className="muted">
                  Ships by {dispatchDay(order.dispatchBy)}. If {context.sellerName} misses that by 48 h, you can cancel for a full refund in one tap.
                </span>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-2.5 pt-2">
            <ButtonLink href={`/orders/${order.id}`} size="lg" block>
              View order
            </ButtonLink>
            <ButtonLink href="/search" variant="ghost" size="sm" className="!h-11">
              Keep exploring
            </ButtonLink>
          </div>
        </PaymentStatus>
      </div>
    );
  }
  if (order.status === "NEEDS_REFUND") {
    return (
      <PaymentStatus
        kind="refund"
        title="Your payment arrived after the reservation ended and the piece went to someone else. A full refund has started."
        body="Usually back in your account in 5–7 working days."
      >
        <div className="flex w-full flex-col items-center gap-2.5">
          <ButtonLink href="/orders" variant="secondary" size="lg" block>
            Track refund
          </ButtonLink>
          <ButtonLink href="/search" variant="ghost" size="sm" className="!h-11">
            Find something similar
          </ButtonLink>
        </div>
      </PaymentStatus>
    );
  }
  if (order.status === "CANCELLED_BY_BUYER") {
    return (
      <PaymentStatus kind="left" title="You left checkout. The piece is back in stock." body="You weren't charged.">
        <ButtonLink href="/bag" variant="secondary" size="lg" block>
          Back to bag
        </ButtonLink>
      </PaymentStatus>
    );
  }
  if (expired) {
    return (
      <PaymentStatus kind="expired" title="Your reservation ran out, so the piece went back on sale." body="You weren't charged.">
        <ButtonLink href={back} variant="secondary" size="lg" block>
          Back to the piece
        </ButtonLink>
      </PaymentStatus>
    );
  }
  if (order.status !== "AWAITING_PAYMENT") {
    return (
      <PaymentStatus kind="left" title="This order isn't open for payment." body="Check your orders for where it stands.">
        <ButtonLink href="/orders" variant="secondary" size="lg" block>
          Your orders
        </ButtonLink>
      </PaymentStatus>
    );
  }

  // ---- Awaiting payment ----
  const a = order.shippingAddress;
  const showAddress = !a || changing;
  const summary = (
    <section aria-labelledby="sum-h" className="card flex flex-col gap-4 p-4 lg:p-6">
      <h2 id="sum-h" className="t-h2">
        From {context.sellerName}
      </h2>
      <div className="flex flex-col gap-3">
        {order.items.map((i) => (
          <SnapshotLine key={i.listingId} item={i} href={context.slugs[i.listingId] ? `/p/${context.slugs[i.listingId]}` : undefined} />
        ))}
      </div>
      <div className="border-t border-line pt-3">
        <PriceSummary itemCount={order.items.length} subtotalPaise={order.subtotalPaise} shippingPaise={order.shippingPaise} totalPaise={order.totalPaise} />
      </div>
      <p className="t-small muted">No fees. Prepaid only. We confirm your order only after the payment provider does.</p>
    </section>
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      {heading}
      <HoldTimer secondsLeft={secondsLeft} />

      {paying ? (
        <PaymentStatus kind="processing" title="Checking your payment. Don't pay again." body="This can take up to a minute. Keep this page open.">
          {sandbox && session && (
            <div className="w-full rounded-lg border border-dashed border-line p-3 text-left text-sm">
              <p className="mb-2 text-muted">Sandbox gateway (development only)</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => simulate("success")} disabled={busy} className="flex-1">
                  Approve payment
                </Button>
                <Button variant="secondary" onClick={() => simulate("failure")} disabled={busy} className="flex-1">
                  Fail payment
                </Button>
              </div>
            </div>
          )}
        </PaymentStatus>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col gap-5">
            {showAddress ? (
              <AddressStep
                orderId={orderId}
                listingId={first!.listingId}
                currentPincode={a?.pincode ?? null}
                onCancel={a ? () => setChanging(false) : undefined}
                onChosen={(e) => {
                  setEta(e);
                  setChanging(false);
                  void load();
                }}
              />
            ) : (
              a && (
                <section aria-label="Delivery address" className="card flex items-start gap-3 p-4">
                  <MapPin aria-hidden className="ic mt-0.5 shrink-0" strokeWidth={ICON_STROKE} />
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <h2 className="t-small !font-bold !normal-case !tracking-normal" style={{ fontFamily: "var(--font-body)", fontStretch: "100%" }}>
                      Deliver to {a.name}
                    </h2>
                    <span className="t-small">
                      {[a.line1, a.line2].filter(Boolean).join(", ")}, {a.city}
                      {a.state ? `, ${a.state}` : ""} {a.pincode}
                    </span>
                    <span className="t-small muted">{[a.phone ? formatIndianMobile(a.phone) : null, eta].filter(Boolean).join(" · ")}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="!h-11 !p-0" onClick={() => setChanging(true)}>
                    Change
                  </Button>
                </section>
              )
            )}
            {!showAddress && <div className="lg:hidden">{summary}</div>}
          </div>

          {!showAddress && (
            <div className="flex flex-col gap-4">
              <div className="hidden lg:block">{summary}</div>
              <ProtectionNote />
              {order.payment === "FAILED" && (
                <PaymentStatus kind="failed" title="Payment failed. You can try again." body={`Your piece is still reserved for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}.`} />
              )}
              <Button size="lg" block onClick={pay} loading={busy} disabled={!order.shippingAddress}>
                {order.payment === "FAILED" ? `Try again · ${formatINR(order.totalPaise)}` : `Pay ${formatINR(order.totalPaise)}`}
              </Button>
              {payError && (
                <p role="alert" className="help err">
                  {payError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!paying && (
        <button type="button" onClick={cancel} className="btn btn-ghost btn-sm !h-11 self-center !p-0">
          Leave checkout and release the item
        </button>
      )}
      <Link href="/search" className="t-small block text-center underline">
        Keep browsing
      </Link>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
