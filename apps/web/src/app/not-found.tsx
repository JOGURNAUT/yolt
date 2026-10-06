import type { Metadata } from "next";
import { SystemPage } from "@/components/system/system-page";
import { ButtonLink } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** NotFoundDesktop and the mobile 404: the search is the way back to something real. */
export default function NotFound() {
  return (
    <SystemPage
      tag="404"
      title="This page wandered off"
      actions={
        <>
          <SearchBar className="w-full" />
          <ButtonLink href="/" size="lg" block>
            Back to home
          </ButtonLink>
          <ButtonLink href="/drops" variant="ghost" size="sm" className="!h-11">
            See upcoming drops
          </ButtonLink>
        </>
      }
    >
      <p>The link may be old, or mistyped. Search for what you were after, or head home.</p>
    </SystemPage>
  );
}
