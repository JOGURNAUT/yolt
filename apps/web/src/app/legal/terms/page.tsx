import type { Metadata } from "next";
import Link from "next/link";
import { legalDetails } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  const l = legalDetails();
  return (
    <>
      <h1>Terms of use</h1>
      <p>
        YOLT is an online marketplace operated by <strong>{l.entityName}</strong> ({l.address}
        {l.cin && `, CIN ${l.cin}`}). Independent sellers list secondhand items on YOLT; buyers purchase them from those
        sellers. By using YOLT you agree to these terms.
      </p>

      <h2>1. Our role</h2>
      <ul>
        <li>YOLT is a marketplace. Each item is sold by the seller named on its page, who owns it and ships it.</li>
        <li>We provide the platform, process payments through a regulated payment gateway, and run buyer protection (see below).</li>
        <li>Each store page shows the seller&apos;s name, the state they ship from, their rating, and how to reach customer care, in line with the Consumer Protection (E-Commerce) Rules, 2020.</li>
      </ul>

      <h2>2. Accounts</h2>
      <ul>
        <li>You sign in with an Indian mobile number and a one-time code. Keep access to your phone secure.</li>
        <li>One person, one account. We may suspend accounts used for fraud, abuse or to get around these terms.</li>
      </ul>

      <h2>3. Listings and items</h2>
      <ul>
        <li>Items are secondhand and one of a kind. Sellers must show real photos of the actual item, list every flaw they know of, and give honest measurements.</li>
        <li>Brands are <strong>declared by the seller</strong>. YOLT does not authenticate items unless a listing says so explicitly.</li>
        <li>Prohibited: counterfeit goods, stolen goods, items that are unsafe or illegal to sell, and misleading listings.</li>
      </ul>

      <h2>4. Buying</h2>
      <ul>
        <li>Adding an item to your bag doesn&apos;t reserve it. At checkout the item is reserved for you for a few minutes while you pay.</li>
        <li>Payment is prepaid through the payment gateway. Prices include the item; shipping is shown before you pay. YOLT charges buyers no platform fee.</li>
        <li>
          There are <strong>no size returns</strong>. If an item isn&apos;t as described, arrives damaged, is the wrong item or never
          arrives, you&apos;re covered by <Link href="/legal/buyer-protection">buyer protection</Link>.
        </li>
      </ul>

      <h2>5. Selling</h2>
      <ul>
        <li>Sellers are verified (PAN and bank account) before their items can go live.</li>
        <li>Sellers must dispatch within the time shown on their store, keep their stock accurate, and respond to buyer-protection claims.</li>
        <li>Fees for sellers, if any, are shown before they apply. There is no commission on sales to a seller&apos;s own followers who arrive through the seller&apos;s share link.</li>
      </ul>

      <h2>6. Liability</h2>
      <p>
        We work to keep YOLT accurate and available but don&apos;t guarantee uninterrupted service. Nothing in these terms limits
        rights you have under Indian consumer protection law.
      </p>

      <h2>7. Changes and disputes</h2>
      <ul>
        <li>We&apos;ll post changes to these terms here and tell you about significant changes before they apply.</li>
        <li>These terms are governed by the laws of India. For complaints, contact our <Link href="/legal/grievance">grievance officer</Link> first.</li>
      </ul>
    </>
  );
}
