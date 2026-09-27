import "server-only";

/**
 * Details the Consumer Protection (E-Commerce) Rules 2020 require us to display, and that the
 * DPDP Act requires in the privacy notice. Set them as env vars per deployment; production's
 * health check fails until they're present. Outside production, missing values show as
 * visible placeholders rather than invented details.
 */
const value = (key: string, label: string) => process.env[key]?.trim() || `[${label} — set ${key}]`;

export function legalDetails() {
  return {
    entityName: value("LEGAL_ENTITY_NAME", "Registered company name"),
    address: value("LEGAL_ADDRESS", "Registered office address"),
    cin: process.env.LEGAL_CIN?.trim() || null,
    supportEmail: value("SUPPORT_EMAIL", "Support email"),
    grievanceOfficer: value("GRIEVANCE_OFFICER_NAME", "Grievance officer name"),
    grievanceEmail: value("GRIEVANCE_EMAIL", "Grievance email"),
    grievancePhone: process.env.GRIEVANCE_PHONE?.trim() || null,
    lastUpdated: "27 September 2026",
  };
}

export const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of use" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/buyer-protection", label: "Buyer protection and refunds" },
  { href: "/legal/grievance", label: "Grievances and contact" },
] as const;
