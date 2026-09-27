import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Buyer protection and refunds" };

export default function BuyerProtectionPage() {
  return (
    <>
      <h1>Buyer protection and refunds</h1>
      <p>Every YOLT order is prepaid through the payment gateway and covered by buyer protection. No DMs, no personal UPI QR codes.</p>

      <h2>No size returns</h2>
      <p>
        Items are secondhand and one of a kind, so we don&apos;t accept returns because something doesn&apos;t fit. Every listing
        shows measurements and says whether chest and waist were measured flat or all the way around. Please compare them
        with clothes you own before buying.
      </p>

      <h2>You get a full refund when</h2>
      <ul>
        <li>the item <strong>isn&apos;t as described</strong> (for example, a flaw that wasn&apos;t shown or mentioned);</li>
        <li>it <strong>arrives damaged</strong>;</li>
        <li>you receive the <strong>wrong item</strong>; or</li>
        <li>it <strong>never arrives</strong>.</li>
      </ul>

      <h2>How to report a problem</h2>
      <ul>
        <li>Open the order in <Link href="/orders">Your orders</Link> and tap <strong>Report a problem</strong>.</li>
        <li>Report within <strong>48 hours of delivery</strong>, with photos of the problem. For a parcel that never arrives, you can report it 10 days after it shipped.</li>
        <li>The seller can refund you straight away, or dispute your report. If they dispute it, YOLT reviews both sides and decides.</li>
        <li>Refunds go back to your original payment method, for the full amount you paid including shipping.</li>
      </ul>

      <h2>Late dispatch</h2>
      <p>If a seller hasn&apos;t shipped your order 48 hours after the dispatch date shown on it, you can cancel it for a full refund from the order page.</p>

      <h2>If a payment goes wrong</h2>
      <p>
        If you&apos;re charged after your reservation ended and the item went to someone else, we refund you automatically. You
        never need to pay twice: if a payment is still processing, the checkout page tells you so.
      </p>
    </>
  );
}
