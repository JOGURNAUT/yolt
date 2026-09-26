"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatINR } from "@/lib/format";
import { AddressStep } from "./address-step";

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
  shippingAddress: { name: string; line1: string; city: string; pincode: string } | null;
  items: { listingId: string; title: string; tagSize: string | null; pricePaise: number }[];
};

type Session = { providerOrderId: string; holdExpiresAt: string; resumed: boolean };

export function CheckoutView({ orderId, sandbox }: { orderId: string; sandbox: boolean }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
    if (res.ok) setOrder((await res.json()) as Order);
    else setError(res.status === 401 ? "Sign in to see this order." : "Order not found.");
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

  if (error) return <p className="py-10 text-center text-muted">{error}</p>;
  if (!order) return <p className="py-10 text-center text-muted">Loading…</p>;

  const expiresAt = session?.holdExpiresAt ?? order.holdExpiresAt;
  const secondsLeft = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  const expired = order.status === "EXPIRED" || (order.status === "AWAITING_PAYMENT" && expiresAt !== null && secondsLeft === 0);

  async function pay() {
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setSession((await res.json()) as Session);
      await load();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
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

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">
        {order.status === "CONFIRMED" ? "Order confirmed" : "Checkout"}{" "}
        <span className="text-sm font-normal text-muted">{order.reference}</span>
      </h1>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {order.items.map((i) => (
          <li key={i.listingId} className="flex justify-between p-3 text-sm">
            <span>
              {i.title}
              {i.tagSize && <span className="text-muted"> · {i.tagSize}</span>}
            </span>
            <span>{formatINR(i.pricePaise)}</span>
          </li>
        ))}
        <li className="flex justify-between p-3 text-sm text-muted">
          <span>Shipping</span>
          <span>{order.shippingPaise ? formatINR(order.shippingPaise) : "Free"}</span>
        </li>
        <li className="flex justify-between p-3 font-semibold">
          <span>Total</span>
          <span>{formatINR(order.totalPaise)}</span>
        </li>
      </ul>

      <div role="status" aria-live="polite" className="space-y-3">
        {order.status === "CONFIRMED" && (
          <p className="rounded-md bg-surface p-4 text-sm">
            Paid.{" "}
            <Link href={`/orders/${order.id}`} className="underline">
              Track your order
            </Link>
            . The seller has been told to pack it
            {order.dispatchBy && <> — ships by {new Date(order.dispatchBy).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>}
            .
          </p>
        )}
        {order.status === "NEEDS_REFUND" && (
          <p className="rounded-md bg-surface p-4 text-sm">
            Your payment arrived after the reservation ended and the piece went to someone else. A full refund has been
            started automatically.
          </p>
        )}
        {order.status === "CANCELLED_BY_BUYER" && <p className="text-sm text-muted">You left checkout. The item is back in stock.</p>}
        {expired && order.status !== "CONFIRMED" && (
          <p className="text-sm text-muted">Your reservation ran out, so the item went back on sale.</p>
        )}

        {order.status === "AWAITING_PAYMENT" && !expired && (
          <>
            <p className="text-sm">
              Reserved for you for{" "}
              <span className="font-mono font-semibold">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
            </p>
            <AddressStep orderId={orderId} current={order.shippingAddress} locked={paying} onChosen={load} />
            {paying ? (
              <p className="text-sm text-muted">Checking your payment — don&apos;t pay again.</p>
            ) : (
              <button
                type="button"
                onClick={pay}
                disabled={busy || !order.shippingAddress}
                className="w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-60"
              >
                Pay {formatINR(order.totalPaise)}
              </button>
            )}
            {order.payment === "FAILED" && !paying && <p className="text-sm text-danger">Payment failed. You can try again.</p>}
            {sandbox && paying && session && (
              <div className="rounded-lg border border-dashed border-line p-3 text-sm">
                <p className="mb-2 text-muted">Sandbox gateway (development only)</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => simulate("success")} disabled={busy} className="flex-1 rounded-full border border-line py-2">
                    Approve payment
                  </button>
                  <button type="button" onClick={() => simulate("failure")} disabled={busy} className="flex-1 rounded-full border border-line py-2">
                    Fail payment
                  </button>
                </div>
              </div>
            )}
            {!paying && (
              <button type="button" onClick={cancel} className="w-full text-sm text-muted underline">
                Leave checkout and release the item
              </button>
            )}
          </>
        )}
      </div>

      <Link href="/" className="block text-center text-sm underline">
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
