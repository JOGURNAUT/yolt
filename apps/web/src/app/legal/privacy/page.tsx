import type { Metadata } from "next";
import { legalDetails } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const l = legalDetails();
  return (
    <>
      <h1>Privacy notice</h1>
      <p>
        This notice explains what personal data <strong>{l.entityName}</strong> (&quot;YOLT&quot;) collects, why, and your rights
        under the Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li><strong>Mobile number</strong>: to sign you in with a one-time code and to contact you about orders.</li>
        <li><strong>Delivery addresses</strong>: to ship your orders. Your address is shared with the seller and courier for that order only.</li>
        <li><strong>Orders and payments</strong>: to process purchases, refunds and disputes. Card and UPI details are handled by the payment gateway; we don&apos;t store them.</li>
        <li><strong>Photos you upload</strong> (listings, reviews, problem reports): shown for their purpose. We remove location data (GPS) from every photo when it&apos;s uploaded.</li>
        <li><strong>How you arrived</strong>: whether you first came through a seller&apos;s link, to credit that seller fairly.</li>
        <li><strong>Security data</strong>: hashed IP addresses and login sessions, to prevent abuse. Login codes are stored only in hashed form.</li>
        <li><strong>For sellers</strong>: PAN and bank details for verification and payouts, handled with our payment partner.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell your personal data.</li>
        <li>We don&apos;t send phone numbers, addresses, payment details or your photos to analytics tools.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Only with those needed to complete your order or keep YOLT running: the seller you buy from, couriers, our payment
        gateway, our SMS/WhatsApp provider for login codes, and our hosting and storage providers, all under contracts that limit
        their use of your data.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Order and payment records: as long as tax and consumer-protection law requires.</li>
        <li>Everything else: while your account is active, and deleted or anonymised after you ask us to delete your account, except what we must keep by law.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or erase your personal data, withdraw consent, or nominate someone to act for you. Write to{" "}
        <strong>{l.grievanceEmail}</strong>. We&apos;ll respond within the time the law requires.
      </p>
    </>
  );
}
