import type { Metadata } from "next";
import { legalDetails } from "@/lib/legal";

export const metadata: Metadata = { title: "Grievances and contact" };

export default function GrievancePage() {
  const l = legalDetails();
  return (
    <>
      <h1>Grievances and contact</h1>

      <h2>Operator</h2>
      <p>
        <strong>{l.entityName}</strong>
        <br />
        {l.address}
        {l.cin && (
          <>
            <br />
            CIN {l.cin}
          </>
        )}
      </p>

      <h2>Customer support</h2>
      <p>
        For help with an order, use <strong>Report a problem</strong> on the order page, or email <strong>{l.supportEmail}</strong>.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {l.grievanceOfficer}
        <br />
        Email: <strong>{l.grievanceEmail}</strong>
        {l.grievancePhone && (
          <>
            <br />
            Phone: {l.grievancePhone}
          </>
        )}
      </p>
      <p>
        We acknowledge every complaint within <strong>48 hours</strong> and resolve it within <strong>one month</strong> of receiving
        it, as required by the Consumer Protection (E-Commerce) Rules, 2020. Please include your order reference (for example,
        YL-7Q4K2M).
      </p>
    </>
  );
}
