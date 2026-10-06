import type { Metadata } from "next";
import { SystemPage } from "@/components/system/system-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Back soon", robots: { index: false } };

/** SysMaintenance: shown while we're updating. Orders and payments already in flight are not affected. */
export default function MaintenancePage() {
  return (
    <SystemPage
      tag="Brb"
      title="Back soon"
      actions={
        <ButtonLink href="/" variant="secondary" size="lg" block>
          Try the home page
        </ButtonLink>
      }
    >
      <p>We&rsquo;re making YOLT better. Nothing is lost: your bag, saved pieces and orders are exactly as you left them.</p>
    </SystemPage>
  );
}
